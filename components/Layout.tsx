
import React, { useEffect, useState, useMemo } from 'react';
import { User, UserRole } from '../types';
import appLogo from '../assets/medalert-logo.jpeg';
import { API_ORIGIN } from '../lib/appConfig';

interface NavItemDef {
  icon: string;
  label: string;
  view: string;
  roles: UserRole[]; // which roles see this item
  shortLabel?: string;
}

const ALL_ROLES = [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN];

const NAV_ITEMS: NavItemDef[] = [
  { icon: 'fa-house', label: 'Accueil', shortLabel: 'Accueil', view: 'dashboard', roles: ALL_ROLES },
  { icon: 'fa-calendar-check', label: 'Planning', shortLabel: 'Planning', view: 'schedule', roles: [UserRole.PATIENT] },
  { icon: 'fa-clock-rotate-left', label: 'Historique', shortLabel: 'Historique', view: 'history', roles: [UserRole.PATIENT] },
  { icon: 'fa-map-location-dot', label: 'Pharmacies', shortLabel: 'Carte', view: 'map', roles: [UserRole.PATIENT, UserRole.PHARMACIST] },
  { icon: 'fa-table-list', label: 'Stocks Pharmacies', shortLabel: 'Stocks', view: 'pharmacy-stock', roles: [UserRole.PATIENT] },
  { icon: 'fa-boxes-stacked', label: 'Inventaire', shortLabel: 'Stock', view: 'inventory', roles: [UserRole.PHARMACIST, UserRole.ADMIN] },
  { icon: 'fa-clipboard-list', label: 'Demandes', shortLabel: 'Demandes', view: 'requests', roles: [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN] },
  { icon: 'fa-shield-halved', label: 'Admin', shortLabel: 'Admin', view: 'admin', roles: [UserRole.ADMIN] },
  { icon: 'fa-user', label: 'Profil', shortLabel: 'Profil', view: 'profile', roles: ALL_ROLES },
];

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  currentView: string;
  onViewChange: (view: any) => void;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, currentView, onViewChange, onLogout }) => {
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const profileImageSrc = user.profileImageUrl ? `${API_ORIGIN}${user.profileImageUrl}` : null;

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
      const interval = setInterval(() => setNotifPermission(Notification.permission), 2000);
      return () => clearInterval(interval);
    }
  }, []);

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter(item => item.roles.includes(user.role)),
    [user.role]
  );
  const primaryNavItems = visibleNavItems.slice(0, 5);
  const secondaryNavItems = visibleNavItems.slice(5);

  const roleLabel = user.role === UserRole.ADMIN ? 'Administrateur' : user.role === UserRole.PHARMACIST ? 'Pharmacien' : 'Patient';
  const roleBadgeColor = user.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-700' : user.role === UserRole.PHARMACIST ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
  const currentViewMeta = NAV_ITEMS.find((item) => item.view === currentView);

  const renderNavItem = (item: NavItemDef, mobile = false) => {
    const isActive = currentView === item.view;
    return (
      <button
        key={item.view}
        onClick={() => onViewChange(item.view)}
        title={sidebarCollapsed && !mobile ? item.label : undefined}
        className={`group relative flex items-center transition-all duration-200 ${
          mobile
            ? `min-w-0 flex-1 flex-col gap-1.5 rounded-2xl px-2 py-2.5 ${
                isActive ? 'bg-[#0A74DA] text-white shadow-lg shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'
              }`
            : `w-full gap-3 rounded-2xl px-4 py-3.5 ${
                isActive
                  ? 'bg-gradient-to-r from-[#0A74DA] to-[#0b66be] text-white shadow-lg shadow-blue-200'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
        }`}
      >
        {!mobile && isActive && <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-white/70"></div>}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base ${
            mobile
              ? isActive
                ? 'bg-white/15 text-white'
                : 'bg-slate-100 text-slate-500 group-hover:bg-white'
              : isActive
                ? 'bg-white/15 text-white'
                : 'bg-slate-100 text-slate-500 group-hover:bg-white'
          }`}
        >
          <i className={`fas ${item.icon}`}></i>
        </div>
        {mobile ? (
          <span className="truncate text-[10px] font-black leading-tight">{item.shortLabel || item.label}</span>
        ) : !sidebarCollapsed ? (
          <div className="min-w-0 flex-1 text-left">
            <p className={`truncate text-sm font-black ${isActive ? 'text-white' : 'text-slate-900'}`}>{item.label}</p>
            <p className={`truncate text-[11px] font-medium ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
              {item.view === 'dashboard'
                ? 'Vue principale'
                : item.view === 'requests'
                  ? 'Suivi des échanges'
                  : item.view === 'inventory'
                      ? 'Gestion du stock'
                      : item.view === 'profile'
                        ? 'Paramètres du compte'
                        : 'Accès rapide'}
            </p>
          </div>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:block bg-[#f4f8fb]">
      {/* Sidebar */}
      <nav className={`w-full ${sidebarCollapsed ? 'md:w-24' : 'md:w-[320px]'} bg-white/95 border-r border-slate-200 flex flex-col fixed bottom-0 md:top-0 md:left-0 z-50 h-[88px] md:h-screen transition-all duration-300 backdrop-blur-xl shadow-[0_-12px_32px_rgba(15,23,42,0.08)] md:shadow-none`}>
        {/* Logo */}
        <div className="hidden md:flex items-center gap-3 p-6">
          <img
            src={appLogo}
            alt="MedAlert+"
            className="h-14 w-auto shrink-0 rounded-2xl border border-slate-200 bg-white object-contain shadow-sm"
          />
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-black text-slate-900 leading-none">MedAlert+</span>
              <span className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em]">Suivi Médicamenteux</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition hidden md:flex"
          >
            <i className={`fas ${sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'} text-xs`}></i>
          </button>
        </div>

        {/* Role badge (desktop) */}
        <div className={`hidden md:block px-4 ${sidebarCollapsed ? 'mb-3' : 'mb-4'}`}>
          <div className={`rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,_#f8fbff_0%,_#f3f7fb_100%)] ${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-4'}`}>
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                {profileImageSrc ? (
                  <img src={profileImageSrc} alt={user.name} className="h-11 w-11 rounded-2xl object-cover border border-slate-200" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-black text-white">
                    {user.name[0]}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {profileImageSrc ? (
                  <img src={profileImageSrc} alt={user.name} className="h-12 w-12 rounded-2xl object-cover border border-slate-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-black text-white">
                    {user.name[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{user.name}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${roleBadgeColor}`}>
                    {roleLabel}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nav items */}
        <div className="hidden md:flex flex-1 flex-col min-h-0 px-4 pb-4">
          {!sidebarCollapsed && (
            <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Navigation</p>
          )}
          <div className="space-y-1.5">
            {primaryNavItems.map((item) => renderNavItem(item))}
          </div>
          {secondaryNavItems.length > 0 && (
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              {!sidebarCollapsed && (
                <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Outils</p>
              )}
              <div className="space-y-1.5">
                {secondaryNavItems.map((item) => renderNavItem(item))}
              </div>
            </div>
          )}
        </div>

        <div className="md:hidden grid h-full grid-cols-5 gap-2 px-3 py-3">
          {primaryNavItems.map((item) => renderNavItem(item, true))}
        </div>

        {/* Bottom section (desktop) */}
        {!sidebarCollapsed && (
          <div className="hidden md:flex flex-col gap-3 p-4 mt-auto border-t border-slate-100 bg-white/80">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${
                  notifPermission === 'granted'
                    ? 'bg-emerald-500'
                    : notifPermission === 'denied'
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
                }`}></div>
                <p className="text-xs font-black text-slate-800">Notifications</p>
              </div>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {notifPermission === 'granted' ? 'Actives sur cet appareil' : notifPermission === 'denied' ? 'Bloquées par le navigateur' : 'En attente d’autorisation'}
              </p>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl text-rose-600 hover:bg-rose-50 transition font-bold text-sm"
            >
              <i className="fas fa-right-from-bracket w-6 text-center"></i>
              Déconnexion
            </button>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className={`p-4 md:p-8 mb-[96px] md:mb-0 md:ml-24 ${sidebarCollapsed ? 'md:ml-24' : 'md:ml-[320px]'} min-h-screen bg-[radial-gradient(circle_at_top,_rgba(10,116,218,0.10),_transparent_38%),linear-gradient(180deg,_#f8fbfd_0%,_#eef5f9_100%)]`}>
        <header className="mb-8 rounded-[2rem] border border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">
              {currentView === 'dashboard' ? 'Tableau de Bord' :
               currentView === 'schedule' ? 'Planning' :
               currentView === 'history' ? 'Historique' :
               currentView === 'map' ? 'Pharmacies' :
               currentView === 'pharmacy-stock' ? 'Stocks Pharmacies' :
               currentView === 'inventory' ? 'Inventaire' :
               currentView === 'requests' ? 'Demandes' :
               currentView === 'admin' ? 'Administration' :
               currentView === 'profile' ? 'Mon Profil' : 'MedCare Alert+'}
            </h1>
            <p className="text-slate-400 font-medium text-sm">
              {currentView === 'dashboard' ? 'Vue d\'ensemble de votre santé' :
               currentView === 'admin' ? 'Gestion et supervision du système' :
               'Suivi de votre parcours de santé'}
            </p>
            {currentViewMeta && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600">
                <i className={`fas ${currentViewMeta.icon} text-[10px]`}></i>
                {currentViewMeta.label}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Notification Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className={`w-2 h-2 rounded-full ${
                notifPermission === 'granted' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' :
                notifPermission === 'denied' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
              }`}></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {notifPermission === 'granted' ? 'Actif' : notifPermission === 'denied' ? 'Bloqué' : 'Inactif'}
              </span>
            </div>

            {/* User avatar */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
              {profileImageSrc ? (
                <img
                  src={profileImageSrc}
                  alt={user.name}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                  {user.name[0]}
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-xs font-bold text-slate-700 leading-none">{user.name}</p>
                <p className={`text-[10px] font-semibold ${user.role === UserRole.ADMIN ? 'text-rose-500' : user.role === UserRole.PHARMACIST ? 'text-emerald-500' : 'text-blue-500'}`}>{roleLabel}</p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="md:hidden p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
              title="Déconnexion"
            >
              <i className="fas fa-right-from-bracket"></i>
            </button>
          </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
