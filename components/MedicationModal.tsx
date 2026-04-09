
import React, { useState, useRef } from 'react';
import { Medication } from '../types';

interface MedicationModalProps {
  onClose: () => void;
  onSave: (med: Partial<Medication>, imageFile?: File) => void;
  editMed?: Medication | null;
}

const MedicationModal: React.FC<MedicationModalProps> = ({ onClose, onSave, editMed }) => {
  const [formData, setFormData] = useState({
    name: editMed?.name || '',
    dosage: editMed?.dosage || '',
    frequency: editMed?.frequency || '1x daily',
    durationInDays: editMed?.durationInDays || 7,
    stockCount: editMed?.stockCount || 30,
    threshold: editMed?.threshold || 5,
    schedules: editMed?.schedules || ['08:00']
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    (editMed as any)?.imageUrl ? `http://localhost:5000${(editMed as any).imageUrl}` : null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const addTime = () => {
    setFormData(prev => ({ ...prev, schedules: [...prev.schedules, '12:00'] }));
  };

  const removeTime = (idx: number) => {
    setFormData(prev => ({ ...prev, schedules: prev.schedules.filter((_, i) => i !== idx) }));
  };

  const handleTimeChange = (idx: number, val: string) => {
    const newSched = [...formData.schedules];
    newSched[idx] = val;
    setFormData({ ...formData, schedules: newSched });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-10">
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-3xl font-black text-slate-900">{editMed ? 'Modifier Médicament' : 'Ajouter Médicament'}</h2>
            <button onClick={onClose} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Nom du Médicament</label>
              <input 
                type="text" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                placeholder="ex: Paracétamol"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Dosage</label>
              <input 
                type="text" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                placeholder="500mg"
                value={formData.dosage}
                onChange={e => setFormData({...formData, dosage: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Fréquence</label>
              <input 
                type="text" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                placeholder="ex: 3x par jour"
                value={formData.frequency}
                onChange={e => setFormData({...formData, frequency: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Durée (Jours)</label>
              <input 
                type="number" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                value={formData.durationInDays}
                onChange={e => setFormData({...formData, durationInDays: parseInt(e.target.value)})}
              />
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Heures de Prise</label>
            <div className="flex flex-wrap gap-3">
              {formData.schedules.map((time, idx) => (
                <div key={idx} className="flex items-center bg-blue-50 rounded-xl px-3 border border-blue-100 group">
                  <input 
                    type="time" 
                    className="bg-transparent py-2 outline-none font-black text-blue-700 text-sm"
                    value={time}
                    onChange={e => handleTimeChange(idx, e.target.value)}
                  />
                  {formData.schedules.length > 1 && (
                    <button onClick={() => removeTime(idx)} className="ml-2 text-blue-300 hover:text-red-500">
                      <i className="fas fa-times-circle"></i>
                    </button>
                  )}
                </div>
              ))}
              <button 
                onClick={addTime}
                className="w-10 h-10 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-500 transition"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-10">
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Stock Total</label>
              <input 
                type="number" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                value={formData.stockCount}
                onChange={e => setFormData({...formData, stockCount: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Seuil d'Alerte</label>
              <input 
                type="number" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold"
                value={formData.threshold}
                onChange={e => setFormData({...formData, threshold: parseInt(e.target.value)})}
              />
            </div>
          </div>

          {/* Image Upload */}
          <div className="mb-10">
            <label className="block text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Photo du Médicament</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImageFile(file);
                const reader = new FileReader();
                reader.onloadend = () => setImagePreview(reader.result as string);
                reader.readAsDataURL(file);
              }}
            />
            {imagePreview ? (
              <div className="relative group w-full">
                <img src={imagePreview} alt="Médicament" className="w-full h-40 object-cover rounded-2xl border border-slate-100" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-2xl flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-4 py-2 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-blue-50 transition"
                  >
                    <i className="fas fa-camera mr-1"></i> Changer
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="px-4 py-2 bg-white text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition"
                  >
                    <i className="fas fa-trash mr-1"></i> Supprimer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition"
              >
                <i className="fas fa-image text-2xl"></i>
                <span className="text-xs font-bold">Cliquez pour ajouter une photo</span>
              </button>
            )}
          </div>

          <button 
            onClick={() => onSave(formData, imageFile || undefined)}
            disabled={!formData.name}
            className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl hover:bg-blue-700 shadow-xl shadow-blue-200 transition active:scale-95 disabled:opacity-50"
          >
            {editMed ? 'ENREGISTRER LES MODIFICATIONS' : 'ENREGISTRER LE MÉDICAMENT'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MedicationModal;
