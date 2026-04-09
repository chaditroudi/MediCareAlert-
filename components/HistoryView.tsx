
import React, { useState, useMemo, useEffect } from 'react';
import { Medication, Prescription } from '../types';

const API_BASE = 'http://localhost:5000/api';

interface HistoryViewProps {
  medications: Medication[];
  token?: string;
}

const HistoryView: React.FC<HistoryViewProps> = ({ medications, token }) => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'taken' | 'missed'>('all');
  const [activeTab, setActiveTab] = useState<'doses' | 'prescriptions'>('doses');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  const allHistory = useMemo(() => {
    let entries = medications.flatMap(m => m.history.map(h => ({ ...h, medName: m.name })))
      .sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime());

    if (dateFrom) entries = entries.filter(e => e.date >= dateFrom);
    if (dateTo) entries = entries.filter(e => e.date <= dateTo);
    if (statusFilter !== 'all') entries = entries.filter(e => e.status === statusFilter);

    return entries;
  }, [medications, dateFrom, dateTo, statusFilter]);

  const totalEntries = medications.flatMap(m => m.history).length;
  const takenCount = medications.flatMap(m => m.history).filter(h => h.status === 'taken').length;
  const missedCount = medications.flatMap(m => m.history).filter(h => h.status === 'missed').length;
  const adherencePercent = totalEntries > 0 ? Math.round((takenCount / totalEntries) * 100) : 0;

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/prescriptions`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setPrescriptions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h2 className="text-3xl font-black text-slate-900 mb-2">Historique des Prises</h2>
        <p className="text-slate-500 font-medium">Suivi de votre adhérence au traitement</p>
      </div>

      {/* Adherence Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-3xl font-black text-slate-900">{totalEntries}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total Prises</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-3xl font-black text-emerald-600">{takenCount}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Prises Complétées</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-3xl font-black text-red-600">{missedCount}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Prises Manquées</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center relative overflow-hidden">
          <div className="text-3xl font-black text-blue-600">{adherencePercent}%</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Adhérence</p>
          <div className="absolute bottom-0 left-0 h-1.5 bg-blue-600 transition-all duration-700" style={{ width: `${adherencePercent}%` }}></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('doses')}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'doses' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'}`}
        >
          <i className="fas fa-pills mr-2"></i>Historique Prises
        </button>
        <button
          onClick={() => setActiveTab('prescriptions')}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'prescriptions' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'}`}
        >
          <i className="fas fa-file-prescription mr-2"></i>Ordonnances ({prescriptions.length})
        </button>
      </div>

      {activeTab === 'doses' && (<>
      {/* Filters */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Statut</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
          >
            <option value="all">Tous</option>
            <option value="taken">Complétées</option>
            <option value="missed">Manquées</option>
          </select>
        </div>
        {(dateFrom || dateTo || statusFilter !== 'all') && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('all'); }}
            className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-100 transition"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        {allHistory.length === 0 ? (
          <div className="p-20 text-center text-slate-300">
             <i className="fas fa-clock-rotate-left text-6xl mb-6 opacity-20"></i>
             <p className="text-xl font-bold">Aucun historique disponible pour le moment.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Date & Heure</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Médicament</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allHistory.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition duration-300">
                  <td className="px-8 py-6">
                    <span className="font-bold text-slate-800">{new Date(entry.date).toLocaleDateString('fr-FR')}</span>
                    <span className="ml-3 text-slate-400 text-sm font-medium">{entry.time}</span>
                  </td>
                  <td className="px-8 py-6 font-black text-slate-900">{entry.medName}</td>
                  <td className="px-8 py-6 text-slate-500 font-medium">
                    {entry.status === 'missed' ? 'Dose manquée' : 'Dose prise par le patient'}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className={`px-4 py-1.5 text-xs font-black rounded-full ${
                      entry.status === 'missed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {entry.status === 'missed' ? 'MANQUÉ' : 'COMPLÉTÉ'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}

      {activeTab === 'prescriptions' && (
        <div className="space-y-4">
          {prescriptions.length === 0 ? (
            <div className="p-16 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <i className="fas fa-file-prescription text-5xl text-slate-200 mb-4"></i>
              <p className="text-lg font-bold text-slate-400">Aucune ordonnance scannée.</p>
            </div>
          ) : (
            prescriptions.map((rx) => (
              <div key={rx.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <i className="fas fa-file-medical text-xl"></i>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">Ordonnance</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(rx.createdAt).toLocaleDateString('fr-FR')} — {new Date(rx.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    rx.status === 'processed' ? 'bg-emerald-100 text-emerald-700' :
                    rx.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {rx.status === 'processed' ? 'Traité' : rx.status === 'failed' ? 'Échec' : 'En cours'}
                  </span>
                </div>
                {rx.extractedData?.medications?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {rx.extractedData.medications.map((med, idx) => (
                      <div key={idx} className="px-4 py-3 bg-slate-50 rounded-xl flex items-center gap-4">
                        <i className="fas fa-capsules text-blue-500"></i>
                        <div className="flex-1">
                          <span className="font-black text-slate-900 text-sm">{med.name}</span>
                          <span className="text-slate-400 text-xs ml-2">{med.dosage} • {med.frequency}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{med.durationInDays}j</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default HistoryView;
