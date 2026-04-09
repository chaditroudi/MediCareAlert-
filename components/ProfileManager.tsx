import React, { useState, useEffect } from 'react';
import { User, Medication, UserRole } from '../types';

const API_BASE = 'http://localhost:5000/api';

interface ProfileManagerProps {
  user: User;
  token: string;
  medications: Medication[];
  onUserUpdate: (user: User) => void;
  onLogout: () => void;
  onViewChange: (view: any) => void;
}

const ProfileManager: React.FC<ProfileManagerProps> = ({ user, token, medications, onUserUpdate, onLogout, onViewChange }) => {
  const [profileForm, setProfileForm] = useState({ name: user.name || '', lat: '', lng: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pharmacy, setPharmacy] = useState<any>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [activeTab, setActiveTab] = useState<'info' | 'security' | 'notifications' | 'data'>('info');

  useEffect(() => {
    setProfileForm({
      name: user.name || '',
      lat: user.location?.lat !== undefined ? String(user.location.lat) : '',
      lng: user.location?.lng !== undefined ? String(user.location.lng) : ''
    });
    if (user.role === UserRole.PHARMACIST && user.pharmacyId && token) {
      fetch(`${API_BASE}/pharmacies`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          const p = (Array.isArray(data) ? data : []).find((ph: any) => ph.id === user.pharmacyId || ph._id === user.pharmacyId);
          if (p) setPharmacy(p);
        })
        .catch(() => {});
    }
  }, [user, token]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  const handleProfileSave = async () => {
    if (!token) return;
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const payload: any = { name: profileForm.name };
      if (profileForm.lat && profileForm.lng) {
        payload.location = { lat: Number(profileForm.lat), lng: Number(profileForm.lng) };
      }
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de mise à jour');
      onUserUpdate(data);
      localStorage.setItem('user', JSON.stringify(data));
      setProfileMessage({ type: 'success', msg: 'Profil mis à jour avec succès.' });
    } catch (err: any) {
      setProfileMessage({ type: 'error', msg: err.message || 'Impossible de mettre à jour le profil.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMessage(null);
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordMessage({ type: 'error', msg: 'Veuillez remplir tous les champs.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', msg: 'Les nouveaux mots de passe ne correspondent pas.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', msg: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec');
      setPasswordMessage({ type: 'success', msg: 'Mot de passe modifié avec succès !' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordMessage({ type: 'error', msg: err.message || 'Erreur lors du changement de mot de passe.' });
    }
  };

  const requestNotifPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        setNotifPermission(perm);
      });
    }
  };

  const handleExportData = () => {
    const exportData = {
      user: { name: user.name, email: user.email, role: user.role },
      medications: medications.map(m => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        schedules: m.schedules,
        stockCount: m.stockCount,
        durationInDays: m.durationInDays,
        startDate: m.startDate,
        historyCount: m.history?.length || 0
      })),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medcare-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeMeds = medications.filter(m => {
    if (!m.startDate) return true;
    const end = new Date(new Date(m.startDate).getTime() + (m.durationInDays || 0) * 86400000);
    return new Date() <= end;
  });
  const totalDosesAllTime = medications.reduce((acc, m) => acc + (m.history?.length || 0), 0);
  const takenAllTime = medications.reduce((acc, m) => acc + (m.history || []).filter(h => h.status === 'taken').length, 0);
  const adherence = totalDosesAllTime > 0 ? Math.round((takenAllTime / totalDosesAllTime) * 100) : 0;
  const lowStockCount = activeMeds.filter(m => m.stockCount <= m.threshold).length;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500 pb-12">
      {/* Profile Header */}
      <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100 text-center">
        <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-5xl font-black shadow-2xl shadow-blue-200 mx-auto mb-6">
          {user.name[0]}
        </div>
        <h2 className="text-3xl font-black text-slate-900">{user.name}</h2>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm mt-1">{user.email}</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="px-4 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-100">
            {user.role}
          </span>
          {user.location && (
            <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-emerald-100">
              <i className="fas fa-location-dot mr-1"></i> Géolocalisé
            </span>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-2xl font-black text-slate-900">{activeMeds.length}</div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Traitements</p>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-2xl font-black text-emerald-600">{adherence}%</div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Adhérence</p>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-2xl font-black text-blue-600">{totalDosesAllTime}</div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Prises Totales</p>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className={`text-2xl font-black ${lowStockCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>{lowStockCount}</div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Stocks Bas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['info', 'security', 'notifications', 'data'] as const).map(tab => {
          const icons = { info: 'fa-user', security: 'fa-lock', notifications: 'fa-bell', data: 'fa-database' };
          const labels = { info: 'Profil', security: 'Sécurité', notifications: 'Alertes', data: 'Données' };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'
              }`}
            >
              <i className={`fas ${icons[tab]} mr-2`}></i>{labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Profile Info Tab */}
      {activeTab === 'info' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Informations Personnelles</h3>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nom Complet</label>
            <input
              value={profileForm.name}
              onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nom complet"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Adresse E-mail</label>
            <input
              value={user.email}
              disabled
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-100 font-bold outline-none text-slate-400 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Position Géographique</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={profileForm.lat}
                onChange={(e) => setProfileForm(prev => ({ ...prev, lat: e.target.value }))}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Latitude"
                type="number"
                step="0.0001"
              />
              <input
                value={profileForm.lng}
                onChange={(e) => setProfileForm(prev => ({ ...prev, lng: e.target.value }))}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Longitude"
                type="number"
                step="0.0001"
              />
            </div>
            <button
              onClick={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setProfileForm(prev => ({
                      ...prev,
                      lat: String(pos.coords.latitude),
                      lng: String(pos.coords.longitude)
                    }));
                  },
                  () => {}
                );
              }}
              className="mt-2 text-xs font-black text-blue-600 hover:text-blue-700 transition flex items-center gap-2"
            >
              <i className="fas fa-crosshairs"></i> Utiliser ma position actuelle
            </button>
          </div>
          {profileMessage && (
            <p className={`text-sm font-semibold ${profileMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {profileMessage.msg}
            </p>
          )}
          <button
            onClick={handleProfileSave}
            disabled={isSavingProfile}
            className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition disabled:opacity-60 shadow-lg shadow-blue-100 active:scale-95"
          >
            {isSavingProfile ? <i className="fas fa-circle-notch animate-spin"></i> : 'ENREGISTRER LE PROFIL'}
          </button>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-5">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Changer le Mot de Passe</h3>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mot de passe actuel</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nouveau mot de passe</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Min. 6 caractères"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          {passwordMessage && (
            <p className={`text-sm font-semibold ${passwordMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {passwordMessage.msg}
            </p>
          )}
          <button
            onClick={handlePasswordChange}
            className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition shadow-lg active:scale-95"
          >
            CHANGER LE MOT DE PASSE
          </button>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Paramètres de Notification</h3>

          {/* Browser Notification Status */}
          <div className={`p-6 rounded-2xl border-2 flex items-center gap-5 ${
            notifPermission === 'granted' ? 'bg-emerald-50 border-emerald-200' :
            notifPermission === 'denied' ? 'bg-red-50 border-red-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
              notifPermission === 'granted' ? 'bg-emerald-100 text-emerald-600' :
              notifPermission === 'denied' ? 'bg-red-100 text-red-600' :
              'bg-amber-100 text-amber-600'
            }`}>
              <i className={`fas ${notifPermission === 'granted' ? 'fa-bell' : notifPermission === 'denied' ? 'fa-bell-slash' : 'fa-bell'} text-2xl`}></i>
            </div>
            <div className="flex-1">
              <h4 className="font-black text-slate-900 text-sm">
                {notifPermission === 'granted' ? 'Notifications Activées' :
                 notifPermission === 'denied' ? 'Notifications Bloquées' :
                 'Notifications Désactivées'}
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {notifPermission === 'granted'
                  ? 'Vous recevrez des alertes pour vos rappels de médicaments et alertes de stock.'
                  : notifPermission === 'denied'
                    ? 'Les notifications sont bloquées dans votre navigateur. Modifiez les paramètres du site.'
                    : 'Activez les notifications pour recevoir des rappels de prise et alertes de stock.'}
              </p>
            </div>
            {notifPermission === 'default' && (
              <button
                onClick={requestNotifPermission}
                className="px-5 py-3 bg-blue-600 text-white font-black text-xs rounded-xl hover:bg-blue-700 transition shadow-md active:scale-95 shrink-0"
              >
                ACTIVER
              </button>
            )}
          </div>

          {/* Notification Types Info */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Types d'Alertes</h4>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <i className="fas fa-clock"></i>
              </div>
              <div className="flex-1">
                <h5 className="font-black text-slate-900 text-sm">Rappels de Prise</h5>
                <p className="text-[11px] text-slate-400 font-medium">Notification à chaque heure de prise programmée</p>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full">ACTIF</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                <i className="fas fa-triangle-exclamation"></i>
              </div>
              <div className="flex-1">
                <h5 className="font-black text-slate-900 text-sm">Alertes de Stock</h5>
                <p className="text-[11px] text-slate-400 font-medium">Alerte quand le stock atteint le seuil défini</p>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full">ACTIF</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <i className="fas fa-envelope"></i>
              </div>
              <div className="flex-1">
                <h5 className="font-black text-slate-900 text-sm">Rappels par E-mail</h5>
                <p className="text-[11px] text-slate-400 font-medium">Rappels envoyés par e-mail via le serveur backend</p>
              </div>
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full">SERVEUR</span>
            </div>
          </div>
        </div>
      )}

      {/* Data Tab */}
      {activeTab === 'data' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Gestion des Données</h3>

          <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                <i className="fas fa-file-export text-xl"></i>
              </div>
              <div>
                <h4 className="font-black text-slate-900">Exporter mes Données</h4>
                <p className="text-xs text-slate-500 font-medium">Téléchargez vos traitements et historique en JSON</p>
              </div>
            </div>
            <button
              onClick={handleExportData}
              className="w-full py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-download"></i> EXPORTER (JSON)
            </button>
          </div>

          {/* Data Summary */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Résumé</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <div className="text-lg font-black text-slate-900">{medications.length}</div>
                <p className="text-[9px] font-black text-slate-400 uppercase">Médicaments</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <div className="text-lg font-black text-slate-900">{totalDosesAllTime}</div>
                <p className="text-[9px] font-black text-slate-400 uppercase">Prises Enregistrées</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <div className="text-lg font-black text-emerald-600">{takenAllTime}</div>
                <p className="text-[9px] font-black text-slate-400 uppercase">Doses Prises</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <div className="text-lg font-black text-red-600">{totalDosesAllTime - takenAllTime}</div>
                <p className="text-[9px] font-black text-slate-400 uppercase">Doses Manquées</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pharmacist: My Pharmacy section */}
      {user.role === UserRole.PHARMACIST && (
        <div className="bg-emerald-50/50 border border-emerald-100 p-8 rounded-[2.5rem]">
          <h3 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <i className="fas fa-store-alt"></i> Ma Pharmacie
          </h3>
          {pharmacy ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nom</span>
                  <span className="font-black text-slate-900">{pharmacy.name}</span>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Téléphone</span>
                  <span className="font-black text-slate-900">{pharmacy.phone || '—'}</span>
                </div>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-emerald-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Adresse</span>
                <span className="font-bold text-slate-700">{pharmacy.address}</span>
              </div>
              {pharmacy.services?.length > 0 && (
                <div className="p-4 bg-white rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Services</span>
                  <div className="flex flex-wrap gap-2">
                    {pharmacy.services.map((s: string) => (
                      <span key={s} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : user.pharmacyId ? (
            <p className="text-sm text-slate-500 font-medium">Chargement des données de la pharmacie...</p>
          ) : (
            <p className="text-sm text-slate-500 font-medium">Aucune pharmacie associée à votre compte. Contactez un administrateur.</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => onViewChange('dashboard')}
          className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition shadow-lg active:scale-95"
        >
          RETOUR AU TABLEAU DE BORD
        </button>
        <button
          onClick={onLogout}
          className="w-full py-4 bg-red-50 text-red-600 font-black rounded-2xl hover:bg-red-100 transition flex items-center justify-center gap-3 active:scale-95"
        >
          <i className="fas fa-sign-out-alt"></i> SE DÉCONNECTER
        </button>
      </div>
    </div>
  );
};

export default ProfileManager;
