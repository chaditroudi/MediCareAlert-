
import React, { useState, useEffect, useMemo } from 'react';
import { useAppFeedback } from './AppFeedbackProvider';
import { User, Medication, UserRole } from '../types';
import PrescriptionScanner from './PrescriptionScanner';
import MedicationModal from './MedicationModal';
import { API_BASE, resolveAssetUrl } from '../lib/appConfig';

interface DashboardProps {
  user: User;
  token: string;
  medications: Medication[];
  setMedications: React.Dispatch<React.SetStateAction<Medication[]>>;
  onViewChange: (view: any) => void;
}

interface AdminOverviewStats {
  totalUsers: number;
  patients: number;
  pharmacists: number;
  admins: number;
  totalPharmacies: number;
  pendingRequests: number;
  totalRequests: number;
  outOfStockItems: number;
  totalInventoryItems: number;
  prescriptions: number;
  processedPrescriptions: number;
  totalCategories: number;
}

const getCurrentTimeLabel = (date: Date): string =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const timeToMinutes = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const resolveFallbackDoseTime = (med: Medication, scheduledTime?: string): string => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const handledTimes = new Set(
    (med.history || [])
      .filter((entry) => entry.date === today && entry.status === 'taken')
      .map((entry) => entry.time)
  );

  if (scheduledTime && med.schedules?.includes(scheduledTime) && !handledTimes.has(scheduledTime)) {
    return scheduledTime;
  }

  const pendingSchedules = (med.schedules || []).filter((time) => !handledTimes.has(time));
  if (pendingSchedules.length === 0) {
    return getCurrentTimeLabel(now);
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return [...pendingSchedules].sort((a, b) => {
    return Math.abs(timeToMinutes(a) - nowMinutes) - Math.abs(timeToMinutes(b) - nowMinutes);
  })[0];
};

