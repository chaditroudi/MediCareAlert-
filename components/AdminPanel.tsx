import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, UserRole, Pharmacy } from '../types';

interface AdminPanelProps {
  token: string;
}

interface TrendPoint { _id: string; count: number }
interface TopPharmacy { pharmacyName: string; requestCount: number }
interface TopMedication { name: string; count: number; activeCount: number }
interface AdherenceTrendPoint { _id: string; taken: number; missed: number }
interface HeatmapPoint { _id: { day: number; hour: number }; count: number }
interface InventoryHealthItem { pharmacyName: string; total: number; outOfStock: number; low: number; expired: number; available: number; issueCount: number }
interface FrequencyItem { frequency: string; count: number }
interface RecentUser { id: string; name: string; email: string; role: string; createdAt: string; isActive: boolean }
interface ComparisonData { thisWeek: number; lastWeek: number; change: number }
interface MonthComparisonData { thisMonth: number; lastMonth: number; change: number }

interface AnalyticsData {
  users: { total: number; active: number; patients: number; pharmacists: number; admins: number };
  pharmacies: { total: number; active: number; inactive: number };
  medications: { total: number; active: number; inactive: number };
  prescriptions: { total: number; processed: number; failed: number; pending: number; successRate: number; avgConfidence: number; avgProcessingTime: number; totalMedsExtracted: number };
  requests: { total: number; pending: number; confirmed: number; outOfStock: number; resolved: number; resolutionRate: number; avgResolutionHours: number };
  inventory: { total: number; available: number; low: number; outOfStock: number; expired: number; healthScore: number };
  categories: { total: number };
  growth: { users: TrendPoint[]; requests: TrendPoint[]; prescriptions: TrendPoint[]; medications: TrendPoint[] };
  weeklyComparison: { users: ComparisonData; requests: ComparisonData; prescriptions: ComparisonData; medications: ComparisonData };
  monthlyComparison: { users: MonthComparisonData; requests: MonthComparisonData };
  topMedications: TopMedication[];
  topPharmacies: TopPharmacy[];
  adherence: { taken: number; missed: number; rate: number; trend: AdherenceTrendPoint[] };
  inventoryHealth: InventoryHealthItem[];
  activityHeatmap: HeatmapPoint[];
  requestFlow: { _id: { month: string; status: string }; count: number }[];
  frequencyDistribution: FrequencyItem[];
  recentUsers: RecentUser[];
}

// Legacy stats interface for backward compatibility with admin/stats endpoint
interface AdminStats {
  users: number;
  totalUsers: number;
  patients: number;
  pharmacists: number;
  admins: number;
  pharmacies: number;
  totalPharmacies: number;
  prescriptions: number;
  processedPrescriptions: number;
  activeMeds: number;
  totalMeds: number;
  pendingRequests: number;
  totalRequests: number;
  confirmedRequests: number;
  outOfStockRequests: number;
  totalInventoryItems: number;
  outOfStockItems: number;
  totalCategories: number;
  userTrend?: TrendPoint[];
  requestTrend?: TrendPoint[];
  prescriptionTrend?: TrendPoint[];
  topPharmacies?: TopPharmacy[];
  inventoryBreakdown?: { _id: string; count: number }[];
}

interface MedicationCategory {
  id: string;
  name: string;
  description?: string;
  isActive?: boolean;
}

interface PatientRequest {
  id: string;
  patientId: string;
  pharmacyId: string;
  medicationName: string;
  note: string;
  status: string;
  createdAt: string;
}

interface KafkaEvent {
  id: string;
  topic: string;
  action: string;
  data: Record<string, any>;
  result: 'processed' | 'skipped' | 'error';
  detail?: string;
  timestamp: string;
}
interface KafkaTopicStat { total: number; lastAt: string; errors: number }
interface KafkaStats {
  connected: boolean;
  topics: string[];
  topicStats: Record<string, KafkaTopicStat>;
  totalProcessed: number;
}

const API_BASE = 'http://localhost:5000/api';
type AdminTab = 'dashboard' | 'users' | 'pharmacies' | 'requests' | 'categories' | 'kafka';

// ─── Role config ──────────────────────────────────────────────────────
const ROLE_CONFIG = {
  PATIENT:    { label: 'Patient',     color: 'from-blue-500 to-cyan-500',    badge: 'bg-blue-100 text-blue-700 border-blue-200',    icon: 'fa-user' },
  PHARMACIST: { label: 'Pharmacien',  color: 'from-violet-500 to-purple-600', badge: 'bg-violet-100 text-violet-700 border-violet-200', icon: 'fa-user-nurse' },
  ADMIN:      { label: 'Admin',       color: 'from-amber-500 to-orange-500',  badge: 'bg-amber-100 text-amber-700 border-amber-200',  icon: 'fa-user-shield' },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string; icon: string }> = {
  pending:     { label: 'En attente',  badge: 'bg-amber-100 text-amber-700 border-amber-200',    dot: 'bg-amber-500',   icon: 'fa-clock' },
  confirmed:   { label: 'Confirmé',    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: 'fa-check-circle' },
  out_of_stock:{ label: 'Rupture',     badge: 'bg-red-100 text-red-700 border-red-200',           dot: 'bg-red-500',     icon: 'fa-xmark-circle' },
  resolved:    { label: 'Résolu',      badge: 'bg-sky-100 text-sky-700 border-sky-200',            dot: 'bg-sky-500',     icon: 'fa-check-double' },
};

