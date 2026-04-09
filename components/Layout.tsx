
import React, { useEffect, useState, useMemo } from 'react';
import { User, UserRole } from '../types';

interface NavItemDef {
  icon: string;
  label: string;
  view: string;
  roles: UserRole[]; // which roles see this item
}

const ALL_ROLES = [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN];

const NAV_ITEMS: NavItemDef[] = [
  { icon: 'fa-house', label: 'Accueil', view: 'dashboard', roles: ALL_ROLES },
  { icon: 'fa-calendar-check', label: 'Planning', view: 'schedule', roles: [UserRole.PATIENT] },
  { icon: 'fa-clock-rotate-left', label: 'Historique', view: 'history', roles: [UserRole.PATIENT] },
  { icon: 'fa-map-location-dot', label: 'Pharmacies', view: 'map', roles: [UserRole.PATIENT, UserRole.PHARMACIST] },
  { icon: 'fa-boxes-stacked', label: 'Inventaire', view: 'inventory', roles: [UserRole.PHARMACIST, UserRole.ADMIN] },
  { icon: 'fa-clipboard-list', label: 'Demandes', view: 'requests', roles: [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN] },
  { icon: 'fa-shield-halved', label: 'Admin', view: 'admin', roles: [UserRole.ADMIN] },
  { icon: 'fa-user', label: 'Profil', view: 'profile', roles: ALL_ROLES },
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

  const roleLabel = user.role === UserRole.ADMIN ? 'Administrateur' : user.role === UserRole.PHARMACIST ? 'Pharmacien' : 'Patient';
  const roleBadgeColor = user.role === UserRole.ADMIN ? 'bg-rose-100 text-rose-700' : user.role === UserRole.PHARMACIST ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar */}
      <nav className={`w-full ${sidebarCollapsed ? 'md:w-20' : 'md:w-72'} bg-white border-r border-slate-200 flex flex-col fixed md:relative bottom-0 z-50 md:z-auto h-20 md:h-screen transition-all duration-300`}>
        {/* Logo */}
        <div className="hidden md:flex items-center gap-3 p-6 mb-2">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white text-xl shadow-lg shadow-blue-200 shrink-0">
            <i className="fas fa-plus-medical"></i>
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-black text-slate-900 leading-none">MedCare</span>
              <span className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em]">Alert+</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="ml-auto text-slate-300 hover:text-slate-500 transition hidden md:block"
          >
            <i className={`fas ${sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'} text-xs`}></i>
          </button>
        </div>

        {/* Role badge (desktop) */}
        {!sidebarCollapsed && (
          <div className="hidden md:flex mx-6 mb-4 px-3 py-2 rounded-xl bg-slate-50 items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${roleBadgeColor}`}>
              {roleLabel}
            </span>
            <span className="text-xs font-semibold text-slate-500 truncate">{user.name}</span>
          </div>
        )}

        {/* Nav items */}
        <div className="flex flex-row md:flex-col justify-around md:justify-start gap-1 h-full md:px-3 md:overflow-y-auto">
          {visibleNavItems.map(item => (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`flex flex-col md:flex-row items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                currentView === item.view
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-[1.01]'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <i className={`fas ${item.icon} text-lg ${sidebarCollapsed ? '' : 'w-6 text-center'}`}></i>
              {!sidebarCollapsed && <span className="text-[10px] md:text-sm font-bold">{item.label}</span>}
            </button>
          ))}
        </div>

        {/* Bottom section (desktop) */}
        {!sidebarCollapsed && (
          <div className="hidden md:flex flex-col gap-2 p-4 mt-auto border-t border-slate-100">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition font-bold text-sm"
            >
              <i className="fas fa-right-from-bracket w-6 text-center"></i>
              Déconnexion
            </button>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 mb-20 md:mb-0">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900">
              {currentView === 'dashboard' ? 'Tableau de Bord' :
               currentView === 'schedule' ? 'Planning' :
               currentView === 'history' ? 'Historique' :
               currentView === 'map' ? 'Pharmacies' :
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                {user.name[0]}
              </div>
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
        </header>

        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