const Dashboard: React.FC<DashboardProps> = ({ user, token, medications = [], setMedications, onViewChange }) => {
  const [showScanner, setShowScanner] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [greeting, setGreeting] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState<{ prescriptions: number; requests: number } | null>(null);
  const [adminStats, setAdminStats] = useState<AdminOverviewStats | null>(null);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Greeting based on time
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir');
  }, []);

  // Fetch quick stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [presRes, reqRes] = await Promise.all([
          fetch(`${API_BASE}/prescriptions`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/requests`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const prescriptions = presRes.ok ? (await presRes.json()).length : 0;
        const requests = reqRes.ok ? (await reqRes.json()).length : 0;
        setStats({ prescriptions, requests });
      } catch { setStats({ prescriptions: 0, requests: 0 }); }
    };
    fetchStats();
  }, [token]);

  useEffect(() => {
    if (user.role !== UserRole.ADMIN) {
      setAdminStats(null);
      return;
    }

    const fetchAdminStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Admin stats unavailable');
        setAdminStats(await response.json());
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
        setAdminStats(null);
      }
    };

    fetchAdminStats();
  }, [token, user.role]);

  const handleTakeMedication = async (id: string, scheduledTime?: string) => {
    try {
      const response = await fetch(`${API_BASE}/medications/${id}/take`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scheduledTime ? { scheduledTime } : {}),
      });
      
      if (!response.ok) {
        if (response.status === 409) {
          const duplicatePayload = await response.json();
          const serverMed = duplicatePayload?.medication;
          if (serverMed) {
            const today = new Date().toISOString().split('T')[0];
            const takenTodayCount = (serverMed.history || []).filter((h: any) => h.date === today && h.status === 'taken').length;
            setMedications(prev => prev.map(m => (m.id === id || (m as any)._id === id) ? { ...serverMed, takenTodayCount } : m));
            return;
          }
        }
        throw new Error('Erreur lors de la mise à jour');
      }
      
      const updatedMed = await response.json();
      const today = new Date().toISOString().split('T')[0];
      const takenTodayCount = (updatedMed.history || []).filter((h: any) => h.date === today && h.status === 'taken').length;
      setMedications(prev => prev.map(m => (m.id === id || (m as any)._id === id) ? { ...updatedMed, takenTodayCount } : m));
    } catch (err) {
      console.error("Failed to take medication:", err);
      // Fallback local
      setMedications(prev => prev.map(m => {
        if (m.id === id || (m as any)._id === id) {
          const now = new Date();
          const resolvedTime = resolveFallbackDoseTime(m, scheduledTime);
          const newHistory = [...(m.history || []), {
            date: now.toISOString().split('T')[0],
            time: resolvedTime,
            status: 'taken' as const
          }];
          
          return { 
            ...m, 
            takenTodayCount: (m.takenTodayCount || 0) + 1,
            stockCount: Math.max(0, (m.stockCount || 0) - 1),
            history: newHistory
          };
        }
        return m;
      }));
    }
  };

  const handleAddMedication = async (newMed: Partial<Medication>, imageFile?: File) => {
    try {
      const response = await fetch(`${API_BASE}/medications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newMed.name || 'Médicament sans nom',
          dosage: newMed.dosage || '1 unité',
          frequency: newMed.frequency || '1x par jour',
          durationInDays: newMed.durationInDays || 7,
          startDate: new Date().toISOString(),
          stockCount: newMed.stockCount || 30,
          threshold: newMed.threshold || 5,
          schedules: newMed.schedules || ['08:00'],
          history: [],
          isActive: true,
          takenTodayCount: 0
        })
      });

      if (!response.ok) throw new Error('Erreur lors de l\'ajout');

      let savedMed = await response.json();

      // Upload image if provided
      if (imageFile && savedMed.id) {
        try {
          const fd = new FormData();
          fd.append('image', imageFile);
          const imgRes = await fetch(`${API_BASE}/medications/${savedMed.id}/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: fd,
          });
          if (imgRes.ok) savedMed = await imgRes.json();
        } catch (_) { /* image upload is best-effort */ }
      }

      setMedications(prev => [...prev, savedMed]);
      setShowAddModal(false);
    } catch (err) {
      console.error("Failed to add medication:", err);
      const formatted: Medication = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id,
        name: newMed.name || 'Médicament sans nom',
        dosage: newMed.dosage || '1 unité',
        frequency: newMed.frequency || '1x par jour',
        durationInDays: newMed.durationInDays || 7,
        startDate: new Date().toISOString(),
        stockCount: newMed.stockCount || 30,
        threshold: newMed.threshold || 5,
        schedules: newMed.schedules || ['08:00'],
        history: [],
        isActive: true,
        takenTodayCount: 0
      };
      setMedications(prev => [...prev, formatted]);
      setShowAddModal(false);
    }
  };

  const handleEditMedication = async (updated: Partial<Medication>, imageFile?: File) => {
    if (!editingMed) return;
    const id = editingMed.id || (editingMed as any)._id;
    try {
      const response = await fetch(`${API_BASE}/medications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updated)
      });
      if (!response.ok) throw new Error('Update failed');
      let saved = await response.json();

      // Upload image if provided
      if (imageFile) {
        try {
          const fd = new FormData();
          fd.append('image', imageFile);
          const imgRes = await fetch(`${API_BASE}/medications/${id}/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: fd,
          });
          if (imgRes.ok) saved = await imgRes.json();
        } catch (_) { /* image upload is best-effort */ }
      }

      const today = new Date().toISOString().split('T')[0];
      const takenTodayCount = (saved.history || []).filter((h: any) => h.date === today && h.status === 'taken').length;
      setMedications(prev => prev.map(m => (m.id === id || (m as any)._id === id) ? { ...saved, takenTodayCount } : m));
    } catch (err) {
      console.error('Failed to edit medication:', err);
      setMedications(prev => prev.map(m => (m.id === id || (m as any)._id === id) ? { ...m, ...updated } : m));
    }
    setEditingMed(null);
  };

  const handleDeleteMedication = async (id: string) => {
    try {
      await fetch(`${API_BASE}/medications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMedications(prev => prev.filter(m => m.id !== id && (m as any)._id !== id));
    } catch (err) {
      console.error('Failed to delete medication:', err);
    }
  };

  const triggerTestAlert = () => {
    const testTime = new Date();
    testTime.setMinutes(testTime.getMinutes() + 1); // 1 minute from now
    
    const testMed: Medication = {
      id: 'test-id',
      userId: '1',
      name: 'Test Vitamin',
      dosage: '500mg',
      frequency: 'Test',
      durationInDays: 1,
      startDate: new Date().toISOString(),
      stockCount: 1,
      threshold: 5,
      schedules: [testTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })],
      history: [],
      isActive: true,
      takenTodayCount: 0
    };
    setMedications(prev => [...prev, testMed]);
    
    setTimeout(() => {
      setMedications(prev => prev.filter(m => m.id !== 'test-id'));
    }, 60000);
  };

  const isExpired = (med: Medication) => {
    if (!med.startDate) return false;
    const start = new Date(med.startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + (med.durationInDays || 0));
    return new Date() > end;
  };

  const activeMeds = medications.filter(m => !isExpired(m));
  const completedMeds = medications.filter(m => isExpired(m));

  const totalDosesToday = activeMeds.reduce((acc, m) => acc + (m.schedules?.length || 0), 0);
  const takenDosesToday = activeMeds.reduce((acc, m) => acc + (m.takenTodayCount || 0), 0);
  const progress = totalDosesToday > 0 ? Math.round((takenDosesToday / totalDosesToday) * 100) : 0;
  
  const outOfStockMeds = activeMeds.filter(m => (m.stockCount || 0) === 0);
  const lowStockMeds = activeMeds.filter(m => (m.stockCount || 0) > 0 && (m.stockCount || 0) <= (m.threshold || 0));

  // Next dose calculation
  const nextDose = useMemo(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let closest: { med: Medication; time: string; minutesAway: number } | null = null;
    for (const med of activeMeds) {
      for (const time of (med.schedules || [])) {
        const [h, m] = time.split(':').map(Number);
        const sMin = h * 60 + m;
        const diff = sMin - nowMinutes;
        if (diff > 0 && (!closest || diff < closest.minutesAway)) {
          closest = { med, time, minutesAway: diff };
        }
      }
    }
    return closest;
  }, [activeMeds, currentTime]);

  // Streak calculation (consecutive days with 100% adherence)
  const streak = useMemo(() => {
    let days = 0;
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayTaken = medications.reduce((acc, med) => acc + (med.history || []).filter(h => h.date === dateStr && h.status === 'taken').length, 0);
      const dayTotal = activeMeds.reduce((acc, m) => acc + (m.schedules?.length || 0), 0);
      if (dayTotal > 0 && dayTaken >= dayTotal) days++;
      else break;
    }
    return days;
  }, [medications, activeMeds]);

  // Role-specific helpers
  const isPatient = user.role === UserRole.PATIENT;
  const isPharmacist = user.role === UserRole.PHARMACIST;
  const isAdmin = user.role === UserRole.ADMIN;
  const adminCompletionRate = adminStats?.prescriptions
    ? Math.round(((adminStats.processedPrescriptions || 0) / adminStats.prescriptions) * 100)
    : 0;
  const adminInventoryRisk = adminStats?.totalInventoryItems
    ? Math.round(((adminStats.outOfStockItems || 0) / adminStats.totalInventoryItems) * 100)
    : 0;
  const adminRoleMix = adminStats ? [
    { label: 'Patients', value: adminStats.patients, bar: 'bg-blue-500' },
    { label: 'Pharmaciens', value: adminStats.pharmacists, bar: 'bg-emerald-500' },
    { label: 'Administrateurs', value: adminStats.admins, bar: 'bg-amber-500' },
  ] : [];

  return (
    <div className="space-y-8 pb-12">
      {/* ── Welcome Banner ── */}
      <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 rounded-[2rem] text-white overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-20 w-40 h-40 bg-white/5 rounded-full translate-y-1/2"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-blue-200 text-sm font-semibold mb-1">
              {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <h1 className="text-3xl md:text-4xl font-black mb-1">{greeting}, {user.name.split(' ')[0]} 👋</h1>
            <p className="text-blue-200 font-medium">
              {isPatient && (progress === 100 ? 'Toutes vos doses sont prises — excellent !' : `${totalDosesToday - takenDosesToday} dose${totalDosesToday - takenDosesToday !== 1 ? 's' : ''} restante${totalDosesToday - takenDosesToday !== 1 ? 's' : ''} aujourd'hui`)}
              {isPharmacist && 'Gérez votre inventaire et les demandes patients'}
              {isAdmin && 'Vue générale du projet, des comptes et des demandes en cours'}
            </p>
          </div>
          {nextDose && isPatient && (
            <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-2xl px-6 py-4 text-center min-w-[180px]">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Prochaine dose</p>
              <p className="text-3xl font-black">{nextDose.time}</p>
              <p className="text-sm text-blue-100 font-semibold">{nextDose.med.name}</p>
              <p className="text-xs text-blue-300">dans {nextDose.minutesAway} min</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {isPatient && (
          <>
            <StatCard
              icon="fa-heart-pulse" iconBg="bg-rose-50" iconColor="text-rose-500"
              value={`${progress}%`} label="Adhérence"
              sub={`${takenDosesToday}/${totalDosesToday} doses`}
            />
            <StatCard
              icon="fa-fire" iconBg="bg-orange-50" iconColor="text-orange-500"
              value={`${streak}j`} label="Série"
              sub={streak > 0 ? 'Jours consécutifs' : 'Commencez demain !'}
            />
            <StatCard
              icon="fa-pills" iconBg="bg-blue-50" iconColor="text-blue-500"
              value={`${activeMeds.length}`} label="Traitements"
              sub={`${completedMeds.length} terminé${completedMeds.length !== 1 ? 's' : ''}`}
            />
            <StatCard
              icon="fa-triangle-exclamation" iconBg="bg-amber-50" iconColor="text-amber-500"
              value={`${lowStockMeds.length}`} label="Stock bas"
              sub={lowStockMeds.length > 0 ? 'Réappro. nécessaire' : 'Tout est OK'}
              alert={lowStockMeds.length > 0}
            />
          </>
        )}
        {isPharmacist && (
          <>
            <StatCard icon="fa-boxes-stacked" iconBg="bg-blue-50" iconColor="text-blue-500" value="—" label="Inventaire" sub="Voir détails" onClick={() => onViewChange('inventory')} />
            <StatCard icon="fa-clipboard-list" iconBg="bg-purple-50" iconColor="text-purple-500" value={`${stats?.requests ?? '—'}`} label="Demandes" sub="Patients" onClick={() => onViewChange('requests')} />
            <StatCard icon="fa-prescription" iconBg="bg-emerald-50" iconColor="text-emerald-500" value={`${stats?.prescriptions ?? '—'}`} label="Ordonnances" sub="Total" />
            <StatCard icon="fa-map-location-dot" iconBg="bg-teal-50" iconColor="text-teal-500" value="—" label="Pharmacie" sub="Ma localisation" onClick={() => onViewChange('map')} />
          </>
        )}
        {isAdmin && (
          <>
            <StatCard icon="fa-users" iconBg="bg-blue-50" iconColor="text-blue-500" value={`${adminStats?.totalUsers ?? '—'}`} label="Utilisateurs" sub={`${adminStats?.patients ?? 0} patients`} onClick={() => onViewChange('admin')} />
            <StatCard icon="fa-store" iconBg="bg-emerald-50" iconColor="text-emerald-500" value={`${adminStats?.totalPharmacies ?? '—'}`} label="Pharmacies" sub="Réseau actif" onClick={() => onViewChange('admin')} />
            <StatCard icon="fa-clipboard-list" iconBg="bg-purple-50" iconColor="text-purple-500" value={`${adminStats?.pendingRequests ?? stats?.requests ?? '—'}`} label="Demandes" sub="À surveiller" onClick={() => onViewChange('requests')} alert={(adminStats?.pendingRequests ?? 0) > 0} />
            <StatCard icon="fa-shield-halved" iconBg="bg-rose-50" iconColor="text-rose-500" value={`${adminStats?.outOfStockItems ?? '—'}`} label="Ruptures" sub="Risque réseau" onClick={() => onViewChange('admin')} alert={(adminStats?.outOfStockItems ?? 0) > 0} />
          </>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-7">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-full text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Espace Admin
                </div>
                <h2 className="mt-4 text-2xl font-black text-slate-900">Vue générale de la plateforme</h2>
                <p className="mt-2 text-sm font-medium text-slate-500 max-w-2xl">
                  Consultez rapidement les demandes, les ruptures de stock et la répartition des comptes avant d'ouvrir l'administration détaillée.
                </p>
              </div>
              <button
                onClick={() => onViewChange('admin')}
                className="px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-lg"
              >
                Ouvrir Le Panneau Admin
              </button>
            </div>

            <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Demandes en attente', value: adminStats?.pendingRequests ?? 0, hint: 'Suivi opérationnel immédiat', icon: 'fa-inbox', gradient: 'from-amber-500 to-orange-500', click: 'requests' },
                { label: 'Ruptures réseau', value: adminStats?.outOfStockItems ?? 0, hint: 'Stock critique à traiter', icon: 'fa-triangle-exclamation', gradient: 'from-rose-500 to-red-600', click: 'admin' },
                { label: 'Catégories actives', value: adminStats?.totalCategories ?? 0, hint: 'Structure catalogue', icon: 'fa-tags', gradient: 'from-blue-500 to-indigo-600', click: 'admin' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => onViewChange(item.click)}
                  className={`text-left bg-gradient-to-br ${item.gradient} rounded-[1.75rem] p-5 text-white shadow-xl hover:scale-[1.01] transition-transform`}
                >
                  <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
                    <i className={`fas ${item.icon} text-lg`}></i>
                  </div>
                  <div className="text-3xl font-black leading-none">{item.value}</div>
                  <p className="mt-2 text-sm font-black">{item.label}</p>
                  <p className="mt-1 text-xs font-medium text-white/75">{item.hint}</p>
                </button>
              ))}
            </div>

            <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-[1.75rem] p-5 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Traitement des ordonnances</p>
                    <p className="mt-1 text-3xl font-black text-slate-900">{adminCompletionRate}%</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <i className="fas fa-file-waveform"></i>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: `${adminCompletionRate}%` }}></div>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {adminStats?.processedPrescriptions ?? 0} traitées sur {adminStats?.prescriptions ?? 0} ordonnances.
                </p>
              </div>

              <div className="bg-slate-50 rounded-[1.75rem] p-5 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Exposition aux ruptures</p>
                    <p className="mt-1 text-3xl font-black text-slate-900">{adminInventoryRisk}%</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                    <i className="fas fa-triangle-exclamation"></i>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-slate-100">
                  <div className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full" style={{ width: `${adminInventoryRisk}%` }}></div>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {adminStats?.outOfStockItems ?? 0} lignes critiques sur {adminStats?.totalInventoryItems ?? 0}.
                </p>
              </div>
            </div>
          </div>

          <div className="xl:col-span-4 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 md:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Répartition Des Rôles</p>
                <h3 className="mt-2 text-xl font-black text-slate-900">Équilibre du réseau</h3>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <i className="fas fa-chart-pie"></i>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {adminRoleMix.map((item) => {
                const totalUsers = adminStats?.totalUsers || 1;
                const width = Math.round((item.value / totalUsers) * 100);
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-700">{item.label}</span>
                      <span className="text-sm font-black text-slate-900">{item.value}</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.bar}`} style={{ width: `${width}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 p-4 rounded-[1.5rem] bg-gradient-to-br from-slate-900 to-slate-800 text-white">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Focus Du Jour</p>
              <div className="mt-3 space-y-3 text-sm font-medium text-slate-200">
                <p className="flex items-start gap-3"><span className="mt-1 w-2 h-2 rounded-full bg-amber-400"></span>Surveillez les demandes patient qui restent bloquées.</p>
                <p className="flex items-start gap-3"><span className="mt-1 w-2 h-2 rounded-full bg-rose-400"></span>Réduisez les ruptures sur les pharmacies les plus sollicitées.</p>
                <p className="flex items-start gap-3"><span className="mt-1 w-2 h-2 rounded-full bg-blue-400"></span>Gardez les rôles admin et pharmacien bien séparés.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Progress Ring (patients) ── */}
      {isPatient && totalDosesToday > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* SVG Ring */}
            <div className="relative w-36 h-36 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={progress >= 80 ? '#10b981' : progress >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${(progress / 100) * 326.73} 326.73`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-800">{progress}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complété</span>
              </div>
            </div>

            {/* Dose breakdown */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
              {activeMeds.slice(0, 4).map(med => {
                const taken = med.takenTodayCount || 0;
                const total = med.schedules?.length || 0;
                const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
                return (
                  <div key={med.id || (med as any)._id} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-700 truncate">{med.name}</p>
                    <p className="text-2xl font-black text-slate-900">{taken}/{total}</p>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isPatient && (
          <>
            <QuickAction icon="fa-camera" label="Scanner" sub="Depuis ordonnance" gradient="from-emerald-500 to-teal-600" shadow="shadow-emerald-200" onClick={() => setShowScanner(true)} />
            <QuickAction icon="fa-pen-to-square" label="Saisie Manuelle" sub="Ajouter sans scanner" gradient="from-blue-500 to-indigo-600" shadow="shadow-blue-200" onClick={() => setShowAddModal(true)} />
            <QuickAction icon="fa-calendar-check" label="Planning" sub="Voir les horaires" gradient="from-amber-500 to-orange-600" shadow="shadow-amber-200" onClick={() => onViewChange('schedule')} />
            <QuickAction icon="fa-map-location-dot" label="Pharmacies" sub="Près de moi" gradient="from-purple-500 to-fuchsia-600" shadow="shadow-purple-200" onClick={() => onViewChange('map')} />
          </>
        )}
        {isPharmacist && (
          <>
            <QuickAction icon="fa-boxes-stacked" label="Inventaire" sub="Gérer stock" gradient="from-blue-500 to-indigo-600" shadow="shadow-blue-200" onClick={() => onViewChange('inventory')} />
            <QuickAction icon="fa-clipboard-list" label="Demandes" sub="Voir les requêtes" gradient="from-purple-500 to-fuchsia-600" shadow="shadow-purple-200" onClick={() => onViewChange('requests')} />
            <QuickAction icon="fa-camera" label="Scanner" sub="Scanner ordonnance" gradient="from-emerald-500 to-teal-600" shadow="shadow-emerald-200" onClick={() => setShowScanner(true)} />
            <QuickAction icon="fa-map-location-dot" label="Ma Pharmacie" sub="Localisation" gradient="from-teal-500 to-cyan-600" shadow="shadow-teal-200" onClick={() => onViewChange('map')} />
          </>
        )}
        {isAdmin && (
          <>
            <QuickAction
              icon="fa-shield-halved"
              label="Vue Projet"
              sub={`${adminStats?.pendingRequests ?? 0} demandes critiques`}
              gradient="from-rose-500 to-red-600"
              shadow="shadow-rose-200"
              onClick={() => onViewChange('admin')}
            />
            <QuickAction
              icon="fa-clipboard-list"
              label="Demandes"
              sub={`${adminCompletionRate}% d'ordonnances traitées`}
              gradient="from-purple-500 to-fuchsia-600"
              shadow="shadow-purple-200"
              onClick={() => onViewChange('requests')}
            />
            <QuickAction
              icon="fa-boxes-stacked"
              label="Stock"
              sub={`${adminStats?.outOfStockItems ?? 0} lignes à risque`}
              gradient="from-blue-500 to-indigo-600"
              shadow="shadow-blue-200"
              onClick={() => onViewChange('inventory')}
            />
            <QuickAction
              icon="fa-users-gear"
              label="Utilisateurs"
              sub={`${adminStats?.totalUsers ?? 0} comptes supervisés`}
              gradient="from-amber-500 to-orange-600"
              shadow="shadow-amber-200"
              onClick={() => onViewChange('admin')}
            />
          </>
        )}
      </div>

      {/* ── Out Of Stock Alert ── */}
      {outOfStockMeds.length > 0 && isPatient && (
        <div className="bg-gradient-to-r from-red-600 to-rose-700 border border-red-500 p-5 rounded-[2rem] flex items-center gap-5 shadow-xl shadow-red-200 text-white">
          <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
            <i className="fas fa-siren-on text-2xl"></i>
          </div>
          <div className="flex-1">
            <h4 className="text-base font-black leading-none mb-1">Rupture de stock détectée</h4>
            <p className="text-sm font-bold text-red-100">
              {outOfStockMeds.map(m => m.name).join(', ')} indisponible{outOfStockMeds.length > 1 ? 's' : ''} maintenant
            </p>
          </div>
          <button onClick={() => onViewChange('map')} className="px-5 py-2.5 bg-white text-red-700 text-xs font-black rounded-xl hover:bg-red-50 transition shadow-md whitespace-nowrap">
            TROUVER UNE PHARMACIE
          </button>
        </div>
      )}

      {/* ── Low Stock Alert ── */}
      {lowStockMeds.length > 0 && isPatient && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 p-5 rounded-[2rem] flex items-center gap-5 shadow-lg shadow-red-100/50">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <i className="fas fa-triangle-exclamation text-2xl"></i>
          </div>
          <div className="flex-1">
            <h4 className="text-base font-black text-red-900 leading-none mb-1">Réapprovisionnement Recommandé</h4>
            <p className="text-sm font-bold text-red-700 opacity-80">
              {lowStockMeds.map(m => m.name).join(', ')} — stock bas
            </p>
          </div>
          <button onClick={() => onViewChange('map')} className="px-5 py-2.5 bg-red-600 text-white text-xs font-black rounded-xl hover:bg-red-700 transition shadow-md whitespace-nowrap">
            PHARMACIES
          </button>
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
             <h2 className="text-3xl font-black text-slate-900">Traitement Actuel</h2>
             <button 
               onClick={() => setShowAddModal(true)}
               className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90"
             >
               <i className="fas fa-plus"></i>
             </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeMeds.length === 0 ? (
            <div className="col-span-full text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                 <i className="fas fa-pills text-5xl"></i>
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Aucun traitement actif</h3>
              <p className="text-slate-400 max-w-sm mx-auto font-medium mb-8">Scannez votre ordonnance ou ajoutez un médicament manuellement pour commencer.</p>
              <button 
                onClick={() => setShowAddModal(true)}
                className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 active:scale-95"
              >
                AJOUTER MANUELLEMENT
              </button>
            </div>
          ) : (
            activeMeds.map(med => <MedicationCard key={med.id || (med as any)._id} med={med} onTake={handleTakeMedication} onEdit={setEditingMed} onDelete={handleDeleteMedication} />)
          )}
        </div>
      </section>

      {showScanner && (
        <PrescriptionScanner 
          token={token}
          onClose={() => setShowScanner(false)} 
          onComplete={(newMeds) => {
            newMeds.forEach(m => handleAddMedication(m));
            setShowScanner(false);
          }} 
        />
      )}

      {showAddModal && (
        <MedicationModal 
          onClose={() => setShowAddModal(false)}
          onSave={handleAddMedication}
        />
      )}

      {editingMed && (
        <MedicationModal
          editMed={editingMed}
          onClose={() => setEditingMed(null)}
          onSave={handleEditMedication}
        />
      )}

      {completedMeds.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-8 mt-4">
            <h2 className="text-2xl font-black text-slate-400">Traitements Terminés</h2>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-black">{completedMeds.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {completedMeds.map(med => <MedicationCard key={med.id || (med as any)._id} med={med} onTake={handleTakeMedication} isCompleted />)}
          </div>
        </section>
      )}
    </div>
  );
};

// ── Sub-Components ───────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: string; iconBg: string; iconColor: string;
  value: string; label: string; sub: string;
  alert?: boolean; onClick?: () => void;
}> = ({ icon, iconBg, iconColor, value, label, sub, alert, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all ${onClick ? 'cursor-pointer' : ''} ${alert ? 'border-amber-200 bg-amber-50/30' : ''}`}
  >
    <div className={`w-12 h-12 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center shrink-0`}>
      <i className={`fas ${icon} text-lg`}></i>
    </div>
    <div className="min-w-0">
      <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
      <p className="text-[10px] font-semibold text-slate-400 truncate">{sub}</p>
    </div>
  </div>
);

const QuickAction: React.FC<{
  icon: string; label: string; sub: string;
  gradient: string; shadow: string; onClick: () => void;
}> = ({ icon, label, sub, gradient, shadow, onClick }) => (
  <button
    onClick={onClick}
    className={`bg-gradient-to-br ${gradient} p-6 rounded-[2rem] shadow-xl ${shadow} text-white cursor-pointer hover:scale-[1.02] active:scale-95 transition-all flex flex-col items-start text-left`}
  >
    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3 backdrop-blur-md">
      <i className={`fas ${icon} text-xl`}></i>
    </div>
    <h3 className="text-lg font-black mb-0.5">{label}</h3>
    <p className="text-sm font-medium opacity-75">{sub}</p>
  </button>
);

const MedicationCard: React.FC<{ med: Medication, onTake: (id: string, scheduledTime?: string) => void, onEdit?: (med: Medication) => void, onDelete?: (id: string) => void, isCompleted?: boolean }> = ({ med, onTake, onEdit, onDelete, isCompleted }) => {
  const { confirm } = useAppFeedback();
  const stockCount = med.stockCount || 0;
  const threshold = med.threshold || 5;
  const schedules = med.schedules || [];
  const today = new Date().toISOString().split('T')[0];
  const takenTimesToday = new Set(
    (med.history || [])
      .filter(entry => entry.date === today && entry.status === 'taken')
      .map(entry => entry.time)
  );
  const takenToday = schedules.filter(time => takenTimesToday.has(time)).length;

  const stockStatus = stockCount === 0 
    ? 'RUPTURE DE STOCK' 
    : stockCount <= threshold 
      ? 'STOCK BAS' 
      : 'EN STOCK';
  
  const stockColor = stockCount === 0 
    ? 'bg-red-500' 
    : stockCount <= threshold 
      ? 'bg-amber-500' 
      : 'bg-emerald-500';

  const stockPercent = Math.min(100, (stockCount / (threshold * 4 || 1)) * 100);
  const allTaken = schedules.length > 0 && schedules.every(time => takenTimesToday.has(time));

  return (
    <div 
      className={`group bg-white p-8 rounded-[2.5rem] shadow-md border-2 transition-all duration-300 flex flex-col gap-8 relative overflow-hidden ${
        isCompleted ? 'border-slate-100 bg-slate-50/30 opacity-60' : 
        stockCount <= threshold ? 'border-red-100 shadow-red-50' : 'border-slate-50'
      } hover:shadow-xl hover:-translate-y-1`}
    >
      {(stockCount === 0 || isCompleted) && (
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 pointer-events-none flex items-center justify-center">
           <div className={`${isCompleted ? 'bg-slate-900' : 'bg-red-600'} text-white px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest rotate-[-5deg] shadow-lg border-2 border-white`}>
             {isCompleted ? 'Traitement Terminé' : 'Stock Épuisé'}
           </div>
        </div>
      )}

      <div className="flex justify-between items-start">
        {(med as any).imageUrl ? (
          <img
            src={resolveAssetUrl((med as any).imageUrl) || ''}
            alt={med.name}
            className="w-16 h-16 rounded-3xl object-cover shadow-lg border border-slate-100"
          />
        ) : (
          <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shadow-lg ${
            isCompleted ? 'bg-slate-100 text-slate-400' :
            stockCount <= threshold ? 'bg-red-50 text-red-600 shadow-red-100' : 'bg-blue-50 text-blue-600 shadow-blue-100'
          }`}>
          <i className={`fas ${isCompleted ? 'fa-check-double' : stockCount === 0 ? 'fa-hourglass-empty' : 'fa-capsules'}`}></i>
        </div>
        )}
        
        {!isCompleted && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(med); }}
                className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all text-sm"
                title="Modifier"
              >
                <i className="fas fa-pen"></i>
              </button>
            )}
            {onDelete && (
              <button 
                onClick={async (e) => {
                  e.stopPropagation();
                  const shouldDelete = await confirm({
                    title: 'Supprimer ce médicament ?',
                    message: `"${med.name}" sera retiré de votre liste de suivi.`,
                    tone: 'danger',
                    confirmLabel: 'Supprimer',
                    cancelLabel: 'Annuler',
                  });
                  if (shouldDelete) {
                    onDelete(med.id || (med as any)._id);
                  }
                }}
                className="w-9 h-9 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all text-sm"
                title="Supprimer"
              >
                <i className="fas fa-trash"></i>
              </button>
            )}
          </div>
        )}
        
        {!isCompleted && (
          <span className={`text-[10px] px-4 py-1.5 rounded-full font-black uppercase tracking-widest border-2 ${
            stockCount === 0 
              ? 'bg-red-100 border-red-200 text-red-600' 
              : stockCount <= threshold 
                ? 'bg-amber-100 border-amber-200 text-amber-700' 
                : 'bg-emerald-50 border-emerald-100 text-emerald-600'
          }`}>
            {stockStatus}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <h4 className="text-2xl font-black leading-tight text-slate-900">{med.name}</h4>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{med.dosage} • {med.frequency}</p>
      </div>

      {!isCompleted && (
        <>
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inventaire</span>
              <span className="text-sm font-black text-slate-700">{stockCount} unités</span>
            </div>
            <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-100">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${stockColor}`}
                style={{ width: `${stockPercent}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Doses Aujourd'hui</span>
               <span className="text-xs font-black text-slate-800">{takenToday}/{schedules.length}</span>
            </div>
              <div className="flex items-center gap-2 flex-wrap">
                {schedules.map((time, idx) => (
                  <div key={idx} className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 ${takenTimesToday.has(time) ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                   <i className={`fas ${takenTimesToday.has(time) ? 'fa-check-circle' : 'fa-clock opacity-40'}`}></i>
                   {time}
                 </div>
                ))}
            </div>
          </div>

          <button 
            onClick={() => onTake(med.id || (med as any)._id)}
            disabled={allTaken || stockCount === 0}
            className={`w-full py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-widest transition-all ${
              stockCount === 0 
                ? 'bg-slate-100 text-slate-300'
                : allTaken
                  ? 'bg-emerald-50 text-emerald-500'
                  : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-xl'
            }`}
          >
            {stockCount === 0 ? 'Rupture de Stock' : allTaken ? 'Routine Terminée' : 'Marquer comme Pris'}
          </button>
        </>
      )}
    </div>
  );
};

export default Dashboard;
