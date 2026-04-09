
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Medication } from '../types';

interface NotificationProviderProps {
  children: React.ReactNode;
  medications: Medication[];
  onViewChange?: (view: any) => void;
}

interface ActiveAlert {
  id: string;
  type: 'REMINDER' | 'STOCK';
  message: string;
  medName: string;
}

const NotificationProvider: React.FC<NotificationProviderProps> = ({ children, medications, onViewChange }) => {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const hasWelcomed = useRef(false);
  const remindedThisMinute = useRef<Set<string>>(new Set());
  const stockAlerted = useRef<Set<string>>(new Set());

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(setPermission);
      }
    }
  }, []);

  // Helper to trigger a real system notification
  const sendSystemNotification = useCallback((title: string, body: string, iconType: 'STOCK' | 'REMINDER' | 'SYSTEM') => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const icon = iconType === 'STOCK' 
        ? 'https://cdn-icons-png.flaticon.com/512/595/595067.png' 
        : iconType === 'REMINDER'
          ? 'https://cdn-icons-png.flaticon.com/512/3119/3119338.png'
          : 'https://cdn-icons-png.flaticon.com/512/190/190411.png';
        
      new Notification(title, {
        body,
        icon,
        badge: icon,
        vibrate: [200, 100, 200],
        tag: title 
      } as any);
    }
  }, []);

  const addAlert = useCallback((alert: Omit<ActiveAlert, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setActiveAlerts(prev => [...prev, { ...alert, id }]);
    
    const title = alert.type === 'STOCK' ? '⚠️ Alerte Stock : ' + alert.medName : '💊 Rappel Médicament : ' + alert.medName;
    sendSystemNotification(title, alert.message, alert.type);

    // Auto-dismiss the UI toast after 10 seconds
    setTimeout(() => {
      setActiveAlerts(prev => prev.filter(a => a.id !== id));
    }, 10000);
  }, [sendSystemNotification]);

  // Welcome Alert
  useEffect(() => {
    if (permission === 'granted' && !hasWelcomed.current) {
      addAlert({
        type: 'REMINDER',
        medName: 'MedCare+',
        message: 'Les alertes système sont actives ! Nous vous informerons pour vos doses.'
      });
      hasWelcomed.current = true;
    }
  }, [permission, addAlert]);

  // Check for intake reminders every 10 seconds for better accuracy
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentMinute = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      
      // Reset tracked reminders when the minute changes
      const minuteKey = currentMinute;
      const prevKeys = Array.from(remindedThisMinute.current);
      if (prevKeys.length > 0 && !prevKeys[0]?.startsWith(currentMinute + '|')) {
        remindedThisMinute.current.clear();
      }
      
      medications.forEach(med => {
        if (!med.isActive && med.isActive !== undefined) return;
        if (med.schedules?.includes(currentMinute)) {
          const key = `${currentMinute}|${med.name}`;
          if (!remindedThisMinute.current.has(key)) {
            remindedThisMinute.current.add(key);
            addAlert({
              type: 'REMINDER',
              medName: med.name,
              message: `C'est l'heure de votre dose de ${med.name} (${med.dosage}).`
            });
          }
        }
      });
    };

    // Run immediately on mount/medication change
    checkReminders();
    const interval = setInterval(checkReminders, 10000);
    return () => clearInterval(interval);
  }, [medications, addAlert]);

  // Check for stock alerts whenever medications change
  useEffect(() => {
    medications.forEach(med => {
      if (!med.isActive && med.isActive !== undefined) return;
      if (med.stockCount > 0 && med.stockCount <= med.threshold) {
        const key = `low|${med.name}`;
        if (!stockAlerted.current.has(key)) {
          stockAlerted.current.add(key);
          addAlert({
            type: 'STOCK',
            medName: med.name,
            message: `Attention : Le stock de ${med.name} est bas (${med.stockCount} restants). Pensez à vous réapprovisionner !`
          });
        }
      } else if (med.stockCount === 0 && med.id !== 'test-id') {
        const key = `out|${med.name}`;
        if (!stockAlerted.current.has(key)) {
          stockAlerted.current.add(key);
          addAlert({
            type: 'STOCK',
            medName: med.name,
            message: `Rupture : Vous n'avez plus de ${med.name} !`
          });
        }
      } else if (med.stockCount > med.threshold) {
        // Stock was refilled — allow future alerts
        stockAlerted.current.delete(`low|${med.name}`);
        stockAlerted.current.delete(`out|${med.name}`);
      }
    });
  }, [medications, addAlert]);

  return (
    <>
      {/* Toast Notification Layer */}
      <div className="fixed top-6 right-6 z-[100] w-full max-w-sm space-y-4 pointer-events-none">
        {activeAlerts.map((alert) => (
          <div 
            key={alert.id}
            className={`pointer-events-auto w-full p-5 rounded-[2rem] shadow-2xl border backdrop-blur-xl animate-in slide-in-from-right duration-500 ${
              alert.type === 'STOCK' 
                ? 'bg-red-600 border-red-500 text-white' 
                : 'bg-slate-900 border-white/10 text-white'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                alert.type === 'STOCK' ? 'bg-white/20' : 'bg-blue-500'
              }`}>
                <i className={`fas ${alert.type === 'STOCK' ? 'fa-triangle-exclamation' : 'fa-bell'} text-xl`}></i>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-black uppercase text-[10px] tracking-widest opacity-70 mb-1">
                    {alert.type === 'STOCK' ? 'Alerte Stock' : 'Rappel Médicament'}
                  </h4>
                  <button onClick={() => setActiveAlerts(prev => prev.filter(a => a.id !== alert.id))}>
                    <i className="fas fa-times text-xs opacity-50 hover:opacity-100"></i>
                  </button>
                </div>
                <p className="font-bold leading-tight">{alert.message}</p>
                {alert.type === 'STOCK' && alert.medName !== 'Test Vitamin' && onViewChange && (
                  <button 
                    onClick={() => {
                      onViewChange('map');
                      setActiveAlerts(prev => prev.filter(a => a.id !== alert.id));
                    }}
                    className="mt-3 px-4 py-1.5 bg-white text-red-600 text-[10px] font-black rounded-full hover:bg-slate-100 transition"
                  >
                    TROUVER UNE PHARMACIE
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Permission Request helper (mini) */}
        {permission === 'default' && (
          <div className="pointer-events-auto bg-white border-2 border-blue-500 p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom duration-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <i className="fas fa-shield-halved text-2xl"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Activer les Alertes</p>
                <p className="text-xs font-medium text-slate-500">Autorisez les rappels système même lorsque l'application est réduite.</p>
              </div>
            </div>
            <button 
              onClick={() => Notification.requestPermission().then(setPermission)}
              className="w-full py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-100"
            >
              AUTORISER LES NOTIFICATIONS
            </button>
          </div>
        )}
      </div>
      {children}
    </>
  );
};

export default NotificationProvider;
