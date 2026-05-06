import React, { useEffect, useMemo, useState } from 'react';
import { PharmacyInventory, User } from '../types';
import { API_BASE } from '../lib/appConfig';
import { readApiResponse } from '../lib/api';

interface PharmacyWithInventory {
  id: string;
  name: string;
  address: string;
  phone?: string;
  inventory: PharmacyInventory[];
}

interface PharmacyStockCatalogProps {
  user: User;
}

const stockStatusMeta: Record<PharmacyInventory['stockStatus'], { label: string; className: string }> = {
  available: { label: 'Disponible', className: 'bg-emerald-50 text-emerald-700' },
  low: { label: 'Stock bas', className: 'bg-amber-50 text-amber-700' },
  out_of_stock: { label: 'Rupture', className: 'bg-rose-50 text-rose-700' },
  expired: { label: 'Expire', className: 'bg-slate-100 text-slate-600' },
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PharmacyStockCatalog: React.FC<PharmacyStockCatalogProps> = ({ user }) => {
  const [pharmacies, setPharmacies] = useState<PharmacyWithInventory[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setIsLoading(true);
      setError('');

      try {
        const res = await fetch(`${API_BASE}/pharmacies/stock-catalog`);
        const data = await readApiResponse(res);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load stock catalog');
        }
        if (!cancelled) {
          setPharmacies(Array.isArray(data) ? data : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Impossible de charger les stocks des pharmacies.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadCatalog();
    return () => { cancelled = true; };
  }, []);

  const filteredPharmacies = useMemo(() => {
    const query = normalizeText(search);

    return pharmacies.map((pharmacy) => {
      const matchedInventory = query
        ? pharmacy.inventory.filter((item) => normalizeText(item.medicationName).includes(query))
        : pharmacy.inventory;

      return {
        ...pharmacy,
        matchedInventory,
        hasMatch: matchedInventory.length > 0,
      };
    });
  }, [pharmacies, search]);

  const pharmaciesWithPublishedStock = pharmacies.filter((pharmacy) => pharmacy.inventory.length > 0).length;
  const matchingPharmacies = filteredPharmacies.filter((pharmacy) => pharmacy.hasMatch).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900">Stocks des pharmacies</h2>
            <p className="mt-2 text-slate-500 font-medium">
              {user.name}, verifiez facilement si un medicament existe dans une pharmacie avant de vous deplacer.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pharmacies</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{pharmacies.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Avec stock</p>
              <p className="mt-2 text-2xl font-black text-blue-600">{pharmaciesWithPublishedStock}</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label htmlFor="stock-search" className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Rechercher un medicament
          </label>
          <input
            id="stock-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ex: Doliprane, Paracetamol, Augmentin"
            className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-700"
          />
          {search.trim() && (
            <p className="mt-3 text-sm font-semibold text-slate-500">
              {matchingPharmacies} pharmacie{matchingPharmacies > 1 ? 's' : ''} correspond{matchingPharmacies > 1 ? 'ent' : ''} a votre recherche.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {filteredPharmacies.map((pharmacy) => (
          <div key={pharmacy.id} className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{pharmacy.name}</h3>
                  <p className="mt-2 text-sm text-slate-500 font-medium">{pharmacy.address}</p>
                  {pharmacy.phone && (
                    <p className="mt-2 text-xs font-bold text-slate-400">{pharmacy.phone}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-[11px] font-black uppercase tracking-widest">
                    {pharmacy.inventory.length} medicament{pharmacy.inventory.length > 1 ? 's' : ''}
                  </span>
                  {search.trim() && (
                    <span className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest ${
                      pharmacy.hasMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {pharmacy.hasMatch ? 'Existe' : 'N existe pas'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {pharmacy.inventory.length === 0 ? (
              <div className="p-6">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-500">
                    Cette pharmacie n a pas encore publie son stock.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {search.trim() && (
                  <div className={`rounded-2xl px-4 py-4 border ${
                    pharmacy.hasMatch ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                  }`}>
                    <p className={`text-sm font-black ${pharmacy.hasMatch ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {pharmacy.hasMatch
                        ? `Oui, ${search} existe dans cette pharmacie`
                        : `Non, ${search} n existe pas dans cette pharmacie`}
                    </p>
                  </div>
                )}

                {pharmacy.hasMatch || !search.trim() ? (
                  <div className="overflow-hidden rounded-[1.75rem] border border-slate-100">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Medicament</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Statut</th>
                          <th className="px-5 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Mise a jour</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {(search.trim() ? pharmacy.matchedInventory : pharmacy.inventory).map((item) => (
                          <tr key={item.id}>
                            <td className="px-5 py-4 text-sm font-black text-slate-900">{item.medicationName}</td>
                            <td className="px-5 py-4">
                              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${stockStatusMeta[item.stockStatus].className}`}>
                                {stockStatusMeta[item.stockStatus].label}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm font-medium text-slate-500">
                              {new Date(item.lastUpdated).toLocaleDateString('fr-FR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-500">
                      Aucun medicament ne correspond a votre recherche dans cette pharmacie.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PharmacyStockCatalog;
