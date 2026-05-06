
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Medication, UserRole, PharmacyInventory } from '../types';
import { useAppFeedback } from './AppFeedbackProvider';
import InventoryModal from './InventoryModal';
import { API_BASE } from '../lib/appConfig';
import { ui } from '../lib/ui';

interface InventoryManagerProps {
  user: User;
  token: string;
}

interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  category: string;
  expiryDate?: string;
  threshold: number;
  type: 'patient' | 'pharmacy';
}

type SortConfig = {
  key: keyof InventoryItem;
  direction: 'asc' | 'desc';
} | null;

const InventoryManager: React.FC<InventoryManagerProps> = ({ user, token }) => {
  const { confirm } = useAppFeedback();
  const [showAddModal, setShowAddModal] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'asc' });
  const [errorMessage, setErrorMessage] = useState('');

  const fetchInventory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      if (user.role === UserRole.PHARMACIST) {
        if (!user.pharmacyId) {
          setItems([]);
          setErrorMessage("Votre compte pharmacien n'est associe a aucune pharmacie. Un administrateur doit vous assigner une pharmacie avant d'ajouter du stock.");
          return;
        }

        const res = await fetch(`${API_BASE}/pharmacies/${user.pharmacyId}/inventory`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Impossible de charger l'inventaire de la pharmacie (${res.status})`);
        }
        const data: PharmacyInventory[] = await res.json();
        setItems(data.map(i => ({
          id: i.id,
          name: i.medicationName,
          stock: i.quantity ?? (i.stockStatus === 'available' ? 100 : i.stockStatus === 'low' ? 10 : 0),
          category: i.category || 'Stock pharmacie',
          expiryDate: i.expiryDate,
          threshold: i.threshold ?? 10,
          type: 'pharmacy'
        })));
      } else {
        const res = await fetch(`${API_BASE}/medications`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Impossible de charger les médicaments (${res.status})`);
        }
        const data: Medication[] = await res.json();
        setItems(data.map(m => ({
          id: m.id,
          name: m.name,
          stock: m.stockCount,
          category: 'Personnel',
          expiryDate: m.startDate, // Using startDate as proxy for expiry in this view
          threshold: m.threshold,
          type: 'patient'
        })));
      }
    } catch (err) {
      console.error("Impossible de charger l'inventaire", err);
      setErrorMessage("Impossible de charger l'inventaire.");
    } finally {
      setIsLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleStockChange = async (id: string, newStock: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, stock: Math.max(0, newStock) } : i));

    try {
      if (item.type === 'patient') {
        await fetch(`${API_BASE}/medications/${id}/stock`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ stockCount: Math.max(0, newStock), threshold: item.threshold })
        });
      } else if (user.pharmacyId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isExpired = item.expiryDate && new Date(item.expiryDate) < today;
        const status = isExpired ? 'expired' : newStock === 0 ? 'out_of_stock' : newStock <= item.threshold ? 'low' : 'available';
        
        await fetch(`${API_BASE}/pharmacies/${user.pharmacyId}/inventory`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            medicationName: item.name,
            stockStatus: status,
            quantity: Math.max(0, newStock),
            threshold: item.threshold,
            category: item.category,
            expiryDate: item.expiryDate
          })
        });
      }
    } catch (err) {
      console.error("Impossible de mettre à jour le stock", err);
    }
  };

  const handleAddItem = async (data: any) => {
    try {
      if (user.role === UserRole.PHARMACIST) {
        if (!user.pharmacyId) {
          setErrorMessage("Aucune pharmacie n'est associee a ce compte pharmacien.");
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isExpired = data.expiryDate && new Date(data.expiryDate) < today;
        const status = isExpired ? 'expired' : data.stock === 0 ? 'out_of_stock' : data.stock <= data.threshold ? 'low' : 'available';

        const res = await fetch(`${API_BASE}/pharmacies/${user.pharmacyId}/inventory`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            medicationName: data.name,
            stockStatus: status,
            quantity: data.stock,
            threshold: data.threshold,
            category: data.category,
            expiryDate: data.expiryDate
          })
        });
        if (!res.ok) {
          throw new Error(`Impossible d'ajouter un article à l'inventaire de la pharmacie (${res.status})`);
        }
      } else {
        const res = await fetch(`${API_BASE}/medications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: data.name,
            stockCount: data.stock,
            threshold: data.threshold,
            dosage: '1 unité',
            frequency: '1 fois par jour'
          })
        });
        if (!res.ok) {
          throw new Error(`Impossible d'ajouter le médicament (${res.status})`);
        }
      }
      fetchInventory();
      setShowAddModal(false);
    } catch (err) {
      console.error("Impossible d'ajouter l'article", err);
      setErrorMessage("Impossible d'ajouter cet article a l'inventaire.");
    }
  };

  const handleDeleteItem = async (id: string, name: string, type: string) => {
    const shouldDelete = await confirm({
      title: 'Supprimer cet article ?',
      message: `L'article "${name}" sera retiré de l'inventaire.`,
      tone: 'danger',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
    });
    if (!shouldDelete) return;

    try {
      if (type === 'pharmacy' && user.pharmacyId) {
        await fetch(`${API_BASE}/pharmacies/${user.pharmacyId}/inventory/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        await fetch(`${API_BASE}/medications/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error("Impossible de supprimer l'article", err);
    }
  };

  const handleSignalRupture = async (id: string, name: string) => {
    if (!user.pharmacyId) return;
    try {
      await fetch(`${API_BASE}/pharmacies/${user.pharmacyId}/inventory`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          medicationName: name,
          stockStatus: 'out_of_stock',
          quantity: 0
        })
      });
      setItems(prev => prev.map(i => i.id === id ? { ...i, stock: 0 } : i));
    } catch (err) {
      console.error("Impossible de signaler la rupture", err);
    }
  };

  const requestSort = (key: keyof InventoryItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getStatus = (item: InventoryItem) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isExpired = item.expiryDate && new Date(item.expiryDate) < today;
    if (isExpired) return { label: 'Expiré', color: 'bg-red-100 text-red-700' };
    if (item.stock === 0) return { label: 'Rupture', color: 'bg-red-100 text-red-700' };
    if (item.stock <= item.threshold) return { label: 'Stock Bas', color: 'bg-amber-100 text-amber-700' };
    return { label: 'En Stock', color: 'bg-emerald-100 text-emerald-700' };
  };

  const sortedItems = useMemo(() => {
    const sortableItems = [...items];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA === undefined || valB === undefined) return 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [items, sortConfig]);

  if (isLoading) {
    return (
      <div className={ui.loadingWrap}>
        <div className={ui.loadingSpinner}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {user.role === UserRole.PHARMACIST ? 'Inventaire Pharmacie' : 'Mon Armoire à Pharmacie'}
          </h2>
          <p className="text-slate-500 font-medium">
            {user.role === UserRole.PHARMACIST ? 'Gérez vos niveaux de stock en pharmacie' : 'Suivez vos réserves personnelles de médicaments'}
          </p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition flex items-center gap-3 active:scale-95"
        >
          <i className="fas fa-plus"></i> AJOUTER
        </button>
      </div>

      {errorMessage && <div className={ui.error}>{errorMessage}</div>}

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th 
                  onClick={() => requestSort('name')}
                  className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition"
                >
                  Médicament {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Catégorie</th>
                <th 
                  onClick={() => requestSort('stock')}
                  className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition text-center"
                >
                  Niveau de Stock {sortConfig?.key === 'stock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Statut</th>
                <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedItems.map((item) => {
                const status = getStatus(item);

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition group">
                    <td className="px-8 py-6">
                      <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.name}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-lg">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <input 
                          type="number" 
                          min="0"
                          value={item.stock}
                          onChange={(e) => handleStockChange(item.id, parseInt(e.target.value) || 0)}
                          className={`w-20 px-3 py-2 text-center font-black rounded-xl border-2 transition-all outline-none ${
                            item.stock === 0 ? 'border-red-200 bg-red-50 text-red-600' :
                            item.stock <= item.threshold ? 'border-amber-200 bg-amber-50 text-amber-700' :
                            'border-slate-100 bg-slate-50 text-slate-700 focus:border-blue-500 focus:bg-white'
                          }`}
                        />
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm transition-all duration-300 ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.role === UserRole.PHARMACIST && item.stock > 0 && (
                          <button 
                            onClick={() => handleSignalRupture(item.id, item.name)}
                            className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center hover:bg-amber-600 hover:text-white transition-all transform active:scale-90"
                            title="Signaler rupture"
                          >
                            <i className="fas fa-exclamation-triangle"></i>
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteItem(item.id, item.name, item.type)}
                          className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all transform active:scale-90"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <SummaryCard 
          icon="fa-boxes-stacked" 
          value={items.length} 
          label="Total articles" 
          color="text-blue-600" 
          bg="bg-blue-50" 
        />
        <SummaryCard 
          icon="fa-triangle-exclamation" 
          value={items.filter(i => i.stock <= i.threshold && i.stock > 0).length} 
          label="Alertes stock bas" 
          color="text-amber-600" 
          bg="bg-amber-50" 
        />
        <SummaryCard 
          icon="fa-circle-xmark" 
          value={items.filter(i => i.stock === 0).length} 
          label="Ruptures de Stock" 
          color="text-red-600" 
          bg="bg-red-50" 
        />
      </div>

      {showAddModal && (
        <InventoryModal 
          onClose={() => setShowAddModal(false)}
          onSave={handleAddItem}
        />
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ icon: string, value: number, label: string, color: string, bg: string }> = ({ icon, value, label, color, bg }) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-5 transition-transform hover:scale-[1.02]">
    <div className={`w-14 h-14 ${bg} ${color} rounded-2xl flex items-center justify-center text-xl shadow-inner`}>
      <i className={`fas ${icon}`}></i>
    </div>
    <div>
      <h4 className="text-2xl font-black text-slate-900 leading-none mb-1">{value}</h4>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    </div>
  </div>
);

export default InventoryManager;
