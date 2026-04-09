import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Pharmacy, User, UserRole } from '../types';

const API_BASE = 'http://localhost:5000/api';
const SOCKET_BASE = API_BASE.replace(/\/api$/, '');

interface PatientRequest {
  id: string;
  patientId: string;
  pharmacyId: string;
  medicationName: string;
  note: string;
  status: 'pending' | 'confirmed' | 'out_of_stock' | 'resolved';
  createdAt: string;
  patientName?: string;
  patientEmail?: string;
  pharmacyName?: string;
  pharmacyAddress?: string;
}

interface ChatReadReceipt {
  userId: string;
  role: UserRole | 'ADMIN';
  readAt: string;
}

interface ChatMessage {
  id: string;
  requestId: string;
  patientId: string;
  pharmacyId: string;
  senderId: string;
  senderRole: UserRole | 'ADMIN';
  senderName: string;
  text: string;
  readBy: ChatReadReceipt[];
  createdAt: string;
}

interface RequestsManagerProps {
  user: User;
  token: string;
}

const STATUS_CONFIG: Record<PatientRequest['status'], { label: string; color: string; icon: string }> = {
  pending: { label: 'En attente', color: 'bg-amber-100 text-amber-700', icon: 'fa-clock' },
  confirmed: { label: 'Confirmé', color: 'bg-emerald-100 text-emerald-700', icon: 'fa-check-circle' },
  out_of_stock: { label: 'Rupture', color: 'bg-red-100 text-red-700', icon: 'fa-times-circle' },
  resolved: { label: 'Résolu', color: 'bg-blue-100 text-blue-700', icon: 'fa-check-double' },
};