// ─── Main Component ───────────────────────────────────────────────────
const AdminPanel: React.FC<AdminPanelProps> = ({ token }) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [requests, setRequests] = useState<PatientRequest[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [categories, setCategories] = useState<MedicationCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [pharmacyQuery, setPharmacyQuery] = useState('');
  const [requestFilter, setRequestFilter] = useState<string>('all');
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [newPharmacy, setNewPharmacy] = useState({ name: '', address: '', phone: '', lat: 36.8065, lng: 10.1815, services: '' });
  const [assignModal, setAssignModal] = useState<{ userId: string; userName: string } | null>(null);
  const [assignPharmacyId, setAssignPharmacyId] = useState('');
  const [createUserModal, setCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'PATIENT' as string });
  const [editUserModal, setEditUserModal] = useState<User | null>(null);
  const [editUserData, setEditUserData] = useState({ name: '', email: '' });
  const [resetPwModal, setResetPwModal] = useState<{ id: string; name: string } | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [editPharmacyModal, setEditPharmacyModal] = useState<Pharmacy | null>(null);
  const [editPharmacyData, setEditPharmacyData] = useState({ name: '', address: '', phone: '', services: '' });
  const [editCategoryModal, setEditCategoryModal] = useState<MedicationCategory | null>(null);
  const [editCatData, setEditCatData] = useState({ name: '', description: '' });

  // Kafka monitor state
  const [kafkaEvents, setKafkaEvents] = useState<KafkaEvent[]>([]);
  const [kafkaStats, setKafkaStats] = useState<KafkaStats | null>(null);
  const [kafkaTopicFilter, setKafkaTopicFilter] = useState<string>('all');
  const [kafkaLive, setKafkaLive] = useState(true);
  const kafkaEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }), [token]);

  const flash = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const authOnly = { Authorization: `Bearer ${token}` };
      const [usersRes, statsRes, categoriesRes, pharmaciesRes, requestsRes, analyticsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users`, { headers: authOnly }),
        fetch(`${API_BASE}/admin/stats`, { headers: authOnly }),
        fetch(`${API_BASE}/admin/categories`, { headers: authOnly }),
        fetch(`${API_BASE}/admin/pharmacies`, { headers: authOnly }),
        fetch(`${API_BASE}/admin/requests`, { headers: authOnly }),
        fetch(`${API_BASE}/analytics/admin`, { headers: authOnly }),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (categoriesRes.ok) setCategories(await categoriesRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (pharmaciesRes.ok) {
        setPharmacies(await pharmaciesRes.json());
      } else {
        const fallback = await fetch(`${API_BASE}/pharmacies`);
        if (fallback.ok) setPharmacies(await fallback.json());
      }
      if (requestsRes.ok) setRequests(await requestsRes.json());
      setLastRefreshAt(new Date());
    } catch (err) {
      console.error('Admin fetch failed', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Kafka fetch & real-time listener ──────────────────────────────
  const fetchKafka = useCallback(async () => {
    const authOnly = { Authorization: `Bearer ${token}` };
    try {
      const [evRes, stRes] = await Promise.all([
        fetch(`${API_BASE}/kafka/events?limit=200`, { headers: authOnly }),
        fetch(`${API_BASE}/kafka/stats`, { headers: authOnly }),
      ]);
      if (evRes.ok) { const d = await evRes.json(); setKafkaEvents(d.events ?? []); }
      if (stRes.ok) setKafkaStats(await stRes.json());
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    if (tab === 'kafka') fetchKafka();
  }, [tab, fetchKafka]);

  // Socket.io listener for live Kafka events
  useEffect(() => {
    if (tab !== 'kafka' || !kafkaLive) return;
    let ws: any;
    try {
      // @ts-ignore — io is loaded globally by socket.io client
      ws = (window as any).io?.('http://localhost:5000', { auth: { token }, transports: ['websocket'] });
    } catch { return; }
    if (!ws) return;
    const handler = (ev: KafkaEvent) => {
      setKafkaEvents(prev => [ev, ...prev].slice(0, 500));
      setKafkaStats(prev => prev ? { ...prev, totalProcessed: prev.totalProcessed + 1 } : prev);
    };
    ws.on('kafka:event', handler);
    return () => { ws.off('kafka:event', handler); ws.disconnect(); };
  }, [tab, kafkaLive, token]);

  // ─── User actions ─────────────────────────────────────────────────
  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { method: 'POST', headers: authHeaders, body: JSON.stringify(newUser) });
      const data = await res.json();
      if (!res.ok) { flash('error', data.error || 'Échec'); return; }
      flash('success', `Utilisateur "${newUser.name}" créé avec succès !`);
      setNewUser({ name: '', email: '', password: '', role: 'PATIENT' });
      setCreateUserModal(false);
      fetchAll();
    } catch { flash('error', 'Erreur réseau.'); }
  };

  const updateUserRole = async (id: string, role: UserRole) => {
    await fetch(`${API_BASE}/admin/users/${id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ role }) });
    fetchAll();
  };

  const toggleUserActive = async (id: string, current: boolean) => {
    await fetch(`${API_BASE}/admin/users/${id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ isActive: !current }) });
    fetchAll();
  };

  const handleEditUser = async () => {
    if (!editUserModal) return;
    const res = await fetch(`${API_BASE}/admin/users/${editUserModal.id}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify(editUserData) });
    const data = await res.json();
    if (!res.ok) { flash('error', data.error || 'Erreur'); return; }
    flash('success', 'Utilisateur modifié.');
    setEditUserModal(null);
    fetchAll();
  };

  const handleResetPassword = async () => {
    if (!resetPwModal || resetPwValue.length < 6) { flash('error', 'Minimum 6 caractères'); return; }
    const res = await fetch(`${API_BASE}/admin/users/${resetPwModal.id}/reset-password`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ newPassword: resetPwValue }) });
    const data = await res.json();
    if (!res.ok) { flash('error', data.error || 'Erreur'); return; }
    flash('success', `Mot de passe réinitialisé pour ${resetPwModal.name}`);
    setResetPwModal(null);
    setResetPwValue('');
  };

  const deleteUser = async (id: string, name: string) => {
    if (!confirm(`Supprimer définitivement l'utilisateur "${name}" et toutes ses données ?`)) return;
    await fetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE', headers: authHeaders });
    fetchAll();
  };

  const assignPharmacy = async () => {
    if (!assignModal || !assignPharmacyId) return;
    await fetch(`${API_BASE}/admin/users/${assignModal.userId}`, {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ pharmacyId: assignPharmacyId, role: 'PHARMACIST' })
    });
    setAssignModal(null);
    setAssignPharmacyId('');
    fetchAll();
  };

  // ─── Pharmacy actions ──────────────────────────────────────────────
  
  const createPharmacy = async () => {
    if (!newPharmacy.name || !newPharmacy.address) return;
    try {
      const res = await fetch(`${API_BASE}/pharmacies`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          name: newPharmacy.name, address: newPharmacy.address, phone: newPharmacy.phone,
          location: { lat: Number(newPharmacy.lat), lng: Number(newPharmacy.lng) },
          services: newPharmacy.services.split(',').map(s => s.trim()).filter(Boolean)
        })
      });
      const data = await res.json();
      if (!res.ok) { flash('error', data.error || 'Échec'); return; }
      flash('success', `Pharmacie "${newPharmacy.name}" créée !`);
      setNewPharmacy({ name: '', address: '', phone: '', lat: 36.8065, lng: 10.1815, services: '' });
      fetchAll();
    } catch { flash('error', 'Erreur réseau.'); }
  };

  const handleEditPharmacy = async () => {
    if (!editPharmacyModal) return;
    const res = await fetch(`${API_BASE}/admin/pharmacies/${editPharmacyModal.id}`, {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({
        name: editPharmacyData.name, address: editPharmacyData.address,
        phone: editPharmacyData.phone,
        services: editPharmacyData.services.split(',').map(s => s.trim()).filter(Boolean)
      })
    });
    if (!res.ok) { flash('error', 'Échec de la modification'); return; }
    flash('success', 'Pharmacie modifiée.');
    setEditPharmacyModal(null);
    fetchAll();
  };

  const togglePharmacyActive = async (id: string) => {
    await fetch(`${API_BASE}/admin/pharmacies/${id}/toggle`, { method: 'PATCH', headers: authHeaders });
    fetchAll();
  };

  const deletePharmacy = async (id: string, name: string) => {
    if (!confirm(`Supprimer la pharmacie "${name}" et tout son inventaire ?`)) return;
    await fetch(`${API_BASE}/admin/pharmacies/${id}`, { method: 'DELETE', headers: authHeaders });
    fetchAll();
  };

  // ─── Category actions ──────────────────────────────────────────────
  const createCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/admin/categories`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ name: newCategory.trim(), description: newCategoryDesc.trim() })
      });
      const data = await res.json();
      if (!res.ok) { flash('error', data.error || 'Échec'); return; }
      flash('success', 'Catégorie créée !');
      setNewCategory('');
      setNewCategoryDesc('');
      fetchAll();
    } catch { flash('error', 'Erreur réseau.'); }
  };

  const handleEditCategory = async () => {
    if (!editCategoryModal) return;
    const res = await fetch(`${API_BASE}/admin/categories/${editCategoryModal.id}`, {
      method: 'PATCH', headers: authHeaders, body: JSON.stringify(editCatData)
    });
    if (!res.ok) { flash('error', 'Échec'); return; }
    flash('success', 'Catégorie modifiée.');
    setEditCategoryModal(null);
    fetchAll();
  };

  const toggleCategory = async (id: string) => {
    await fetch(`${API_BASE}/admin/categories/${id}/toggle`, { method: 'PATCH', headers: authHeaders });
    fetchAll();
  };

  const deleteCategory = async (id: string, name: string) => {
    if (!confirm(`Supprimer la catégorie "${name}" ?`)) return;
    await fetch(`${API_BASE}/admin/categories/${id}`, { method: 'DELETE', headers: authHeaders });
    fetchAll();
  };

  // ─── Request actions ───────────────────────────────────────────────
  const updateRequestStatus = async (id: string, status: string) => {
    await fetch(`${API_BASE}/requests/${id}/status`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status }) });
    fetchAll();
  };

  // ─── Filters ──────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let result = users;
    if (userRoleFilter !== 'all') result = result.filter(u => u.role === userRoleFilter);
    if (userQuery.trim()) {
      const q = userQuery.toLowerCase();
      result = result.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return result;
  }, [users, userQuery, userRoleFilter]);

  const filteredPharmacies = useMemo(() => {
    if (!pharmacyQuery.trim()) return pharmacies;
    const q = pharmacyQuery.toLowerCase();
    return pharmacies.filter(p => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
  }, [pharmacies, pharmacyQuery]);

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'all') return requests;
    return requests.filter(r => r.status === requestFilter);
  }, [requests, requestFilter]);

  // ─── Loading ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-80 gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
          <div className="absolute inset-3 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <i className="fas fa-shield-halved text-white text-sm"></i>
          </div>
        </div>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Chargement du panneau admin…</p>
      </div>
    );
  }

  const TABS: { key: AdminTab; label: string; icon: string; count?: number; color: string }[] = [
    { key: 'dashboard',  label: 'Vue d\'ensemble', icon: 'fa-gauge-high',    color: 'from-blue-500 to-indigo-600',   count: undefined },
    { key: 'users',      label: 'Utilisateurs',    icon: 'fa-users',          color: 'from-violet-500 to-purple-600', count: users.length },
    { key: 'pharmacies', label: 'Pharmacies',       icon: 'fa-hospital',       color: 'from-emerald-500 to-teal-600',  count: pharmacies.length },
    { key: 'requests',   label: 'Demandes',         icon: 'fa-inbox',          color: 'from-amber-500 to-orange-500',  count: stats?.pendingRequests },
    { key: 'categories', label: 'Catégories',       icon: 'fa-tags',           color: 'from-rose-500 to-pink-600',     count: categories.length },
    { key: 'kafka',      label: 'Kafka Monitor',    icon: 'fa-bolt',           color: 'from-cyan-500 to-blue-600',     count: kafkaStats?.totalProcessed },
  ];

  const activeTab = TABS.find(t => t.key === tab)!;
  const activeUsers = users.filter(u => u.isActive !== false).length;
  const inactiveUsers = Math.max(users.length - activeUsers, 0);
  const unassignedPharmacists = users.filter(u => u.role === UserRole.PHARMACIST && !u.pharmacyId).length;
  const inactivePharmacies = pharmacies.filter(p => p.isActive === false).length;
  const requestPressure = (stats?.totalRequests ?? 0) > 0
    ? Math.round(((stats?.pendingRequests ?? 0) / (stats?.totalRequests ?? 1)) * 100)
    : 0;
  const stockRisk = (stats?.totalInventoryItems ?? 0) > 0
    ? Math.round(((stats?.outOfStockItems ?? 0) / (stats?.totalInventoryItems ?? 1)) * 100)
    : 0;
  const resolvedRequests = Math.max(
    (stats?.totalRequests ?? 0) - ((stats?.pendingRequests ?? 0) + (stats?.confirmedRequests ?? 0) + (stats?.outOfStockRequests ?? 0)),
    0
  );
  const topPharmacyLabel = stats?.topPharmacies?.[0]?.pharmacyName || pharmacies[0]?.name || 'Aucune pharmacie';
  const lastRefreshLabel = lastRefreshAt
    ? lastRefreshAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : 'Jamais';

  const filteredKafkaEvents = useMemo(() => {
    if (kafkaTopicFilter === 'all') return kafkaEvents;
    return kafkaEvents.filter(e => e.topic === kafkaTopicFilter);
  }, [kafkaEvents, kafkaTopicFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Command Center Header ─────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 shadow-2xl">
        {/* Background texture dots */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}></div>
        {/* Gradient orbs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-600/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4"></div>

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/30 shrink-0">
              <i className="fas fa-shield-halved"></i>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Centre d'Administration</h2>
              <p className="text-slate-400 font-medium text-sm mt-0.5">MedCareAlert+ · Supervision & Gestion de la plateforme</p>
            </div>
          </div>

          {/* Live Quick Stats */}
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Utilisateurs', value: stats?.totalUsers ?? 0, icon: 'fa-users', color: 'text-blue-400', dot: 'bg-blue-500' },
              { label: 'En attente',   value: stats?.pendingRequests ?? 0, icon: 'fa-clock', color: 'text-amber-400', dot: 'bg-amber-500' },
              { label: 'Pharmacies',   value: stats?.totalPharmacies ?? 0, icon: 'fa-hospital', color: 'text-emerald-400', dot: 'bg-emerald-500' },
              { label: 'Ruptures',     value: stats?.outOfStockItems ?? 0, icon: 'fa-triangle-exclamation', color: 'text-rose-400', dot: 'bg-rose-500' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 backdrop-blur-sm">
                <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`}></div>
                <i className={`fas ${s.icon} text-xs ${s.color}`}></i>
                <span className="text-white font-black text-sm">{s.value}</span>
                <span className="text-slate-400 text-xs font-medium hidden sm:block">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toast Notification ────────────────────────────────────── */}
      {feedback && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-bold max-w-sm animate-in slide-in-from-bottom-3 duration-300 ${
          feedback.type === 'success'
            ? 'bg-emerald-600 text-white shadow-emerald-600/30'
            : 'bg-red-600 text-white shadow-red-600/30'
        }`}>
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <i className={`fas ${feedback.type === 'success' ? 'fa-check' : 'fa-exclamation'} text-xs`}></i>
          </div>
          <span className="flex-1">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition shrink-0">
            <i className="fas fa-xmark text-xs"></i>
          </button>
        </div>
      )}

      {/* ── Navigation Tabs ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              tab === t.key
                ? `bg-white text-slate-900 shadow-md`
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
            }`}
          >
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] ${
              tab === t.key ? `bg-gradient-to-br ${t.color} text-white shadow-sm` : 'bg-slate-200 text-slate-400'
            }`}>
              <i className={`fas ${t.icon}`}></i>
            </span>
            <span className="hidden sm:block">{t.label}</span>
            {t.count !== undefined && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                tab === t.key ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/60 text-slate-400'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button
            onClick={fetchAll}
            className="w-10 h-10 bg-white rounded-xl shadow-sm text-slate-400 hover:text-blue-600 hover:shadow-md transition-all flex items-center justify-center"
            title="Actualiser"
          >
            <i className="fas fa-rotate text-sm"></i>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.95fr] gap-5">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"></div>
          <div className="relative space-y-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]"></span>
                  Ops Radar
                </div>
                <h3 className="mt-3 text-xl font-black tracking-tight text-slate-900">Pilotage en temps réel du rôle admin</h3>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
                  Vue active: <span className="font-black text-slate-800">{activeTab.label}</span>. Priorisez les demandes en attente,
                  les pharmaciens non rattachés et les risques de stock avant qu'ils ne dégradent l'expérience patient.
                </p>
              </div>
              <div className="min-w-[210px] rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-white shadow-lg shadow-slate-900/10">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Dernière synchro</span>
                  <button
                    onClick={fetchAll}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/20"
                  >
                    <i className="fas fa-rotate text-[9px]"></i>
                    Rafraîchir
                  </button>
                </div>
                <div className="mt-3 text-3xl font-black">{lastRefreshLabel}</div>
                <p className="mt-1 text-xs font-medium text-slate-400">Top pharmacie observée: {topPharmacyLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  label: 'Charge demandes',
                  value: `${stats?.pendingRequests ?? 0}`,
                  hint: `${requestPressure}% du flux total reste à traiter`,
                  icon: 'fa-inbox',
                  tone: 'from-amber-500 to-orange-500',
                  panel: 'bg-amber-50 border-amber-100'
                },
                {
                  label: 'Pharmaciens à assigner',
                  value: `${unassignedPharmacists}`,
                  hint: `${inactiveUsers} comptes inactifs à surveiller`,
                  icon: 'fa-user-link',
                  tone: 'from-violet-500 to-purple-600',
                  panel: 'bg-violet-50 border-violet-100'
                },
                {
                  label: 'Risque stock',
                  value: `${stockRisk}%`,
                  hint: `${stats?.outOfStockItems ?? 0} ruptures sur le réseau`,
                  icon: 'fa-triangle-exclamation',
                  tone: 'from-rose-500 to-red-600',
                  panel: 'bg-rose-50 border-rose-100'
                }
              ].map(card => (
                <div key={card.label} className={`rounded-2xl border p-4 ${card.panel}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                      <p className="mt-2 text-3xl font-black text-slate-900">{card.value}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{card.hint}</p>
                    </div>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${card.tone} text-white shadow-lg`}>
                      <i className={`fas ${card.icon}`}></i>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Admin Shortcuts</p>
              <h3 className="mt-2 text-lg font-black text-slate-900">Actions structurantes</h3>
            </div>
            <div className="rounded-2xl bg-slate-100 px-3 py-2 text-right">
              <div className="text-xs font-black text-slate-900">{resolvedRequests}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Résolues</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {[
              { key: 'users' as AdminTab, icon: 'fa-users-gear', title: 'Orchestrer les comptes', sub: `${activeUsers} actifs, ${inactiveUsers} inactifs`, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
              { key: 'pharmacies' as AdminTab, icon: 'fa-hospital', title: 'Stabiliser le réseau', sub: `${pharmacies.length} pharmacies, ${inactivePharmacies} inactives`, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
              { key: 'requests' as AdminTab, icon: 'fa-wave-square', title: 'Débloquer le flux patient', sub: `${stats?.pendingRequests ?? 0} en attente, ${stats?.confirmedRequests ?? 0} confirmées`, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
              { key: 'categories' as AdminTab, icon: 'fa-tags', title: 'Structurer le catalogue', sub: `${stats?.totalCategories ?? categories.length} catégories configurées`, tone: 'bg-rose-50 text-rose-700 border-rose-100' }
            ].map(shortcut => (
              <button
                key={shortcut.key}
                onClick={() => setTab(shortcut.key)}
                className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${shortcut.tone}`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <i className={`fas ${shortcut.icon}`}></i>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black">{shortcut.title}</div>
                  <div className="mt-1 text-xs font-semibold opacity-80">{shortcut.sub}</div>
                </div>
                <i className="fas fa-arrow-right text-xs opacity-60"></i>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────────── TAB: DASHBOARD ─────────────────────── */}
      {tab === 'dashboard' && analytics && (
        <div className="space-y-6">

          {/* ── Row 1: Primary KPIs with weekly change ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCardV2 label="Utilisateurs" value={analytics.users?.total ?? 0} change={analytics.weeklyComparison?.users?.change ?? null}
              icon="fa-users" gradient="from-blue-500 to-indigo-600" sub={`${analytics.users?.active ?? 0} actifs`} />
            <KpiCardV2 label="Patients" value={analytics.users?.patients ?? 0} change={null}
              icon="fa-user" gradient="from-cyan-500 to-blue-500" />
            <KpiCardV2 label="Pharmacies" value={analytics.pharmacies?.total ?? 0} change={null}
              icon="fa-hospital" gradient="from-emerald-500 to-teal-600" sub={`${analytics.pharmacies?.active ?? 0} actives`} />
            <KpiCardV2 label="Ordonnances" value={analytics.prescriptions?.total ?? 0} change={analytics.weeklyComparison?.prescriptions?.change ?? null}
              icon="fa-file-prescription" gradient="from-violet-500 to-purple-600" sub={`${analytics.prescriptions?.successRate ?? 0}% succès`} />
            <KpiCardV2 label="Demandes" value={analytics.requests?.total ?? 0} change={analytics.weeklyComparison?.requests?.change ?? null}
              icon="fa-inbox" gradient="from-amber-500 to-orange-500" sub={`${analytics.requests?.pending ?? 0} en attente`} />
            <KpiCardV2 label="Médicaments" value={analytics.medications?.total ?? 0} change={analytics.weeklyComparison?.medications?.change ?? null}
              icon="fa-capsules" gradient="from-rose-500 to-pink-600" sub={`${analytics.medications?.active ?? 0} actifs`} />
          </div>

          {/* ── Row 2: Score Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ScoreCard label="Taux d'adhérence" score={analytics.adherence?.rate ?? 0} unit="%" icon="fa-heart-pulse"
              color="emerald" detail={`${analytics.adherence?.taken ?? 0} prises · ${analytics.adherence?.missed ?? 0} manquées`} />
            <ScoreCard label="Résolution demandes" score={analytics.requests?.resolutionRate ?? 0} unit="%" icon="fa-check-double"
              color="blue" detail={`Moy. ${analytics.requests?.avgResolutionHours ?? 0}h · ${analytics.requests?.resolved ?? 0} résolues`} />
            <ScoreCard label="Santé inventaire" score={analytics.inventory?.healthScore ?? 100} unit="%" icon="fa-boxes-stacked"
              color="amber" detail={`${analytics.inventory?.outOfStock ?? 0} ruptures · ${analytics.inventory?.low ?? 0} faible`} />
            <ScoreCard label="Confiance IA" score={analytics.prescriptions?.avgConfidence ?? 0} unit="%" icon="fa-brain"
              color="violet" detail={`${analytics.prescriptions?.totalMedsExtracted ?? 0} méd. extraits · ${analytics.prescriptions?.avgProcessingTime ?? 0}ms`} />
          </div>

          {/* ── Row 3: Growth Trends (30 days) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AreaTrendChart title="Croissance Utilisateurs" subtitle="30 derniers jours" data={analytics.growth?.users || []}
              color="blue" icon="fa-user-plus" comparison={analytics.monthlyComparison?.users} />
            <AreaTrendChart title="Flux de Demandes" subtitle="30 derniers jours" data={analytics.growth?.requests || []}
              color="amber" icon="fa-inbox" comparison={analytics.monthlyComparison?.requests} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <AreaTrendChart title="Ordonnances Scannées" subtitle="30 derniers jours" data={analytics.growth?.prescriptions || []}
              color="violet" icon="fa-file-prescription" />
            <AreaTrendChart title="Médicaments Ajoutés" subtitle="30 derniers jours" data={analytics.growth?.medications || []}
              color="emerald" icon="fa-capsules" />
          </div>

          {/* ── Row 4: Donuts + Rankings ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Request Status Donut */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-chart-pie"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Statut des Demandes</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{analytics.requests?.total ?? 0} total</p>
                </div>
              </div>
              <DonutChart segments={[
                { label: 'En attente', value: analytics.requests?.pending ?? 0, color: '#f59e0b' },
                { label: 'Confirmées', value: analytics.requests?.confirmed ?? 0, color: '#10b981' },
                { label: 'Ruptures', value: analytics.requests?.outOfStock ?? 0, color: '#ef4444' },
                { label: 'Résolues', value: analytics.requests?.resolved ?? 0, color: '#3b82f6' },
              ]} />
            </div>

            {/* Inventory Status Donut */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-boxes-stacked"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">État de l'Inventaire</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{analytics.inventory?.total ?? 0} items</p>
                </div>
              </div>
              <DonutChart segments={[
                { label: 'Disponible', value: analytics.inventory?.available ?? 0, color: '#10b981' },
                { label: 'Faible', value: analytics.inventory?.low ?? 0, color: '#f59e0b' },
                { label: 'Rupture', value: analytics.inventory?.outOfStock ?? 0, color: '#ef4444' },
                { label: 'Expiré', value: analytics.inventory?.expired ?? 0, color: '#8b5cf6' },
              ]} />
            </div>

            {/* User Role Distribution Donut */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-users"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Répartition Utilisateurs</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{analytics.users?.total ?? 0} total</p>
                </div>
              </div>
              <DonutChart segments={[
                { label: 'Patients', value: analytics.users?.patients ?? 0, color: '#3b82f6' },
                { label: 'Pharmaciens', value: analytics.users?.pharmacists ?? 0, color: '#8b5cf6' },
                { label: 'Admins', value: analytics.users?.admins ?? 0, color: '#f59e0b' },
              ]} />
            </div>
          </div>

          {/* ── Row 5: Top Medications & Top Pharmacies ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top Medications */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-pills"></i>
                </span>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Top Médicaments</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">par nombre de prescriptions</p>
                </div>
              </div>
              <div className="p-5">
                {(analytics.topMedications || []).length > 0 ? (
                  <HorizontalBarList items={(analytics.topMedications || []).map(m => ({ label: m.name, value: m.count, sub: `${m.activeCount} actifs` }))}
                    color="rose" />
                ) : <EmptyMini text="Aucune donnée médicament" />}
              </div>
            </div>

            {/* Top Pharmacies */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-ranking-star"></i>
                </span>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Top Pharmacies</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">par volume de demandes</p>
                </div>
              </div>
              <div className="p-5">
                {(analytics.topPharmacies || []).length > 0 ? (
                  <HorizontalBarList items={(analytics.topPharmacies || []).map(p => ({ label: p.pharmacyName, value: p.requestCount }))}
                    color="emerald" />
                ) : <EmptyMini text="Aucune donnée pharmacie" />}
              </div>
            </div>
          </div>

          {/* ── Row 6: Adherence Trend + Activity Heatmap ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Adherence Trend */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center text-sm">
                    <i className="fas fa-heart-pulse"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">Tendance Adhérence</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">prises vs manquées (14 jours)</p>
                  </div>
                </div>
                <GaugeCircle value={analytics.adherence?.rate ?? 0} size={48} />
              </div>
              {(analytics.adherence?.trend || []).length > 0 ? (
                <AdherenceTrendChart data={analytics.adherence?.trend || []} />
              ) : <EmptyMini text="Aucune donnée d'adhérence" />}
            </div>

            {/* Activity Heatmap */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-fire"></i>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Heatmap Activité</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">demandes par jour/heure</p>
                </div>
              </div>
              {(analytics.activityHeatmap || []).length > 0 ? (
                <ActivityHeatmap data={analytics.activityHeatmap || []} />
              ) : <EmptyMini text="Aucune activité enregistrée" />}
            </div>
          </div>

          {/* ── Row 7: Prescription Stats + Frequency Distribution + Inventory Health ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Prescription Pipeline */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-file-prescription"></i>
                </span>
                <h4 className="font-black text-slate-900 text-sm">Pipeline Ordonnances</h4>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Traitées', value: analytics.prescriptions?.processed ?? 0, total: analytics.prescriptions?.total ?? 0, color: 'emerald' },
                  { label: 'En attente', value: analytics.prescriptions?.pending ?? 0, total: analytics.prescriptions?.total ?? 0, color: 'amber' },
                  { label: 'Échouées', value: analytics.prescriptions?.failed ?? 0, total: analytics.prescriptions?.total ?? 0, color: 'red' },
                ].map(s => {
                  const pct = s.total > 0 ? Math.round((s.value / s.total) * 100) : 0;
                  const barColors: Record<string, string> = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold text-slate-600">{s.label}</span>
                        <span className="text-xs font-black text-slate-900">{s.value} <span className="text-slate-300 font-medium">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColors[s.color]}`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-50">
                  <div className="text-center p-3 bg-slate-50 rounded-xl">
                    <div className="text-lg font-black text-violet-600">{analytics.prescriptions?.avgConfidence ?? 0}%</div>
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Confiance moy.</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-xl">
                    <div className="text-lg font-black text-violet-600">{analytics.prescriptions?.avgProcessingTime ?? 0}<span className="text-xs text-slate-400">ms</span></div>
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Temps moy.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Frequency Distribution */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-clock-rotate-left"></i>
                </span>
                <h4 className="font-black text-slate-900 text-sm">Fréquences Médicaments</h4>
              </div>
              <div className="p-5">
                {(analytics.frequencyDistribution || []).length > 0 ? (
                  <HorizontalBarList items={(analytics.frequencyDistribution || []).map(f => ({ label: f.frequency, value: f.count }))}
                    color="cyan" />
                ) : <EmptyMini text="Aucune donnée" />}
              </div>
            </div>

            {/* Inventory Health by Pharmacy */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3">
                <span className="w-9 h-9 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center text-sm">
                  <i className="fas fa-triangle-exclamation"></i>
                </span>
                <h4 className="font-black text-slate-900 text-sm">Alertes Inventaire</h4>
              </div>
              <div className="p-5">
                {(analytics.inventoryHealth || []).length > 0 ? (
                  <div className="space-y-3">
                    {(analytics.inventoryHealth || []).slice(0, 6).map((ph, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-black text-slate-800 truncate">{ph.pharmacyName}</div>
                          <div className="flex gap-2 mt-1">
                            {ph.outOfStock > 0 && <span className="text-[8px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{ph.outOfStock} rupture{ph.outOfStock > 1 ? 's' : ''}</span>}
                            {ph.low > 0 && <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{ph.low} faible{ph.low > 1 ? 's' : ''}</span>}
                            {ph.expired > 0 && <span className="text-[8px] font-black text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">{ph.expired} expiré{ph.expired > 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black text-slate-900">{ph.issueCount}</div>
                          <div className="text-[8px] text-slate-400 font-bold">problèmes</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyMini text="Inventaire sain" />}
              </div>
            </div>
          </div>

          {/* ── Row 8: Weekly Comparison Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: 'Utilisateurs', data: analytics.weeklyComparison?.users || { thisWeek: 0, lastWeek: 0, change: 0 }, icon: 'fa-users', color: 'blue' },
              { label: 'Demandes', data: analytics.weeklyComparison?.requests || { thisWeek: 0, lastWeek: 0, change: 0 }, icon: 'fa-inbox', color: 'amber' },
              { label: 'Ordonnances', data: analytics.weeklyComparison?.prescriptions || { thisWeek: 0, lastWeek: 0, change: 0 }, icon: 'fa-file-prescription', color: 'violet' },
              { label: 'Médicaments', data: analytics.weeklyComparison?.medications || { thisWeek: 0, lastWeek: 0, change: 0 }, icon: 'fa-capsules', color: 'emerald' },
            ] as const).map(c => (
              <ComparisonCard key={c.label} label={c.label} thisWeek={c.data.thisWeek} lastWeek={c.data.lastWeek} change={c.data.change}
                icon={c.icon} color={c.color} />
            ))}
          </div>

          {/* ── Row 9: Recent Users ── */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-sm">
                  <i className="fas fa-user-plus"></i>
                </span>
                <h3 className="font-black text-slate-800 text-sm">Derniers Inscrits</h3>
              </div>
              <button onClick={() => setTab('users')} className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center gap-1">
                Voir tous <i className="fas fa-arrow-right text-[9px]"></i>
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {(analytics.recentUsers || []).slice(0, 5).map(u => {
                const rc = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.PATIENT;
                return (
                  <div key={u.id} className="flex items-center justify-between px-7 py-4 hover:bg-slate-50/60 transition">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${rc.color} text-white flex items-center justify-center font-black text-sm shadow-sm`}>
                        {u.name[0]}
                      </div>
                      <div>
                        <span className="font-black text-slate-900 text-sm">{u.name}</span>
                        <p className="text-[10px] font-bold text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-bold text-slate-300">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</span>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${rc.badge}`}>{rc.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dashboard fallback when analytics not loaded */}
      {tab === 'dashboard' && !analytics && (
        <div className="space-y-6">

          {/* Primary KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Total Utilisateurs" value={stats?.totalUsers ?? 0} sub={`${stats?.users ?? 0} actifs`}
              icon="fa-users" gradient="from-blue-500 to-indigo-600" />
            <KpiCard label="Patients" value={stats?.patients ?? 0}
              icon="fa-user" gradient="from-cyan-500 to-blue-500" />
            <KpiCard label="Pharmaciens" value={stats?.pharmacists ?? 0}
              icon="fa-user-nurse" gradient="from-violet-500 to-purple-600" />
            <KpiCard label="Admins" value={stats?.admins ?? 0}
              icon="fa-user-shield" gradient="from-amber-500 to-orange-500" />
            <KpiCard label="Pharmacies" value={stats?.totalPharmacies ?? 0} sub={`${stats?.pharmacies ?? 0} actives`}
              icon="fa-hospital" gradient="from-emerald-500 to-teal-600" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Traitements actifs" value={stats?.activeMeds ?? 0} total={stats?.totalMeds ?? 0}
              icon="fa-capsules" color="blue" />
            <MetricCard label="Ordonnances traitées" value={stats?.processedPrescriptions ?? 0} total={stats?.prescriptions ?? 0}
              icon="fa-file-prescription" color="emerald" />
            <MetricCard label="Demandes en attente" value={stats?.pendingRequests ?? 0} total={stats?.totalRequests ?? 0}
              icon="fa-inbox" color="amber" />
            <MetricCard label="Ruptures de stock" value={stats?.outOfStockItems ?? 0} total={stats?.totalInventoryItems ?? 0}
              icon="fa-triangle-exclamation" color="rose" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <TrendCard title="Inscriptions" subtitle="7 derniers jours" data={stats?.userTrend} color="blue" icon="fa-user-plus" />
            <TrendCard title="Demandes" subtitle="7 derniers jours" data={stats?.requestTrend} color="amber" icon="fa-inbox" />
            <TrendCard title="Ordonnances" subtitle="7 derniers jours" data={stats?.prescriptionTrend} color="emerald" icon="fa-file-prescription" />
          </div>
        </div>
      )}

      {/* ─────────────────── TAB: USERS ─────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-5">

          {/* Role Distribution */}
          <div className="grid grid-cols-3 gap-4">
            {(['PATIENT', 'PHARMACIST', 'ADMIN'] as const).map(role => {
              const rc = ROLE_CONFIG[role];
              const count = users.filter(u => u.role === role).length;
              const pct = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
              return (
                <div key={role} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className={`h-1.5 bg-gradient-to-r ${rc.color}`} style={{ width: `${pct}%`, minWidth: count > 0 ? '8px' : '0' }}></div>
                  <div className="px-6 py-5 flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${rc.color} text-white flex items-center justify-center shadow-sm shrink-0`}>
                      <i className={`fas ${rc.icon}`}></i>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-slate-900 leading-none">{count}</div>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">{rc.label}s</p>
                    </div>
                    <span className="ml-auto text-sm font-black text-slate-300">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Table card */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Table header / toolbar */}
            <div className="px-7 py-5 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Gestion des Utilisateurs</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {filteredUsers.length} sur {users.length} utilisateur{users.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 w-full lg:w-auto items-center">
                {/* Role filter pills */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {['all', 'PATIENT', 'PHARMACIST', 'ADMIN'].map(r => (
                    <button key={r} onClick={() => setUserRoleFilter(r)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${
                        userRoleFilter === r
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}>
                      {r === 'all' ? 'Tous' : r === 'PHARMACIST' ? 'Pharmacists' : r}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                  <input
                    type="text" value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Rechercher par nom ou email…"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition"
                  />
                </div>
                <button onClick={() => setCreateUserModal(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:from-blue-700 hover:to-indigo-700 transition shadow-lg shadow-blue-200 whitespace-nowrap">
                  <i className="fas fa-user-plus"></i>
                  <span>Créer</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Utilisateur', 'Rôle', 'Pharmacie', 'Statut', 'Actions'].map((h, i) => (
                      <th key={h} className={`px-7 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="flex flex-col items-center py-16 text-center">
                          <i className="fas fa-user-slash text-4xl text-slate-100 mb-3"></i>
                          <p className="text-sm font-bold text-slate-300">Aucun utilisateur trouvé</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredUsers.map((u) => {
                    const rc = ROLE_CONFIG[u.role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.PATIENT;
                    const linkedPharmacy = pharmacies.find(p => p.id === u.pharmacyId);
                    const isActive = u.isActive !== false;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 transition group">
                        {/* User */}
                        <td className="px-7 py-5">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${rc.color} text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                              {u.name[0]}
                            </div>
                            <div>
                              <div className="font-black text-slate-900 text-sm leading-none">{u.name}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-1">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-7 py-5">
                          <select
                            value={u.role}
                            onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                            className={`px-3 py-2 border rounded-xl text-[10px] font-black outline-none cursor-pointer ${rc.badge}`}
                          >
                            <option value={UserRole.PATIENT}>Patient</option>
                            <option value={UserRole.PHARMACIST}>Pharmacien</option>
                            <option value={UserRole.ADMIN}>Admin</option>
                          </select>
                        </td>
                        {/* Pharmacy */}
                        <td className="px-7 py-5">
                          {linkedPharmacy ? (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-xl">
                              <i className="fas fa-hospital mr-1 text-emerald-400"></i>{linkedPharmacy.name}
                            </span>
                          ) : u.role === 'PHARMACIST' ? (
                            <button
                              onClick={() => setAssignModal({ userId: u.id, userName: u.name })}
                              className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-xl transition"
                            >
                              <i className="fas fa-link text-[9px]"></i> Assigner
                            </button>
                          ) : (
                            <span className="text-xs text-slate-200 font-bold">—</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-7 py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-400'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {isActive ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-7 py-5 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition">
                            <ActionBtn
                              icon="fa-pen" title="Modifier"
                              color="blue"
                              onClick={() => { setEditUserModal(u); setEditUserData({ name: u.name, email: u.email }); }}
                            />
                            <ActionBtn
                              icon="fa-key" title="Réinitialiser mot de passe"
                              color="amber"
                              onClick={() => setResetPwModal({ id: u.id, name: u.name })}
                            />
                            <button
                              onClick={() => toggleUserActive(u.id, isActive)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition border ${
                                isActive
                                  ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                              }`}
                            >
                              {isActive ? 'Désactiver' : 'Activer'}
                            </button>
                            <ActionBtn
                              icon="fa-trash" title="Supprimer"
                              color="red"
                              onClick={() => deleteUser(u.id, u.name)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── TAB: PHARMACIES ────────────────────── */}
      {tab === 'pharmacies' && (
        <div className="space-y-5">
          {/* Create pharmacy */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50">
              <span className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl flex items-center justify-center shadow-sm">
                <i className="fas fa-plus text-sm"></i>
              </span>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Créer une Pharmacie</h3>
                <p className="text-[10px] font-medium text-slate-400">Renseignez les informations de la nouvelle pharmacie</p>
              </div>
            </div>
            <div className="p-7">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormInput icon="fa-hospital" placeholder="Nom de la pharmacie *" value={newPharmacy.name}
                  onChange={(v) => setNewPharmacy(p => ({ ...p, name: v }))} />
                <FormInput icon="fa-location-dot" placeholder="Adresse complète *" value={newPharmacy.address}
                  onChange={(v) => setNewPharmacy(p => ({ ...p, address: v }))} />
                <FormInput icon="fa-phone" placeholder="Téléphone" value={newPharmacy.phone}
                  onChange={(v) => setNewPharmacy(p => ({ ...p, phone: v }))} />
                <FormInput icon="fa-briefcase-medical" placeholder="Services (séparés par virgules)" value={newPharmacy.services}
                  onChange={(v) => setNewPharmacy(p => ({ ...p, services: v }))} />
                <FormInput icon="fa-arrows-up-down" placeholder="Latitude" value={String(newPharmacy.lat)} type="number"
                  onChange={(v) => setNewPharmacy(p => ({ ...p, lat: Number(v) }))} />
                <FormInput icon="fa-arrows-left-right" placeholder="Longitude" value={String(newPharmacy.lng)} type="number"
                  onChange={(v) => setNewPharmacy(p => ({ ...p, lng: Number(v) }))} />
              </div>
              <button onClick={createPharmacy}
                className="mt-5 flex items-center gap-2 px-7 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-2xl hover:from-emerald-700 hover:to-teal-700 transition shadow-lg shadow-emerald-200 text-sm">
                <i className="fas fa-plus-circle"></i> Créer la Pharmacie
              </button>
            </div>
          </div>

          {/* Pharmacies list */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-lg">Toutes les Pharmacies</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {filteredPharmacies.length} / {pharmacies.length} pharmacie{pharmacies.length !== 1 ? 's' : ''}
                  <span className="ml-2 text-emerald-600">· {pharmacies.filter(p => p.isActive).length} actives</span>
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                <input type="text" value={pharmacyQuery} onChange={(e) => setPharmacyQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-semibold outline-none focus:border-emerald-300 transition"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Pharmacie', 'Téléphone', 'Services', 'Gestionnaire', 'Statut', 'Actions'].map((h, i) => (
                      <th key={h} className={`px-7 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredPharmacies.length === 0 ? (
                    <tr><td colSpan={6}>
                      <div className="flex flex-col items-center py-16 text-center">
                        <i className="fas fa-hospital text-4xl text-slate-100 mb-3"></i>
                        <p className="text-sm font-bold text-slate-300">Aucune pharmacie trouvée</p>
                      </div>
                    </td></tr>
                  ) : filteredPharmacies.map(p => {
                    const owner = users.find(u => u.pharmacyId === p.id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition group">
                        <td className="px-7 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                              <i className="fas fa-hospital text-xs"></i>
                            </div>
                            <div>
                              <div className="font-black text-slate-900 text-sm">{p.name}</div>
                              <div className="text-[10px] font-bold text-slate-400 mt-0.5">{p.address}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-7 py-5 text-sm font-bold text-slate-600">{p.phone || <span className="text-slate-200">—</span>}</td>
                        <td className="px-7 py-5">
                          <div className="flex flex-wrap gap-1">
                            {(p.services || []).length > 0 ? (p.services || []).map((s: string) => (
                              <span key={s} className="px-2 py-1 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-[9px] font-black">{s}</span>
                            )) : <span className="text-slate-200 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-7 py-5">
                          {owner ? (
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center font-black text-xs">
                                {owner.name[0]}
                              </div>
                              <span className="text-xs font-bold text-slate-700">{owner.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300 font-medium italic">Non assigné</span>
                          )}
                        </td>
                        <td className="px-7 py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${p.isActive ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-400'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${p.isActive ? 'text-emerald-700' : 'text-red-600'}`}>
                              {p.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="px-7 py-5 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition">
                            <ActionBtn icon="fa-pen" title="Modifier" color="blue"
                              onClick={() => { setEditPharmacyModal(p); setEditPharmacyData({ name: p.name, address: p.address, phone: p.phone || '', services: (p.services || []).join(', ') }); }}
                            />
                            <button
                              onClick={() => togglePharmacyActive(p.id)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition border ${
                                p.isActive
                                  ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'
                              }`}
                            >
                              {p.isActive ? 'Désactiver' : 'Activer'}
                            </button>
                            <ActionBtn icon="fa-trash" title="Supprimer" color="red"
                              onClick={() => deletePharmacy(p.id, p.name)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── TAB: REQUESTS ──────────────────────── */}
      {tab === 'requests' && (
        <div className="space-y-5">
          {/* Filter bar */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit">
            {['all', 'pending', 'confirmed', 'out_of_stock', 'resolved'].map(f => {
              const cfg = STATUS_CONFIG[f];
              const count = f === 'all' ? requests.length : requests.filter(r => r.status === f).length;
              return (
                <button key={f} onClick={() => setRequestFilter(f)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition ${
                    requestFilter === f ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'
                  }`}>
                  {cfg && (
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}></span>
                  )}
                  {f === 'all' ? 'Toutes' : cfg?.label || f}
                  <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black ${
                    requestFilter === f ? 'bg-slate-100 text-slate-500' : 'bg-slate-200/70 text-slate-400'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyState icon="fa-inbox" title="Aucune demande trouvée" subtitle="Modifiez le filtre ou attendez de nouvelles demandes" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredRequests.map(req => {
                const patient = users.find(u => u.id === req.patientId);
                const pharm = pharmacies.find(p => p.id === req.pharmacyId);
                const cfg = STATUS_CONFIG[req.status] || { label: req.status, badge: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400', icon: 'fa-question' };
                return (
                  <div key={req.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition overflow-hidden">
                    {/* Color accent bar */}
                    <div className={`h-1 ${cfg.dot}`}></div>
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center text-sm shadow-sm shrink-0">
                            <i className="fas fa-capsules"></i>
                          </div>
                          <div>
                            <h4 className="text-base font-black text-slate-900 leading-none">{req.medicationName}</h4>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                              {new Date(req.createdAt).toLocaleDateString('fr-FR')} · {new Date(req.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 shrink-0 ${cfg.badge}`}>
                          <i className={`fas ${cfg.icon} text-[8px]`}></i>
                          {cfg.label}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {patient && (
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                            <div className="w-5 h-5 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-black">{patient.name[0]}</div>
                            <span className="text-[10px] font-bold text-slate-600">{patient.name}</span>
                          </div>
                        )}
                        {pharm && (
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                            <i className="fas fa-hospital text-emerald-500 text-[9px]"></i>
                            <span className="text-[10px] font-bold text-slate-600">{pharm.name}</span>
                          </div>
                        )}
                      </div>

                      {req.note && (
                        <p className="text-xs text-slate-400 italic bg-slate-50 rounded-xl px-4 py-2.5 mb-3 border border-slate-100">
                          <i className="fas fa-quote-left text-slate-200 mr-2"></i>{req.note}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        {req.status === 'pending' && (<>
                          <button onClick={() => updateRequestStatus(req.id, 'confirmed')}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 transition shadow-sm flex-1 justify-center">
                            <i className="fas fa-check"></i> Confirmer
                          </button>
                          <button onClick={() => updateRequestStatus(req.id, 'out_of_stock')}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition shadow-sm flex-1 justify-center">
                            <i className="fas fa-xmark"></i> Rupture
                          </button>
                        </>)}
                        {req.status === 'confirmed' && (
                          <button onClick={() => updateRequestStatus(req.id, 'resolved')}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-700 transition shadow-sm">
                            <i className="fas fa-check-double"></i> Marquer résolu
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────── TAB: CATEGORIES ────────────────────── */}
      {tab === 'categories' && (
        <div className="space-y-5">
          {/* Create form */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-7 py-5 border-b border-slate-50 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-pink-50">
              <span className="w-9 h-9 bg-gradient-to-br from-rose-500 to-pink-600 text-white rounded-2xl flex items-center justify-center shadow-sm">
                <i className="fas fa-tag text-sm"></i>
              </span>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Nouvelle Catégorie</h3>
                <p className="text-[10px] font-medium text-slate-400">Ajoutez une catégorie de médicaments</p>
              </div>
            </div>
            <div className="p-7 flex flex-col sm:flex-row gap-3">
              <FormInput icon="fa-tag" placeholder="Nom de la catégorie (ex: Antibiotiques) *" value={newCategory}
                onChange={setNewCategory} className="flex-1" onEnter={createCategory} />
              <FormInput icon="fa-align-left" placeholder="Description (optionnel)" value={newCategoryDesc}
                onChange={setNewCategoryDesc} className="flex-1" />
              <button onClick={createCategory}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-600 to-pink-600 text-white font-black rounded-2xl hover:from-rose-700 hover:to-pink-700 transition shadow-lg shadow-rose-200 text-sm whitespace-nowrap">
                <i className="fas fa-plus"></i> Ajouter
              </button>
            </div>
          </div>

          {/* Categories grid */}
          {categories.length === 0 ? (
            <EmptyState icon="fa-tags" title="Aucune catégorie créée" subtitle="Créez votre première catégorie de médicaments ci-dessus" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {categories.map(c => (
                <div key={c.id} className={`bg-white rounded-3xl border shadow-sm hover:shadow-lg transition-all group overflow-hidden ${c.isActive === false ? 'border-red-100 opacity-70' : 'border-slate-100 hover:border-rose-100'}`}>
                  <div className={`h-1 ${c.isActive === false ? 'bg-red-300' : 'bg-gradient-to-r from-rose-500 to-pink-500'}`}></div>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg shadow-sm ${
                        c.isActive === false ? 'bg-slate-100 text-slate-300' : 'bg-gradient-to-br from-rose-50 to-pink-50 text-rose-500 border border-rose-100'
                      }`}>
                        <i className="fas fa-tag"></i>
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${
                        c.isActive === false ? 'bg-red-50 text-red-500 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {c.isActive === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm mb-1">{c.name}</h4>
                    {c.description && <p className="text-xs text-slate-400 leading-relaxed">{c.description}</p>}

                    {/* Actions - appear on hover */}
                    <div className="flex gap-1.5 mt-4 pt-3 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => { setEditCategoryModal(c); setEditCatData({ name: c.name, description: c.description || '' }); }}
                        className="flex-1 py-2 bg-slate-50 hover:bg-blue-600 text-slate-400 hover:text-white rounded-xl transition text-xs font-black flex items-center justify-center gap-1.5">
                        <i className="fas fa-pen text-[10px]"></i> Modifier
                      </button>
                      <button onClick={() => toggleCategory(c.id)}
                        className={`w-9 h-9 rounded-xl transition text-xs flex items-center justify-center ${
                          c.isActive === false
                            ? 'bg-emerald-50 text-emerald-500 hover:bg-emerald-600 hover:text-white'
                            : 'bg-amber-50 text-amber-500 hover:bg-amber-600 hover:text-white'
                        }`}
                        title={c.isActive === false ? 'Activer' : 'Désactiver'}>
                        <i className={`fas ${c.isActive === false ? 'fa-check' : 'fa-ban'} text-[10px]`}></i>
                      </button>
                      <button onClick={() => deleteCategory(c.id, c.name)}
                        className="w-9 h-9 bg-red-50 text-red-400 hover:bg-red-600 hover:text-white rounded-xl transition text-xs flex items-center justify-center">
                        <i className="fas fa-trash text-[10px]"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ═══════════════════ KAFKA MONITOR TAB ═══════════════════ */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === 'kafka' && (
        <div className="space-y-5 animate-in fade-in duration-300">

          {/* ── Connection banner ─────────────────────────────────── */}
          <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl border shadow-sm ${
            kafkaStats?.connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${kafkaStats?.connected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${kafkaStats?.connected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-sm font-black uppercase tracking-wider">{kafkaStats?.connected ? 'Kafka Connected' : 'Kafka Disconnected'}</span>
            <span className="text-xs opacity-60 font-bold">Broker: localhost:9092</span>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs font-bold opacity-60">{kafkaStats?.totalProcessed ?? 0} events processed</span>
              <button onClick={fetchKafka} className="w-8 h-8 bg-white/80 rounded-xl flex items-center justify-center hover:scale-105 transition shadow-sm">
                <i className="fas fa-arrows-rotate text-xs"></i>
              </button>
            </div>
          </div>

          {/* ── Topic stats cards ─────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(kafkaStats?.topics ?? []).map(topic => {
              const s = kafkaStats?.topicStats?.[topic];
              const topicIcon = topic.includes('patient') ? 'fa-user-injured' : topic.includes('medication') ? 'fa-pills' : 'fa-boxes-stacked';
              const topicColor = topic.includes('patient') ? 'from-amber-500 to-orange-500' : topic.includes('medication') ? 'from-violet-500 to-purple-600' : 'from-cyan-500 to-blue-600';
              return (
                <div key={topic} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition">
                  <div className={`h-1.5 bg-gradient-to-r ${topicColor}`}></div>
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${topicColor} flex items-center justify-center text-white shadow-sm`}>
                        <i className={`fas ${topicIcon} text-sm`}></i>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                        s && s.errors > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {s && s.errors > 0 ? `${s.errors} errors` : 'Healthy'}
                      </span>
                    </div>
                    <h4 className="font-black text-slate-900 text-sm mb-0.5 font-mono">{topic}</h4>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="text-center">
                        <div className="text-xl font-black text-slate-900">{s?.total ?? 0}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Messages</div>
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-[10px] text-slate-400 font-semibold">
                          {s?.lastAt ? new Date(s.lastAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
                        </div>
                        <div className="text-[9px] text-slate-300 font-medium">Last message</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Controls bar ──────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
              {['all', ...(kafkaStats?.topics ?? [])].map(t => (
                <button key={t} onClick={() => setKafkaTopicFilter(t)}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                    kafkaTopicFilter === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>
                  {t === 'all' ? 'All Topics' : t.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setKafkaLive(l => !l)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition border ${
                  kafkaLive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}>
                <span className={`w-2 h-2 rounded-full ${kafkaLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                {kafkaLive ? 'Live' : 'Paused'}
              </button>
            </div>
          </div>

          {/* ── Event Feed ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-cyan-50/30">
              <span className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                <i className="fas fa-stream text-sm"></i>
              </span>
              <div>
                <h3 className="font-black text-slate-900 text-sm">Event Stream</h3>
                <p className="text-[10px] font-medium text-slate-400">Real-time Kafka consumer activity</p>
              </div>
              <span className="ml-auto text-[10px] font-bold text-slate-400">{filteredKafkaEvents.length} events</span>
            </div>

            {filteredKafkaEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center">
                  <i className="fas fa-satellite-dish text-2xl text-slate-200"></i>
                </div>
                <p className="text-sm font-bold text-slate-300">No events yet</p>
                <p className="text-xs text-slate-300">Events will appear here as Kafka consumers process messages</p>
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-50">
                {filteredKafkaEvents.map(ev => {
                  const resultColor = ev.result === 'processed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : ev.result === 'error' ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200';
                  const resultIcon = ev.result === 'processed' ? 'fa-check' : ev.result === 'error' ? 'fa-xmark' : 'fa-forward';
                  const topicBadge = ev.topic.includes('patient') ? 'bg-amber-50 text-amber-600' : ev.topic.includes('medication') ? 'bg-violet-50 text-violet-600' : 'bg-cyan-50 text-cyan-600';

                  return (
                    <div key={ev.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition group">
                      <div className="flex items-center gap-3">
                        {/* result indicator */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] border ${resultColor}`}>
                          <i className={`fas ${resultIcon}`}></i>
                        </div>

                        {/* topic badge */}
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${topicBadge}`}>
                          {ev.topic.replace(/-/g, ' ')}
                        </span>

                        {/* action */}
                        <span className="text-xs font-bold text-slate-800 font-mono">{ev.action}</span>

                        {/* detail */}
                        <span className="text-xs text-slate-400 truncate max-w-md hidden lg:inline">{ev.detail}</span>

                        {/* timestamp */}
                        <span className="ml-auto text-[10px] font-mono text-slate-300 whitespace-nowrap">
                          {new Date(ev.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      {/* expandable data row */}
                      <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition">
                        <pre className="text-[10px] text-slate-400 font-mono bg-slate-50 rounded-lg px-3 py-1.5 overflow-x-auto max-w-full">
                          {JSON.stringify(ev.data, null, 0).slice(0, 250)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
                <div ref={kafkaEndRef}></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════ MODALS ══════════════════════════════ */}

      {/* Create User */}
      {createUserModal && (
        <Modal onClose={() => setCreateUserModal(false)} title="Créer un Utilisateur"
          icon="fa-user-plus" accentColor="from-blue-500 to-indigo-600">
          <div className="space-y-3">
            <FormInput icon="fa-user" placeholder="Nom complet *" value={newUser.name}
              onChange={v => setNewUser(d => ({ ...d, name: v }))} />
            <FormInput icon="fa-envelope" placeholder="Adresse email *" value={newUser.email} type="email"
              onChange={v => setNewUser(d => ({ ...d, email: v }))} />
            <FormInput icon="fa-lock" placeholder="Mot de passe (min. 6 caractères) *" value={newUser.password} type="password"
              onChange={v => setNewUser(d => ({ ...d, password: v }))} />
            <div className="relative">
              <i className="fas fa-id-badge absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
              <select value={newUser.role} onChange={e => setNewUser(d => ({ ...d, role: e.target.value }))}
                className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition text-sm appearance-none">
                <option value="PATIENT">Patient</option>
                <option value="PHARMACIST">Pharmacien</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <ModalActions
            onConfirm={handleCreateUser}
            onCancel={() => setCreateUserModal(false)}
            confirmLabel="Créer l'utilisateur"
            confirmColor="from-blue-600 to-indigo-600"
          />
        </Modal>
      )}

      {/* Edit User */}
      {editUserModal && (
        <Modal onClose={() => setEditUserModal(null)} title={`Modifier ${editUserModal.name}`}
          icon="fa-pen" accentColor="from-blue-500 to-indigo-600">
          <div className="space-y-3">
            <FormInput icon="fa-user" placeholder="Nom" value={editUserData.name}
              onChange={v => setEditUserData(d => ({ ...d, name: v }))} />
            <FormInput icon="fa-envelope" placeholder="Email" value={editUserData.email} type="email"
              onChange={v => setEditUserData(d => ({ ...d, email: v }))} />
          </div>
          <ModalActions
            onConfirm={handleEditUser}
            onCancel={() => setEditUserModal(null)}
            confirmLabel="Enregistrer les modifications"
            confirmColor="from-blue-600 to-indigo-600"
          />
        </Modal>
      )}

      {/* Reset Password */}
      {resetPwModal && (
        <Modal onClose={() => { setResetPwModal(null); setResetPwValue(''); }}
          title="Réinitialiser le mot de passe"
          icon="fa-key" accentColor="from-amber-500 to-orange-500">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <i className="fas fa-user text-xs"></i>
              </div>
              <p className="text-sm font-bold text-amber-800">Nouveau mot de passe pour <span className="font-black">{resetPwModal.name}</span></p>
            </div>
            <FormInput icon="fa-lock" placeholder="Nouveau mot de passe (min. 6 caractères)" value={resetPwValue} type="password"
              onChange={setResetPwValue} />
          </div>
          <ModalActions
            onConfirm={handleResetPassword}
            onCancel={() => { setResetPwModal(null); setResetPwValue(''); }}
            confirmLabel="Réinitialiser"
            confirmColor="from-amber-600 to-orange-600"
          />
        </Modal>
      )}

      {/* Assign Pharmacy */}
      {assignModal && (
        <Modal onClose={() => setAssignModal(null)} title="Assigner une Pharmacie"
          icon="fa-link" accentColor="from-emerald-500 to-teal-600">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <i className="fas fa-user-nurse text-xs"></i>
              </div>
              <p className="text-sm font-bold text-blue-800">Pharmacie pour <span className="font-black">{assignModal.userName}</span></p>
            </div>
            <div className="relative">
              <i className="fas fa-hospital absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
              <select value={assignPharmacyId} onChange={(e) => setAssignPharmacyId(e.target.value)}
                className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-300 transition text-sm appearance-none">
                <option value="">Sélectionner une pharmacie…</option>
                {pharmacies.filter(p => p.isActive).map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
                ))}
              </select>
            </div>
          </div>
          <ModalActions
            onConfirm={assignPharmacy}
            onCancel={() => setAssignModal(null)}
            confirmLabel="Assigner"
            confirmColor="from-emerald-600 to-teal-600"
            disabled={!assignPharmacyId}
          />
        </Modal>
      )}

      {/* Edit Pharmacy */}
      {editPharmacyModal && (
        <Modal onClose={() => setEditPharmacyModal(null)} title={`Modifier ${editPharmacyModal.name}`}
          icon="fa-hospital" accentColor="from-emerald-500 to-teal-600">
          <div className="space-y-3">
            <FormInput icon="fa-hospital" placeholder="Nom" value={editPharmacyData.name}
              onChange={v => setEditPharmacyData(d => ({ ...d, name: v }))} />
            <FormInput icon="fa-location-dot" placeholder="Adresse" value={editPharmacyData.address}
              onChange={v => setEditPharmacyData(d => ({ ...d, address: v }))} />
            <FormInput icon="fa-phone" placeholder="Téléphone" value={editPharmacyData.phone}
              onChange={v => setEditPharmacyData(d => ({ ...d, phone: v }))} />
            <FormInput icon="fa-briefcase-medical" placeholder="Services (séparés par virgules)" value={editPharmacyData.services}
              onChange={v => setEditPharmacyData(d => ({ ...d, services: v }))} />
          </div>
          <ModalActions
            onConfirm={handleEditPharmacy}
            onCancel={() => setEditPharmacyModal(null)}
            confirmLabel="Enregistrer"
            confirmColor="from-emerald-600 to-teal-600"
          />
        </Modal>
      )}

      {/* Edit Category */}
      {editCategoryModal && (
        <Modal onClose={() => setEditCategoryModal(null)} title={`Modifier "${editCategoryModal.name}"`}
          icon="fa-tag" accentColor="from-rose-500 to-pink-600">
          <div className="space-y-3">
            <FormInput icon="fa-tag" placeholder="Nom de la catégorie" value={editCatData.name}
              onChange={v => setEditCatData(d => ({ ...d, name: v }))} />
            <div className="relative">
              <i className="fas fa-align-left absolute left-4 top-4 text-slate-300 text-sm"></i>
              <textarea
                placeholder="Description (optionnel)"
                value={editCatData.description}
                onChange={e => setEditCatData(d => ({ ...d, description: e.target.value }))}
                className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-50 transition text-sm resize-none h-24"
              />
            </div>
          </div>
          <ModalActions
            onConfirm={handleEditCategory}
            onCancel={() => setEditCategoryModal(null)}
            confirmLabel="Enregistrer"
            confirmColor="from-rose-600 to-pink-600"
          />
        </Modal>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ─── Sub-components ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// ─── NEW Analytics Components ─────────────────────────────────

// KPI Card V2 — with weekly change indicator
const KpiCardV2: React.FC<{ label: string; value: number; change: number | null; icon: string; gradient: string; sub?: string }> = ({ label, value, change, icon, gradient, sub }) => (
  <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-3xl p-5 shadow-lg text-white`}>
    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center text-sm">
          <i className={`fas ${icon}`}></i>
        </div>
        {change !== null && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black ${
            change > 0 ? 'bg-white/20 text-white' : change < 0 ? 'bg-red-500/30 text-red-100' : 'bg-white/10 text-white/60'
          }`}>
            <i className={`fas ${change > 0 ? 'fa-arrow-up' : change < 0 ? 'fa-arrow-down' : 'fa-minus'} text-[7px]`}></i>
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-black leading-none mb-0.5">{value.toLocaleString()}</div>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/60">{label}</p>
      {sub && <p className="text-[9px] font-medium text-white/50 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// Score Card — circular gauge with detail
const ScoreCard: React.FC<{ label: string; score: number; unit: string; icon: string; color: string; detail: string }> = ({ label, score, unit, icon, color, detail }) => {
  const colorMap: Record<string, { ring: string; text: string; bg: string; iconBg: string }> = {
    emerald: { ring: 'text-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100 text-emerald-600' },
    blue: { ring: 'text-blue-500', text: 'text-blue-600', bg: 'bg-blue-50', iconBg: 'bg-blue-100 text-blue-600' },
    amber: { ring: 'text-amber-500', text: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100 text-amber-600' },
    violet: { ring: 'text-violet-500', text: 'text-violet-600', bg: 'bg-violet-50', iconBg: 'bg-violet-100 text-violet-600' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <GaugeCircle value={score} size={64} color={c.ring} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs ${c.iconBg}`}>
              <i className={`fas ${icon}`}></i>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
          </div>
          <div className={`text-2xl font-black ${c.text} leading-none`}>{score}{unit}</div>
          <p className="text-[9px] font-medium text-slate-400 mt-1 truncate">{detail}</p>
        </div>
      </div>
    </div>
  );
};

// Gauge Circle (SVG)
const GaugeCircle: React.FC<{ value: number; size?: number; color?: string }> = ({ value, size = 56, color = 'text-emerald-500' }) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="4" className={color}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="fill-slate-800 text-[10px] font-black rotate-90" style={{ transformOrigin: `${size/2}px ${size/2}px` }}>
        {value}%
      </text>
    </svg>
  );
};

// Area Trend Chart (SVG)
const AreaTrendChart: React.FC<{ title: string; subtitle: string; data: TrendPoint[]; color: string; icon: string; comparison?: { thisMonth: number; lastMonth: number; change: number } }> = ({ title, subtitle, data, color, icon, comparison }) => {
  const colorMap: Record<string, { stroke: string; fill: string; text: string; iconBg: string; dot: string }> = {
    blue: { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)', text: 'text-blue-600', iconBg: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500' },
    amber: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.1)', text: 'text-amber-600', iconBg: 'bg-amber-100 text-amber-600', dot: 'bg-amber-500' },
    violet: { stroke: '#8b5cf6', fill: 'rgba(139,92,246,0.1)', text: 'text-violet-600', iconBg: 'bg-violet-100 text-violet-600', dot: 'bg-violet-500' },
    emerald: { stroke: '#10b981', fill: 'rgba(16,185,129,0.1)', text: 'text-emerald-600', iconBg: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-500' },
  };
  const c = colorMap[color] || colorMap.blue;

  // Fill last 30 days
  const days: TrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const found = (data || []).find(p => p._id === key);
    days.push({ _id: key, count: found?.count || 0 });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  const W = 500, H = 120, PX = 10, PY = 10;
  const plotW = W - PX * 2, plotH = H - PY * 2;
  const points = days.map((d, i) => ({
    x: PX + (i / (days.length - 1)) * plotW,
    y: PY + plotH - (d.count / max) * plotH,
    count: d.count,
    date: d._id,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length-1].x},${H - PY} L${points[0].x},${H - PY} Z`;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${c.iconBg}`}>
            <i className={`fas ${icon} text-sm`}></i>
          </div>
          <div>
            <h4 className="font-black text-slate-900 text-sm leading-none">{title}</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {comparison && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black ${
              comparison.change > 0 ? 'bg-emerald-50 text-emerald-600' : comparison.change < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
            }`}>
              <i className={`fas ${comparison.change > 0 ? 'fa-arrow-up' : comparison.change < 0 ? 'fa-arrow-down' : 'fa-minus'} text-[7px]`}></i>
              {Math.abs(comparison.change)}% vs mois dernier
            </div>
          )}
          <div className={`text-2xl font-black ${c.text}`}>{total}</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={PX} x2={W-PX} y1={PY + plotH * (1-pct)} y2={PY + plotH * (1-pct)}
            stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill={c.fill} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={c.stroke} strokeWidth="2" strokeLinejoin="round" />
        {/* Dots on hover */}
        {points.filter(p => p.count > 0).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill={c.stroke} opacity="0.6" />
            <title>{p.date}: {p.count}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-1 px-2">
        <span className="text-[8px] font-bold text-slate-300">{days[0]._id.slice(5)}</span>
        <span className="text-[8px] font-bold text-slate-300">{days[14]?._id.slice(5)}</span>
        <span className="text-[8px] font-bold text-slate-300">{days[29]._id.slice(5)}</span>
      </div>
    </div>
  );
};

// Donut Chart (SVG)
const DonutChart: React.FC<{ segments: { label: string; value: number; color: string }[] }> = ({ segments }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <EmptyMini text="Aucune donnée" />;
  const size = 140, cx = size/2, cy = size/2, r = 52, sw = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        {segments.filter(s => s.value > 0).map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circ;
          const gap = circ - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              style={{ transition: 'stroke-dasharray 0.8s ease, stroke-dashoffset 0.8s ease' }}
            />
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          className="fill-slate-800 text-xl font-black rotate-90" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {total}
        </text>
      </svg>
      <div className="flex-1 space-y-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }}></div>
            <span className="text-xs font-bold text-slate-600 flex-1">{seg.label}</span>
            <span className="text-xs font-black text-slate-900">{seg.value}</span>
            <span className="text-[9px] font-bold text-slate-300">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Horizontal Bar List
const HorizontalBarList: React.FC<{ items: { label: string; value: number; sub?: string }[]; color: string }> = ({ items, color }) => {
  const max = Math.max(1, ...items.map(i => i.value));
  const barColors: Record<string, string> = {
    rose: 'bg-rose-500', emerald: 'bg-emerald-500', cyan: 'bg-cyan-500', blue: 'bg-blue-500', amber: 'bg-amber-500', violet: 'bg-violet-500',
  };
  const badgeColors: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600', emerald: 'bg-emerald-50 text-emerald-600', cyan: 'bg-cyan-50 text-cyan-600',
    blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600',
  };
  const bar = barColors[color] || barColors.blue;
  const badge = badgeColors[color] || badgeColors.blue;
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black ${
                  i < 3 ? badge : 'bg-slate-50 text-slate-400'
                }`}>{i + 1}</span>
                <span className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.sub && <span className="text-[9px] font-bold text-slate-300">{item.sub}</span>}
                <span className={`text-xs font-black px-2 py-0.5 rounded-md ${badge}`}>{item.value}</span>
              </div>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${pct}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Adherence Trend Chart (stacked bars)
const AdherenceTrendChart: React.FC<{ data: AdherenceTrendPoint[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map(d => d.taken + d.missed));
  return (
    <div className="flex items-end gap-1.5" style={{ height: '80px' }}>
      {data.map((d, i) => {
        const total = d.taken + d.missed;
        const takenH = total > 0 ? (d.taken / max) * 72 : 0;
        const missedH = total > 0 ? (d.missed / max) * 72 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0 group">
            <div className="w-full flex flex-col items-stretch justify-end" style={{ height: '72px' }}>
              {missedH > 0 && <div className="w-full bg-red-400 rounded-t-sm" style={{ height: `${missedH}px` }} title={`Manquées: ${d.missed}`}></div>}
              {takenH > 0 && <div className={`w-full bg-emerald-400 ${missedH === 0 ? 'rounded-t-sm' : ''}`} style={{ height: `${takenH}px` }} title={`Prises: ${d.taken}`}></div>}
            </div>
            <span className="text-[7px] font-bold text-slate-300 mt-1">{d._id.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
};

// Activity Heatmap
const ActivityHeatmap: React.FC<{ data: HeatmapPoint[] }> = ({ data }) => {
  const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const max = Math.max(1, ...data.map(d => d.count));
  const getCount = (day: number, hour: number) => {
    const found = data.find(d => d._id.day === day && d._id.hour === hour);
    return found?.count || 0;
  };
  const hours = [0, 3, 6, 9, 12, 15, 18, 21];
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-1" style={{ gridTemplateColumns: `40px repeat(${hours.length}, 1fr)` }}>
        <div></div>
        {hours.map(h => <div key={h} className="text-[8px] font-bold text-slate-300 text-center">{h}h</div>)}
        {DAYS.map((day, dayIdx) => (
          <React.Fragment key={dayIdx}>
            <div className="text-[9px] font-bold text-slate-400 flex items-center">{day}</div>
            {hours.map(h => {
              const count = getCount(dayIdx + 1, h);
              const intensity = count / max;
              return (
                <div key={h} className="aspect-square rounded-md transition-all" title={`${day} ${h}h: ${count} demandes`}
                  style={{ backgroundColor: count > 0
                    ? `rgba(249, 115, 22, ${0.15 + intensity * 0.85})`
                    : '#f8fafc'
                  }}>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

// Weekly Comparison Card
const ComparisonCard: React.FC<{ label: string; thisWeek: number; lastWeek: number; change: number; icon: string; color: string }> = ({ label, thisWeek, lastWeek, change, icon, color }) => {
  const colorMap: Record<string, { iconBg: string; text: string }> = {
    blue: { iconBg: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
    amber: { iconBg: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
    violet: { iconBg: 'bg-violet-100 text-violet-600', text: 'text-violet-600' },
    emerald: { iconBg: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs ${c.iconBg}`}>
          <i className={`fas ${icon}`}></i>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-bold text-slate-400 mb-0.5">Cette semaine</div>
          <div className={`text-2xl font-black ${c.text}`}>{thisWeek}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-300 mb-0.5">Semaine dernière</div>
          <div className="text-lg font-black text-slate-400">{lastWeek}</div>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${
          change > 0 ? 'bg-emerald-50 text-emerald-600' : change < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'
        }`}>
          <i className={`fas ${change > 0 ? 'fa-arrow-up' : change < 0 ? 'fa-arrow-down' : 'fa-minus'} text-[8px]`}></i>
          {Math.abs(change)}%
        </div>
      </div>
    </div>
  );
};

// Empty mini state
const EmptyMini: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-8 text-center">
    <i className="fas fa-chart-area text-3xl text-slate-100 mb-2"></i>
    <p className="text-xs font-bold text-slate-300">{text}</p>
  </div>
);

// KPI Card — primary stats with gradient
const KpiCard: React.FC<{ label: string; value: number; sub?: string; icon: string; gradient: string }> = ({ label, value, sub, icon, gradient }) => (
  <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} rounded-3xl p-6 shadow-lg text-white`}>
    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
    <div className="relative">
      <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center text-lg mb-4">
        <i className={`fas ${icon}`}></i>
      </div>
      <div className="text-3xl font-black leading-none mb-1">{value}</div>
      <p className="text-[10px] font-black uppercase tracking-widest text-white/70">{label}</p>
      {sub && <p className="text-[10px] font-medium text-white/60 mt-1">{sub}</p>}
    </div>
  </div>
);

// Metric Card — secondary stats with progress indicator
const MetricCard: React.FC<{ label: string; value: number; total: number; icon: string; color: string }> = ({ label, value, total, icon, color }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const colorMap: Record<string, { bg: string; bar: string; icon: string; text: string }> = {
    blue:   { bg: 'bg-blue-50',   bar: 'bg-blue-500',   icon: 'bg-blue-100 text-blue-600',   text: 'text-blue-600' },
    emerald:{ bg: 'bg-emerald-50',bar: 'bg-emerald-500', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
    amber:  { bg: 'bg-amber-50',  bar: 'bg-amber-500',  icon: 'bg-amber-100 text-amber-600',  text: 'text-amber-600' },
    rose:   { bg: 'bg-rose-50',   bar: 'bg-rose-500',   icon: 'bg-rose-100 text-rose-600',    text: 'text-rose-600' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${c.icon}`}>
          <i className={`fas ${icon}`}></i>
        </div>
        <div>
          <div className="text-2xl font-black text-slate-900 leading-none">{value}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${c.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }}></div>
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[9px] font-bold text-slate-400">{pct}% du total</span>
        <span className="text-[9px] font-bold text-slate-400">{total} total</span>
      </div>
    </div>
  );
};

// Trend Card — bar chart
const TrendCard: React.FC<{ title: string; subtitle: string; data?: TrendPoint[]; color: string; icon: string }> = ({ title, subtitle, data, color, icon }) => {
  const colorMap: Record<string, { bar: string; barHover: string; text: string; bg: string; iconBg: string }> = {
    blue:   { bar: 'bg-blue-400',   barHover: 'hover:bg-blue-600',   text: 'text-blue-600',   bg: 'bg-blue-50',   iconBg: 'bg-blue-100 text-blue-600' },
    amber:  { bar: 'bg-amber-400',  barHover: 'hover:bg-amber-600',  text: 'text-amber-600',  bg: 'bg-amber-50',  iconBg: 'bg-amber-100 text-amber-600' },
    emerald:{ bar: 'bg-emerald-400',barHover: 'hover:bg-emerald-600',text: 'text-emerald-600',bg: 'bg-emerald-50',iconBg: 'bg-emerald-100 text-emerald-600' },
  };
  const c = colorMap[color] || colorMap.blue;

  // Fill last 7 days
  const days: TrendPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const found = (data || []).find(p => p._id === key);
    days.push({ _id: key, count: found?.count || 0 });
  }
  const max = Math.max(1, ...days.map(d => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${c.iconBg}`}>
            <i className={`fas ${icon} text-sm`}></i>
          </div>
          <div>
            <h4 className="font-black text-slate-900 text-sm leading-none">{title}</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className={`text-2xl font-black ${c.text}`}>{total}</div>
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {days.map(d => {
          const h = Math.max(4, (d.count / max) * 72);
          return (
            <div key={d._id} className="flex-1 flex flex-col items-center gap-1 group/bar">
              <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
                <div
                  className={`w-full ${c.bar} ${c.barHover} rounded-t-lg transition-all duration-300 cursor-default relative`}
                  style={{ height: `${h}px` }}
                  title={`${d.count}`}
                >
                  {d.count > 0 && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition whitespace-nowrap pointer-events-none">
                      {d.count}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[8px] font-bold text-slate-400">{d._id.slice(8)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Form Input with leading icon
const FormInput: React.FC<{
  icon: string; placeholder: string; value: string; type?: string;
  onChange: (v: string) => void; className?: string; onEnter?: () => void;
}> = ({ icon, placeholder, value, type = 'text', onChange, className = '', onEnter }) => (
  <div className={`relative ${className}`}>
    <i className={`fas ${icon} absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-sm pointer-events-none`}></i>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onEnter ? (e) => { if (e.key === 'Enter') onEnter(); } : undefined}
      className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition text-sm placeholder:text-slate-300"
      step={type === 'number' ? '0.0001' : undefined}
    />
  </div>
);

// Action button (icon only)
const ActionBtn: React.FC<{ icon: string; title: string; color: 'blue' | 'amber' | 'red'; onClick: () => void }> = ({ icon, title, color, onClick }) => {
  const colorMap = {
    blue:  'bg-blue-50 text-blue-500 hover:bg-blue-600 hover:text-white',
    amber: 'bg-amber-50 text-amber-500 hover:bg-amber-600 hover:text-white',
    red:   'bg-red-50 text-red-400 hover:bg-red-600 hover:text-white',
  };
  return (
    <button onClick={onClick} title={title}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition text-sm ${colorMap[color]}`}>
      <i className={`fas ${icon} text-xs`}></i>
    </button>
  );
};

// Empty state
const EmptyState: React.FC<{ icon: string; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
      <i className={`fas ${icon} text-4xl text-slate-200`}></i>
    </div>
    <h4 className="text-base font-black text-slate-400">{title}</h4>
    <p className="text-sm text-slate-300 font-medium mt-1">{subtitle}</p>
  </div>
);

// Modal wrapper
const Modal: React.FC<{
  onClose: () => void; title: string; children: React.ReactNode;
  icon: string; accentColor: string;
}> = ({ onClose, title, children, icon, accentColor }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
      {/* Modal header */}
      <div className={`bg-gradient-to-r ${accentColor} px-7 py-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-2xl flex items-center justify-center text-white">
              <i className={`fas ${icon} text-sm`}></i>
            </div>
            <h3 className="text-lg font-black text-white">{title}</h3>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center text-white transition">
            <i className="fas fa-xmark text-sm"></i>
          </button>
        </div>
      </div>
      {/* Modal body */}
      <div className="p-7 space-y-5">
        {children}
      </div>
    </div>
  </div>
);

// Modal action buttons
const ModalActions: React.FC<{
  onConfirm: () => void; onCancel: () => void;
  confirmLabel: string; confirmColor: string; disabled?: boolean;
}> = ({ onConfirm, onCancel, confirmLabel, confirmColor, disabled }) => (
  <div className="flex gap-3 pt-1">
    <button onClick={onConfirm} disabled={disabled}
      className={`flex-1 py-3.5 bg-gradient-to-r ${confirmColor} text-white font-black rounded-2xl transition shadow-lg hover:shadow-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-sm`}>
      {confirmLabel}
    </button>
    <button onClick={onCancel}
      className="px-6 py-3.5 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition text-sm">
      Annuler
    </button>
  </div>
);

export default AdminPanel;
