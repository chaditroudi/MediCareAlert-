import React, { useEffect, useRef, useState } from 'react';
import { Medication, User, UserRole } from '../types';
import { API_BASE, API_ORIGIN } from '../lib/appConfig';
import { readApiResponse } from '../lib/api';

interface ProfileManagerProps {
  user: User;
  token: string;
  medications: Medication[];
  onUserUpdate: (user: User) => void;
  onLogout: () => void;
  onViewChange: (view: any) => void;
}

type FlashMessage = { type: 'success' | 'error'; msg: string } | null;
type ProfileTab = 'info' | 'security' | 'notifications' | 'data' | 'pharmacy';

const tabsForRole = (role: UserRole): ProfileTab[] => [
  'info',
  'security',
  'notifications',
  'data',
  ...(role === UserRole.PHARMACIST ? ['pharmacy' as const] : []),
];

const tabLabels: Record<ProfileTab, string> = {
  info: 'Profil',
  security: 'Sécurité',
  notifications: 'Alertes',
  data: 'Données',
  pharmacy: 'Pharmacie',
};

const tabIcons: Record<ProfileTab, string> = {
  info: 'fa-user',
  security: 'fa-lock',
  notifications: 'fa-bell',
  data: 'fa-database',
  pharmacy: 'fa-store',
};

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const disabledInputClass =
  'w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-400 outline-none';
const sectionClass = 'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm';

