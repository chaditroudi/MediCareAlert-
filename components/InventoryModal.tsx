
import React, { useState } from 'react';

interface InventoryModalProps {
  onClose: () => void;
  onSave: (item: any) => void;
}

const CATEGORIES = [
  'Antalgiques',
  'Antibiotiques',
  'Diabète',
  'Compléments',
  'Cardiovasculaire',
  'Respiratoire',
  'Gastro-intestinal',
  'Dermatologie'
];

const InventoryModal: React.FC<InventoryModalProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState(() => {
    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
    return {
      name: '',
      category: 'Antalgiques',
      stock: 0,
      threshold: 10,
      expiryDate: defaultExpiry.toISOString().split('T')[0]
    };
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <form onSubmit={handleSubmit} className="p-10">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-black text-slate-900">Ajouter à l’inventaire</h2>
              <p className="text-slate-500 font-medium">Ajoutez un nouveau produit médical à la base</p>
            </div>
            <button 
              type="button"
              onClick={onClose} 
              className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Désignation du médicament</label>
              <input 
                type="text" 
                required
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                placeholder="Ex. : Augmentin 1g"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Catégorie</label>
              <select 
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 appearance-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Quantité initiale</label>
                <input 
                  type="number" 
                  min="0"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700"
                  value={formData.stock}
                  onChange={e => setFormData({...formData, stock: parseInt(e.target.value) || 0})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Seuil d’alerte stock bas</label>
                <input 
                  type="number" 
                  min="0"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700"
                  value={formData.threshold}
                  onChange={e => setFormData({...formData, threshold: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">Date d’expiration</label>
              <div className="relative">
                <i className="fas fa-calendar-alt absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"></i>
                <input 
                  type="date" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700"
                  value={formData.expiryDate}
                  onChange={e => setFormData({...formData, expiryDate: e.target.value})}
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-blue-600 text-white font-black rounded-[2rem] hover:bg-blue-700 shadow-xl shadow-blue-100 transition mt-10 active:scale-95"
          >
            AJOUTER À L’INVENTAIRE
          </button>
        </form>
      </div>
    </div>
  );
};

export default InventoryModal;
