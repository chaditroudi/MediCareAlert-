
import React, { useState, useEffect, useCallback } from 'react';
import { User, Medication, UserRole } from './types';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import PharmacyMap from './components/PharmacyMap';
import HistoryView from './components/HistoryView';
import Auth from './components/Auth';
import NotificationProvider from './components/NotificationProvider';
import InventoryManager from './components/InventoryManager';
import AdminPanel from './components/AdminPanel';
import RequestsManager from './components/RequestsManager';
import ScheduleView from './components/ScheduleView';
import ProfileManager from './components/ProfileManager';

const API_BASE = 'http://localhost:5000/api';

type ViewType = 'dashboard' | 'map' | 'profile' | 'history' | 'inventory' | 'admin' | 'requests' | 'schedule' |'dashboard';

/** Role-based access map: which views each role can access */
const VIEW_PERMISSIONS: Record<ViewType, UserRole[]> = {
  dashboard: [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN],
  schedule:  [UserRole.PATIENT],
  history:   [UserRole.PATIENT],
  map:       [UserRole.PATIENT, UserRole.PHARMACIST],
  inventory: [UserRole.PHARMACIST, UserRole.ADMIN],
  requests:  [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN],
  admin:     [UserRole.ADMIN],
  profile:   [UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN],
};


const canAccess = (view: ViewType, role: UserRole): boolean =>
  VIEW_PERMISSIONS[view]?.includes(role) ?? false;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [view, setViewRaw] = useState<ViewType>('dashboard');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isVerifying, setIsVerifying] = useState(!!localStorage.getItem('token'));

  // Role-guarded view setter — prevents navigating to unauthorized views
  const setView = useCallback((v: ViewType) => {
    if (!user || canAccess(v, user.role)) {
      setViewRaw(v);
    } else {
      console.warn(`Access denied: ${user.role} cannot access '${v}'`);
      setViewRaw('dashboard');
    }
  }, [user]);


  const fetchMedications = useCallback(async (userToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/medications`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      
      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }
      
      const data = await res.json();
      const today = new Date().toISOString().split('T')[0];
      const withTakenCount = data.map((m: any) => ({
        ...m,
        takenTodayCount: (m.history || []).filter((h: any) => h.date === today && h.status === 'taken').length
      }));
      setMedications(withTakenCount);
      localStorage.setItem('medcare_meds', JSON.stringify(withTakenCount));
    } catch (err) {
      console.warn("Network error or backend unreachable. Falling back to local storage.", err);
      const localMeds = localStorage.getItem('medcare_meds');
      if (localMeds) {
        try {
          setMedications(JSON.parse(localMeds));
        } catch (parseErr) {
          console.error("Local storage data is corrupted:", parseErr);
          setMedications([]);
        }
      } else {
        setMedications([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    
    if (savedToken) {
      const verifyToken = async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          });
          
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            setToken(savedToken);
            fetchMedications(savedToken);
          } else {
            throw new Error("Token invalid");
          }
        } catch (e) {
          console.error("Auth verification failed, resetting...");
          localStorage.clear();
          setUser(null);
          setToken(null);
        } finally {
          setIsVerifying(false);
        }
      };
      verifyToken();
    } else {
      setIsVerifying(false);
    }
  }, [fetchMedications]);

  const handleLogin = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('token', t);
    fetchMedications(t);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.clear();
    setView('dashboard');
  };

  const handleMedicationChange = (update: Medication[] | ((prev: Medication[]) => Medication[])) => {
    setMedications(prev => {
      const updated = typeof update === 'function' ? update(prev) : update;
      localStorage.setItem('medcare_meds', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDownloadLogo = () => {
    // Create high-res canvas (1024x1024)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
    gradient.addColorStop(0, '#2563eb'); // blue-600
    gradient.addColorStop(1, '#4338ca'); // indigo-700
    
    // 2. Draw Rounded Square Container
    const padding = 100;
    const size = 1024 - (padding * 2);
    const radius = 220;
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Path for rounded rectangle
    ctx.moveTo(padding + radius, padding);
    ctx.lineTo(padding + size - radius, padding);
    ctx.quadraticCurveTo(padding + size, padding, padding + size, padding + radius);
    ctx.lineTo(padding + size, padding + size - radius);
    ctx.quadraticCurveTo(padding + size, padding + size, padding + size - radius, padding + size);
    ctx.lineTo(padding + radius, padding + size);
    ctx.quadraticCurveTo(padding, padding + size, padding, padding + size - radius);
    ctx.lineTo(padding, padding + radius);
    ctx.quadraticCurveTo(padding, padding, padding + radius, padding);
    ctx.closePath();
    ctx.fill();

    // 3. Draw Medical Plus Sign (Simplified version of fa-plus-medical)
    ctx.fillStyle = 'white';
    const centerX = 512;
    const centerY = 512;
    const thickness = 140;
    const length = 460;

    // Vertical bar
    ctx.fillRect(centerX - (thickness / 2), centerY - (length / 2), thickness, length);
    // Horizontal bar
    ctx.fillRect(centerX - (length / 2), centerY - (thickness / 2), length, thickness);

    // 4. Export as PNG
    const link = document.createElement('a');
    link.download = 'medcare-alert-logo.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Verifying Session...</p>
        </div>
      </div>
    );
  }

  if (!user || !token) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <NotificationProvider medications={medications} onViewChange={setView}>
      <Layout 
        user={user} 
        currentView={view} 
        onViewChange={setView} 
        onLogout={handleLogout}
      >
        {view === 'dashboard' && (
          <Dashboard 
            user={user} 
            token={token}
            medications={medications} 
            setMedications={handleMedicationChange} 
            onViewChange={setView}
          />
        )}
        {view === 'map' && canAccess('map', user.role) && <PharmacyMap pharmacies={[]} />}
        {view === 'history' && canAccess('history', user.role) && <HistoryView medications={medications} token={token} />}
        {view === 'inventory' && canAccess('inventory', user.role) && <InventoryManager user={user} token={token} />}
        {view === 'requests' && canAccess('requests', user.role) && <RequestsManager user={user} token={token} />}
        {view === 'admin' && canAccess('admin', user.role) && <AdminPanel token={token} />}
        {view === 'schedule' && canAccess('schedule', user.role) && (
          <ScheduleView
            medications={medications}
            onTakeMedication={async (id: string) => {
              try {
                const response = await fetch(`${API_BASE}/medications/${id}/take`, {
                  method: 'PATCH',
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Erreur');
                const updatedMed = await response.json();
                const today = new Date().toISOString().split('T')[0];
                const takenTodayCount = (updatedMed.history || []).filter((h: any) => h.date === today && h.status === 'taken').length;
                handleMedicationChange(prev => prev.map(m => (m.id === id || (m as any)._id === id) ? { ...updatedMed, takenTodayCount } : m));
              } catch {
                handleMedicationChange(prev => prev.map(m => {
                  if (m.id === id || (m as any)._id === id) {
                    const now = new Date();
                    return {
                      ...m,
                      takenTodayCount: (m.takenTodayCount || 0) + 1,
                      stockCount: Math.max(0, (m.stockCount || 0) - 1),
                      history: [...(m.history || []), { date: now.toISOString().split('T')[0], time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'taken' as const }]
                    };
                  }
                  return m;
                }));
              }
            }}
            onViewChange={setView}
          />
        )}
        {view === 'profile' && (
          <ProfileManager
            user={user}
            token={token}
            medications={medications}
            onUserUpdate={(updatedUser) => {
              setUser(updatedUser);
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }}
            onLogout={handleLogout}
            onViewChange={setView}
          />
        )}
      </Layout>
    </NotificationProvider>
  );
};

export default App;