const ProfileManager: React.FC<ProfileManagerProps> = ({ user, token, medications, onUserUpdate, onLogout, onViewChange }) => {
  const [profileForm, setProfileForm] = useState({ name: user.name || '', lat: '', lng: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [profileMessage, setProfileMessage] = useState<FlashMessage>(null);
  const [passwordMessage, setPasswordMessage] = useState<FlashMessage>(null);
  const [pharmacyForm, setPharmacyForm] = useState({ name: '', address: '', phone: '', services: '' });
  const [isSavingPharmacy, setIsSavingPharmacy] = useState(false);
  const [pharmacyMessage, setPharmacyMessage] = useState<FlashMessage>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [activeTab, setActiveTab] = useState<ProfileTab>('info');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProfileForm({
      name: user.name || '',
      lat: user.location?.lat !== undefined ? String(user.location.lat) : '',
      lng: user.location?.lng !== undefined ? String(user.location.lng) : '',
    });
    setPhotoPreview(null);

    if (user.role === UserRole.PHARMACIST && token) {
      fetch(`${API_BASE}/pharmacies/mine`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => {
          if (!response.ok) return null;
          return readApiResponse<any>(response);
        })
        .then((data) => {
          if (!data) return;
          setPharmacyForm({
            name: data.name || '',
            address: data.address || '',
            phone: data.phone || '',
            services: Array.isArray(data.services) ? data.services.join(', ') : (data.services || ''),
          });
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
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse<User & { error?: string }>(res);
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

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileMessage({ type: 'error', msg: 'Choisissez une image JPEG, PNG ou WebP.' });
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPhotoPreview(localPreview);
    setProfileMessage(null);
    setIsUploadingPhoto(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_BASE}/auth/me/profile-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await readApiResponse<User & { error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'Échec de téléversement');

      onUserUpdate(data);
      localStorage.setItem('user', JSON.stringify(data));
      setProfileMessage({ type: 'success', msg: 'Photo de profil mise à jour avec succès.' });
    } catch (err: any) {
      setProfileMessage({ type: 'error', msg: err.message || 'Impossible de mettre à jour la photo.' });
      setPhotoPreview(null);
    } finally {
      URL.revokeObjectURL(localPreview);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsUploadingPhoto(false);
    }
  };

  const handleProfileImageRemove = async () => {
    if (!token) return;
    setProfileMessage(null);
    setIsUploadingPhoto(true);

    try {
      const res = await fetch(`${API_BASE}/auth/me/profile-image`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiResponse<User & { error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'Échec de suppression');

      onUserUpdate(data);
      localStorage.setItem('user', JSON.stringify(data));
      setPhotoPreview(null);
      setProfileMessage({ type: 'success', msg: 'Photo de profil supprimée.' });
    } catch (err: any) {
      setProfileMessage({ type: 'error', msg: err.message || 'Impossible de supprimer la photo.' });
    } finally {
      setIsUploadingPhoto(false);
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
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }),
      });
      const data = await readApiResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'Échec');
      setPasswordMessage({ type: 'success', msg: 'Mot de passe modifié avec succès !' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      setPasswordMessage({ type: 'error', msg: err.message || 'Erreur lors du changement de mot de passe.' });
    }
  };

  const requestNotifPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => setNotifPermission(perm));
    }
  };

  const handlePharmacySave = async () => {
    if (!token) return;
    setIsSavingPharmacy(true);
    setPharmacyMessage(null);

    try {
      const payload = {
        name: pharmacyForm.name,
        address: pharmacyForm.address,
        phone: pharmacyForm.phone,
        services: pharmacyForm.services.split(',').map((s) => s.trim()).filter(Boolean),
      };

      const res = await fetch(`${API_BASE}/pharmacies/mine`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || 'Échec de mise à jour');
      setPharmacyMessage({ type: 'success', msg: 'Pharmacie mise à jour avec succès.' });
    } catch (err: any) {
      setPharmacyMessage({ type: 'error', msg: err.message || 'Impossible de mettre à jour la pharmacie.' });
    } finally {
      setIsSavingPharmacy(false);
    }
  };

  const handleExportData = () => {
    const exportData = {
      user: { name: user.name, email: user.email, role: user.role },
      medications: medications.map((m) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        schedules: m.schedules,
        stockCount: m.stockCount,
        durationInDays: m.durationInDays,
        startDate: m.startDate,
        historyCount: m.history?.length || 0,
      })),
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medcare-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeMeds = medications.filter((m) => {
    if (!m.startDate) return true;
    const end = new Date(new Date(m.startDate).getTime() + (m.durationInDays || 0) * 86400000);
    return new Date() <= end;
  });
  const totalDosesAllTime = medications.reduce((acc, m) => acc + (m.history?.length || 0), 0);
  const takenAllTime = medications.reduce((acc, m) => acc + (m.history || []).filter((h) => h.status === 'taken').length, 0);
  const lowStockCount = activeMeds.filter((m) => m.stockCount <= m.threshold).length;
  const profileImageSrc = photoPreview || (user.profileImageUrl ? `${API_ORIGIN}${user.profileImageUrl}` : null);
  const profileCompletion = Math.round(
    ([Boolean(user.name?.trim()), Boolean(user.email?.trim()), Boolean(user.location), Boolean(user.profileImageUrl || photoPreview)].filter(Boolean).length / 4) * 100,
  );
  const adherenceRate = totalDosesAllTime > 0 ? Math.round((takenAllTime / totalDosesAllTime) * 100) : 0;
  const roleLabel = {
    [UserRole.PATIENT]: 'Patient',
    [UserRole.PHARMACIST]: 'Pharmacien',
    [UserRole.ADMIN]: 'Administrateur',
  }[user.role];

  const quickStats = [
    { label: 'Traitements actifs', value: activeMeds.length, color: 'text-slate-900' },
    { label: 'Observance', value: `${adherenceRate}%`, color: 'text-emerald-600' },
    { label: 'Stocks bas', value: lowStockCount, color: lowStockCount > 0 ? 'text-rose-600' : 'text-slate-900' },
    { label: 'Profil complété', value: `${profileCompletion}%`, color: 'text-blue-600' },
  ];

  const renderMessage = (message: FlashMessage) => {
    if (!message) return null;
    return (
      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}
      >
        {message.msg}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <div className="rounded-[2.5rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {profileImageSrc ? (
              <img src={profileImageSrc} alt={user.name} className="h-20 w-20 rounded-[1.5rem] border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-black text-white">
                {user.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Mon Profil</p>
              <h2 className="mt-1 text-2xl font-black text-slate-900">{user.name}</h2>
              <p className="mt-1 break-all text-sm font-medium text-slate-500">{user.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">{roleLabel}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                  {notifPermission === 'granted' ? 'Notifications actives' : 'Notifications inactives'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
            {quickStats.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-sm">
        {tabsForRole(user.role).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <i className={`fas ${tabIcons[tab]} mr-2`}></i>
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className={sectionClass}>
            <h3 className="text-lg font-black text-slate-900">Photo et compte</h3>
            <p className="mt-1 text-sm text-slate-500">Une vue simple de votre profil.</p>
            <div className="mt-5 space-y-4">
              <div className="flex flex-col items-start gap-4">
                {profileImageSrc ? (
                  <img src={profileImageSrc} alt={user.name} className="h-24 w-24 rounded-[1.5rem] border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 text-3xl font-black text-white">
                    {user.name[0]}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleProfileImageChange}
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    <i className={`fas ${isUploadingPhoto ? 'fa-circle-notch animate-spin' : 'fa-camera'} mr-2`}></i>
                    {profileImageSrc ? 'Changer la photo' : 'Ajouter une photo'}
                  </button>
                  {profileImageSrc && (
                    <button
                      onClick={handleProfileImageRemove}
                      disabled={isUploadingPhoto}
                      className="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Compte</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{roleLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Localisation</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{user.location ? 'Renseignée' : 'Non renseignée'}</p>
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h3 className="text-lg font-black text-slate-900">Informations personnelles</h3>
            <p className="mt-1 text-sm text-slate-500">Modifiez seulement l’essentiel.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Nom complet</label>
                <input
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Nom complet"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Adresse e-mail</label>
                <input value={user.email} disabled className={disabledInputClass} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Latitude</label>
                  <input
                    value={profileForm.lat}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, lat: e.target.value }))}
                    className={inputClass}
                    placeholder="36.8065"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Longitude</label>
                  <input
                    value={profileForm.lng}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, lng: e.target.value }))}
                    className={inputClass}
                    placeholder="10.1815"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Position actuelle</p>
                    <p className="text-xs text-slate-500">Récupérez votre position automatiquement.</p>
                  </div>
                  <button
                    onClick={() => {
                      if (!navigator.geolocation) return;
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setProfileForm((prev) => ({
                            ...prev,
                            lat: String(pos.coords.latitude),
                            lng: String(pos.coords.longitude),
                          }));
                        },
                        () => {},
                      );
                    }}
                    className="text-sm font-bold text-blue-600 transition hover:text-blue-700"
                  >
                    <i className="fas fa-crosshairs mr-2"></i>
                    Utiliser ma position
                  </button>
                </div>
              </div>
              {renderMessage(profileMessage)}
              <button
                onClick={handleProfileSave}
                disabled={isSavingProfile}
                className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingProfile ? <i className="fas fa-circle-notch animate-spin"></i> : 'Enregistrer le profil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className={sectionClass}>
          <h3 className="text-lg font-black text-slate-900">Sécurité</h3>
          <p className="mt-1 text-sm text-slate-500">Changez votre mot de passe rapidement.</p>
          <div className="mt-5 space-y-4">
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              className={inputClass}
              placeholder="Mot de passe actuel"
            />
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className={inputClass}
              placeholder="Nouveau mot de passe"
            />
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className={inputClass}
              placeholder="Confirmer le nouveau mot de passe"
            />
            {renderMessage(passwordMessage)}
            <button
              onClick={handlePasswordChange}
              className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Changer le mot de passe
            </button>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className={sectionClass}>
          <h3 className="text-lg font-black text-slate-900">Alertes</h3>
          <p className="mt-1 text-sm text-slate-500">Gérez vos rappels sans surcharge visuelle.</p>
          <div
            className={`mt-5 rounded-2xl border p-4 ${
              notifPermission === 'granted'
                ? 'border-emerald-200 bg-emerald-50'
                : notifPermission === 'denied'
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">
                  {notifPermission === 'granted'
                    ? 'Notifications activées'
                    : notifPermission === 'denied'
                      ? 'Notifications bloquées'
                      : 'Notifications désactivées'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {notifPermission === 'granted'
                    ? 'Les alertes de prise et de stock peuvent apparaître sur cet appareil.'
                    : notifPermission === 'denied'
                      ? 'Le navigateur bloque actuellement les notifications.'
                      : 'Activez-les pour recevoir vos rappels.'}
                </p>
              </div>
              {notifPermission === 'default' && (
                <button
                  onClick={requestNotifPermission}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  Activer
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {[
              ['Rappels de prise', 'Selon les horaires de vos traitements.'],
              ['Alertes de stock', 'Quand un médicament passe sous le seuil.'],
              ['Rappels par e-mail', 'Si le backend e-mail est configuré.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-xs text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'data' && (
        <div className={sectionClass}>
          <h3 className="text-lg font-black text-slate-900">Données</h3>
          <p className="mt-1 text-sm text-slate-500">Exportez vos données et gardez un résumé compact.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-sm font-black text-slate-900">Exporter mes données</p>
              <p className="mt-1 text-xs text-slate-500">Téléchargez vos traitements et votre historique au format JSON.</p>
              <button
                onClick={handleExportData}
                className="mt-4 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700"
              >
                <i className="fas fa-download mr-2"></i>
                Exporter
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xl font-black text-slate-900">{medications.length}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Médicaments</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xl font-black text-slate-900">{totalDosesAllTime}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Prises</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xl font-black text-emerald-600">{takenAllTime}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Prises ok</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xl font-black text-rose-600">{totalDosesAllTime - takenAllTime}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Manquées</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pharmacy' && user.role === UserRole.PHARMACIST && (
        <div className={sectionClass}>
          <h3 className="text-lg font-black text-slate-900">Ma pharmacie</h3>
          <p className="mt-1 text-sm text-slate-500">Mettez à jour les informations essentielles.</p>
          {!user.pharmacyId ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-800">
              Aucune pharmacie n’est associée à ce compte. Contactez un administrateur.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <input
                value={pharmacyForm.name}
                onChange={(e) => setPharmacyForm((prev) => ({ ...prev, name: e.target.value }))}
                className={inputClass}
                placeholder="Nom de la pharmacie"
              />
              <input
                value={pharmacyForm.address}
                onChange={(e) => setPharmacyForm((prev) => ({ ...prev, address: e.target.value }))}
                className={inputClass}
                placeholder="Adresse"
              />
              <input
                value={pharmacyForm.phone}
                onChange={(e) => setPharmacyForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={inputClass}
                placeholder="Téléphone"
              />
              <input
                value={pharmacyForm.services}
                onChange={(e) => setPharmacyForm((prev) => ({ ...prev, services: e.target.value }))}
                className={inputClass}
                placeholder="Services séparés par des virgules"
              />
              {renderMessage(pharmacyMessage)}
              <button
                onClick={handlePharmacySave}
                disabled={isSavingPharmacy || !pharmacyForm.name}
                className="w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSavingPharmacy ? <i className="fas fa-circle-notch animate-spin"></i> : 'Enregistrer la pharmacie'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => onViewChange('dashboard')}
          className="flex-1 rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white transition hover:bg-slate-800"
        >
          Retour au tableau de bord
        </button>
        <button
          onClick={onLogout}
          className="flex-1 rounded-2xl bg-rose-50 py-3.5 text-sm font-black text-rose-600 transition hover:bg-rose-100"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
};

export default ProfileManager;