const RequestsManager: React.FC<RequestsManagerProps> = ({ user, token }) => {
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ pharmacyId: '', medicationName: '', note: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [chatError, setChatError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const socketRef = useRef<Socket | null>(null);
  const previousRoomRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedRequestIdRef = useRef('');

  const isPatient = user.role === UserRole.PATIENT;
  const isPharmacist = user.role === UserRole.PHARMACIST;

  const upsertRequest = useCallback((incoming: PatientRequest) => {
    setRequests((prev) => {
      const existing = prev.find((request) => request.id === incoming.id);
      const next = existing
        ? prev.map((request) => (request.id === incoming.id ? { ...request, ...incoming } : request))
        : [incoming, ...prev];

      return [...next].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, []);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setRequestError('');

    try {
      const res = await fetch(`${API_BASE}/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch requests (${res.status})`);
      }
      const data = await res.json();
      const nextRequests = Array.isArray(data) ? data : [];
      setRequests(nextRequests);
      setSelectedRequestId((prev) => prev || nextRequests[0]?.id || '');
    } catch (error) {
      console.error('Failed to fetch requests', error);
      setRequestError('Impossible de charger les demandes.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const fetchPharmacies = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pharmacies`);
      const data = await res.json();
      setPharmacies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch pharmacies', error);
    }
  }, []);

  const fetchMessages = useCallback(async (requestId: string) => {
    if (!requestId) {
      setMessages([]);
      return;
    }

    setIsChatLoading(true);
    setChatError('');

    try {
      const res = await fetch(`${API_BASE}/requests/${requestId}/chat/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch messages (${res.status})`);
      }
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
      setUnreadCounts((prev) => ({ ...prev, [requestId]: 0 }));
      await fetch(`${API_BASE}/requests/${requestId}/chat/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error('Failed to fetch chat messages', error);
      setChatError('Impossible de charger les messages.');
    } finally {
      setIsChatLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRequests();
    if (isPatient) {
      fetchPharmacies();
    }
  }, [fetchRequests, fetchPharmacies, isPatient]);

  useEffect(() => {
    selectedRequestIdRef.current = selectedRequestId;
  }, [selectedRequestId]);

  useEffect(() => {
    const socket = io(SOCKET_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      if (selectedRequestIdRef.current) {
        socket.emit('chat:join', { requestId: selectedRequestIdRef.current });
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('request:created', (request: PatientRequest) => {
      upsertRequest(request);
      setSelectedRequestId((prev) => prev || request.id);
    });

    socket.on('request:updated', (request: PatientRequest) => {
      upsertRequest(request);
    });

    socket.on('chat:message', (message: ChatMessage) => {
      if (message.requestId === selectedRequestIdRef.current) {
        setMessages((prev) => (
          prev.some((existing) => existing.id === message.id) ? prev : [...prev, message]
        ));
        socket.emit('chat:read', { requestId: message.requestId });
      } else if (message.senderId !== user.id) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.requestId]: (prev[message.requestId] || 0) + 1,
        }));
      }
    });

    socket.on('chat:read', ({ requestId, userId, role, readAt }) => {
      if (requestId !== selectedRequestIdRef.current) {
        return;
      }

      setMessages((prev) =>
        prev.map((message) => {
          if (message.senderId === userId || message.readBy.some((entry) => entry.userId === userId)) {
            return message;
          }
          return {
            ...message,
            readBy: [...message.readBy, { userId, role, readAt }],
          };
        })
      );
    });

    socket.on('chat:error', ({ message }: { message: string }) => {
      setChatError(message || 'Erreur temps réel.');
    });

    return () => {
      if (selectedRequestIdRef.current) {
        socket.emit('chat:leave', { requestId: selectedRequestIdRef.current });
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, upsertRequest, user.id]);

  useEffect(() => {
    if (!selectedRequestId) {
      return;
    }

    fetchMessages(selectedRequestId);

    if (socketRef.current) {
      if (previousRoomRef.current && previousRoomRef.current !== selectedRequestId) {
        socketRef.current.emit('chat:leave', { requestId: previousRoomRef.current });
      }
      socketRef.current.emit('chat:join', { requestId: selectedRequestId });
      previousRoomRef.current = selectedRequestId;
    }
  }, [fetchMessages, selectedRequestId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.pharmacyId || !formData.medicationName) {
      return;
    }

    setIsSubmitting(true);
    setRequestError('');

    try {
      const res = await fetch(`${API_BASE}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(`Failed to create request (${res.status})`);
      }

      const created = await res.json();
      upsertRequest(created);
      setSelectedRequestId(created.id);
      setFormData({ pharmacyId: '', medicationName: '', note: '' });
      setShowForm(false);
      setUnreadCounts((prev) => ({ ...prev, [created.id]: 0 }));
    } catch (error) {
      console.error('Failed to create request', error);
      setRequestError('Impossible d’envoyer la demande.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, status: PatientRequest['status']) => {
    try {
      const res = await fetch(`${API_BASE}/requests/${requestId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update request (${res.status})`);
      }

      const updated = await res.json();
      upsertRequest(updated);
    } catch (error) {
      console.error('Failed to update request status', error);
      setRequestError('Impossible de mettre à jour le statut.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRequestId || !messageDraft.trim()) {
      return;
    }

    setIsSendingMessage(true);
    setChatError('');

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:send', { requestId: selectedRequestId, text: messageDraft.trim() });
      } else {
        const res = await fetch(`${API_BASE}/requests/${selectedRequestId}/chat/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: messageDraft.trim() }),
        });

        if (!res.ok) {
          throw new Error(`Failed to send message (${res.status})`);
        }

        const created = await res.json();
        setMessages((prev) => (prev.some((message) => message.id === created.id) ? prev : [...prev, created]));
      }

      setMessageDraft('');
    } catch (error) {
      console.error('Failed to send message', error);
      setChatError('Impossible d’envoyer le message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {isPatient ? 'Demandes Et Chat Pharmacie' : 'Demandes Patients En Direct'}
          </h2>
          <p className="text-slate-500 font-medium">
            {isPatient
              ? 'Créez une demande puis discutez en temps réel avec la pharmacie.'
              : 'Répondez aux patients et gérez chaque demande sans quitter la conversation.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest ${socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            <i className={`fas ${socketConnected ? 'fa-signal' : 'fa-plug-circle-xmark'} mr-2`}></i>
            {socketConnected ? 'Realtime Connected' : 'Realtime Reconnecting'}
          </div>
          {isPatient && (
            <button
              onClick={() => setShowForm((prev) => !prev)}
              className="px-6 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition flex items-center gap-3 active:scale-95"
            >
              <i className="fas fa-plus"></i>
              Nouvelle Demande
            </button>
          )}
        </div>
      </div>

      {requestError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-semibold">
          {requestError}
        </div>
      )}

      {showForm && isPatient && (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 animate-in fade-in duration-300">
          <h3 className="text-xl font-black text-slate-900">Nouvelle Demande</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Pharmacie</label>
              <select
                value={formData.pharmacyId}
                onChange={(e) => setFormData((prev) => ({ ...prev, pharmacyId: e.target.value }))}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                required
              >
                <option value="">Sélectionner une pharmacie</option>
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.name} — {pharmacy.address}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Médicament</label>
              <input
                type="text"
                value={formData.medicationName}
                onChange={(e) => setFormData((prev) => ({ ...prev, medicationName: e.target.value }))}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                placeholder="ex: Paracétamol 500mg"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Note (optionnel)</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold resize-none"
              placeholder="Information supplémentaire..."
              rows={2}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition disabled:opacity-50 shadow-lg"
            >
              {isSubmitting ? 'Envoi...' : 'Envoyer La Demande'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-8 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-[720px]">
        <div className="xl:col-span-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center">
              <span className="text-3xl font-black text-slate-900">{requests.length}</span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total</p>
            </div>
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center">
              <span className="text-3xl font-black text-amber-600">{requests.filter((request) => request.status === 'pending').length}</span>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">En attente</p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="p-16 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <i className="fas fa-comments text-5xl text-slate-200 mb-4"></i>
              <p className="text-lg font-bold text-slate-400">
                {isPatient ? 'Aucune demande pour le moment.' : 'Aucune demande patient disponible.'}
              </p>
            </div>
          ) : (
            requests.map((request) => {
              const statusConf = STATUS_CONFIG[request.status];
              const unreadCount = unreadCounts[request.id] || 0;
              const isSelected = request.id === selectedRequestId;

              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setSelectedRequestId(request.id)}
                  className={`w-full text-left bg-white p-6 rounded-[2rem] shadow-sm border transition ${isSelected ? 'border-blue-500 shadow-lg' : 'border-slate-100 hover:border-blue-300'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h4 className="text-lg font-black text-slate-900">{request.medicationName}</h4>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusConf.color}`}>
                          <i className={`fas ${statusConf.icon} mr-1`}></i>
                          {statusConf.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 font-medium">
                        {isPatient ? request.pharmacyName || 'Pharmacie' : request.patientName || 'Patient'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {isPatient ? request.pharmacyAddress : request.patientEmail}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <span className="w-7 h-7 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {request.note && (
                    <p className="mt-3 text-sm text-slate-500 italic line-clamp-2">{request.note}</p>
                  )}
                  <p className="mt-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    {new Date(request.createdAt).toLocaleDateString('fr-FR')} · {new Date(request.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              );
            })
          )}
        </div>

        <div className="xl:col-span-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col min-h-[720px] overflow-hidden">
          {selectedRequest ? (
            <>
              <div className="border-b border-slate-100 p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-black text-slate-900">{selectedRequest.medicationName}</h3>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_CONFIG[selectedRequest.status].color}`}>
                        {STATUS_CONFIG[selectedRequest.status].label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      {isPatient
                        ? `${selectedRequest.pharmacyName || 'Pharmacie'} • ${selectedRequest.pharmacyAddress || ''}`
                        : `${selectedRequest.patientName || 'Patient'} • ${selectedRequest.patientEmail || ''}`}
                    </p>
                    {selectedRequest.note && (
                      <p className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                        {selectedRequest.note}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isPharmacist && selectedRequest.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'confirmed')}
                          className="px-4 py-3 bg-emerald-600 text-white text-xs font-black rounded-2xl hover:bg-emerald-700 transition"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(selectedRequest.id, 'out_of_stock')}
                          className="px-4 py-3 bg-red-600 text-white text-xs font-black rounded-2xl hover:bg-red-700 transition"
                        >
                          Rupture
                        </button>
                      </>
                    )}
                    {isPharmacist && selectedRequest.status === 'confirmed' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedRequest.id, 'resolved')}
                        className="px-4 py-3 bg-blue-600 text-white text-xs font-black rounded-2xl hover:bg-blue-700 transition"
                      >
                        Marquer Résolu
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 bg-slate-50/70">
                  {isChatLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                      <i className="fas fa-comments text-5xl text-slate-200 mb-4"></i>
                      <p className="text-lg font-black text-slate-700">Commencez la conversation</p>
                      <p className="text-sm text-slate-500 font-medium mt-2">
                        Les messages envoyés ici apparaissent en direct pour le patient et la pharmacie.
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isMine = message.senderId === user.id;
                      const readByOther = message.readBy.some((entry) => entry.userId !== user.id);

                      return (
                        <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-[2rem] px-5 py-4 shadow-sm ${isMine ? 'bg-blue-600 text-white' : 'bg-white border border-slate-100 text-slate-800'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-[11px] font-black uppercase tracking-widest ${isMine ? 'text-blue-100' : 'text-slate-400'}`}>
                                {message.senderName}
                              </span>
                              <span className={`text-[10px] font-black uppercase tracking-widest ${isMine ? 'text-blue-200' : 'text-slate-300'}`}>
                                {new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm font-medium whitespace-pre-wrap">{message.text}</p>
                            {isMine && (
                              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-right text-blue-100">
                                {readByOther ? 'Vu' : 'Envoyé'}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-slate-100 p-5 md:p-6 bg-white">
                  {chatError && (
                    <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-semibold">
                      {chatError}
                    </div>
                  )}
                  <form onSubmit={handleSendMessage} className="flex flex-col md:flex-row gap-3">
                    <textarea
                      value={messageDraft}
                      onChange={(e) => setMessageDraft(e.target.value)}
                      placeholder="Écrire un message en temps réel..."
                      className="flex-1 px-5 py-4 bg-slate-50 border border-slate-100 rounded-[1.75rem] outline-none resize-none font-medium text-slate-700"
                      rows={2}
                    />
                    <button
                      type="submit"
                      disabled={isSendingMessage || !messageDraft.trim()}
                      className="px-6 py-4 bg-blue-600 text-white font-black rounded-[1.75rem] hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                      {isSendingMessage ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-paper-plane"></i>}
                      Envoyer
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <i className="fas fa-comments text-6xl text-slate-200 mb-5"></i>
              <p className="text-2xl font-black text-slate-800">Sélectionnez une demande</p>
              <p className="mt-2 text-sm font-medium text-slate-500">
                Chaque demande contient maintenant sa propre discussion temps réel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestsManager;
