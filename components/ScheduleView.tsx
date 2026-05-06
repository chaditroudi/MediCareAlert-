import React, { useState, useMemo } from 'react';
import { Medication } from '../types';

interface ScheduleViewProps {
  medications: Medication[];
  onTakeMedication: (id: string, scheduledTime?: string) => void;
  onViewChange: (view: any) => void;
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const ScheduleView: React.FC<ScheduleViewProps> = ({ medications, onTakeMedication, onViewChange }) => {
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Get the week's days starting from today
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - today.getDay() + i);
      days.push({
        date: d,
        dayIndex: d.getDay(),
        dateStr: d.toISOString().split('T')[0],
        isToday: d.toISOString().split('T')[0] === todayStr,
        dayNum: d.getDate(),
        dayName: DAYS_SHORT[d.getDay()],
        dayNameFull: DAYS_FR[d.getDay()]
      });
    }
    return days;
  }, [todayStr]);

  // Filter active medications (not expired)
  const activeMeds = useMemo(() => {
    return medications.filter(med => {
      if (!med.isActive && med.isActive !== undefined) return false;
      if (!med.startDate) return true;
      const start = new Date(med.startDate);
      const end = new Date(start);
      end.setDate(start.getDate() + (med.durationInDays || 0));
      return new Date() <= end;
    });
  }, [medications]);

  // Build schedule entries grouped by time for the selected day
  const scheduleByTime = useMemo(() => {
    const timeMap: Record<string, Array<{ med: Medication; taken: boolean }>> = {};

    activeMeds.forEach(med => {
      (med.schedules || []).forEach(time => {
        if (!timeMap[time]) timeMap[time] = [];

        // Check if taken for today only
        const selectedDate = weekDays.find(d => d.dayIndex === selectedDay)?.dateStr || todayStr;
        const isTaken = (med.history || []).some(
          h => h.date === selectedDate && h.time === time && h.status === 'taken'
        );

        timeMap[time] = timeMap[time] || [];
        timeMap[time].push({ med, taken: isTaken });
      });
    });

    return Object.entries(timeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, meds]) => ({ time, meds }));
  }, [activeMeds, selectedDay, weekDays, todayStr]);

  // Group by period of day
  const getTimePeriod = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour < 12) return 'Matin';
    if (hour < 17) return 'Après-midi';
    return 'Soir';
  };

  const periodColors: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    'Matin': { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'fa-sun', border: 'border-amber-200' },
    'Après-midi': { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'fa-cloud-sun', border: 'border-blue-200' },
    'Soir': { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'fa-moon', border: 'border-indigo-200' },
  };

  const scheduledByPeriod = useMemo(() => {
    const periods: Record<string, typeof scheduleByTime> = { 'Matin': [], 'Après-midi': [], 'Soir': [] };
    scheduleByTime.forEach(entry => {
      const period = getTimePeriod(entry.time);
      periods[period].push(entry);
    });
    return periods;
  }, [scheduleByTime]);

  const totalDoses = scheduleByTime.reduce((acc, s) => acc + s.meds.length, 0);
  const takenDoses = scheduleByTime.reduce((acc, s) => acc + s.meds.filter(m => m.taken).length, 0);
  const isSelectedToday = weekDays.find(d => d.dayIndex === selectedDay)?.isToday;

  // Next upcoming dose
  const nextDose = useMemo(() => {
    if (!isSelectedToday) return null;
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    for (const entry of scheduleByTime) {
      if (entry.time >= currentTime) {
        const untakenMed = entry.meds.find(m => !m.taken);
        if (untakenMed) return { time: entry.time, med: untakenMed.med };
      }
    }
    return null;
  }, [scheduleByTime, isSelectedToday]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">Planning de Prise</h2>
            <p className="text-slate-500 font-medium">Votre programme de médicaments pour la semaine</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}
            >
              <i className="fas fa-timeline mr-2"></i>Chronologie
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400'}`}
            >
              <i className="fas fa-list mr-2"></i>Liste
            </button>
          </div>
        </div>
      </div>

      {/* Week Day Selector */}
      <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => (
            <button
              key={day.dayIndex}
              onClick={() => setSelectedDay(day.dayIndex)}
              className={`flex flex-col items-center py-4 rounded-2xl transition-all ${
                selectedDay === day.dayIndex
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105'
                  : day.isToday
                    ? 'bg-blue-50 text-blue-700 border-2 border-blue-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{day.dayName}</span>
              <span className="text-2xl font-black mt-1">{day.dayNum}</span>
              {day.isToday && selectedDay !== day.dayIndex && (
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-3xl font-black text-slate-900">{totalDoses}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Doses Prévues</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
          <div className="text-3xl font-black text-emerald-600">{takenDoses}</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Doses Prises</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center relative overflow-hidden">
          <div className="text-3xl font-black text-blue-600">{totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0}%</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Complété</p>
          <div className="absolute bottom-0 left-0 h-1.5 bg-blue-500 transition-all" style={{ width: `${totalDoses > 0 ? (takenDoses / totalDoses) * 100 : 0}%` }}></div>
        </div>
      </div>

      {/* Next Dose Alert */}
      {nextDose && isSelectedToday && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-[2rem] text-white flex items-center gap-5 shadow-xl shadow-blue-200">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-sm">
            <i className="fas fa-bell text-3xl"></i>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-1">Prochaine Prise</p>
            <h3 className="text-xl font-black">{nextDose.med.name} — {nextDose.med.dosage}</h3>
            <p className="text-blue-200 font-bold mt-1">Prévue à {nextDose.time}</p>
          </div>
          <button
            onClick={() => onTakeMedication(nextDose.med.id || (nextDose.med as any)._id, nextDose.time)}
            className="px-6 py-3 bg-white text-blue-700 font-black text-xs rounded-xl hover:bg-blue-50 transition shadow-md active:scale-95"
          >
            PRENDRE
          </button>
        </div>
      )}

      {/* No medications message */}
      {activeMeds.length === 0 && (
        <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
            <i className="fas fa-calendar-plus text-5xl"></i>
          </div>
          <h3 className="text-2xl font-black text-slate-800 mb-2">Aucun médicament programmé</h3>
          <p className="text-slate-400 max-w-sm mx-auto font-medium mb-8">Ajoutez des médicaments depuis le tableau de bord pour voir votre planning.</p>
          <button
            onClick={() => onViewChange('dashboard')}
            className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-100 active:scale-95"
          >
            ALLER AU TABLEAU DE BORD
          </button>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && activeMeds.length > 0 && (
        <div className="space-y-8">
          {Object.entries(scheduledByPeriod).map(([period, entries]) => {
            if (entries.length === 0) return null;
            const colors = periodColors[period];
            return (
              <div key={period}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 ${colors.bg} ${colors.text} rounded-xl flex items-center justify-center`}>
                    <i className={`fas ${colors.icon}`}></i>
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{period}</h3>
                  <span className="text-xs font-bold text-slate-400">{entries.reduce((a, e) => a + e.meds.length, 0)} dose(s)</span>
                </div>
                <div className="relative ml-5 border-l-2 border-slate-100 pl-8 space-y-6">
                  {entries.map((entry) => (
                    <div key={entry.time} className="relative">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[2.55rem] top-3 w-4 h-4 rounded-full border-2 border-white shadow-sm ${
                        entry.meds.every(m => m.taken) ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}></div>

                      <div className="mb-2">
                        <span className="text-2xl font-black text-slate-900">{entry.time}</span>
                      </div>

                      <div className="space-y-3">
                        {entry.meds.map(({ med, taken }) => (
                          <div
                            key={med.id || (med as any)._id}
                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                              taken
                                ? 'bg-emerald-50/50 border-emerald-100'
                                : `${colors.bg} ${colors.border}`
                            }`}
                          >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                              taken ? 'bg-emerald-100 text-emerald-600' : 'bg-white/80 text-slate-600'
                            }`}>
                              <i className={`fas ${taken ? 'fa-check' : 'fa-capsules'} text-lg`}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-black text-sm ${taken ? 'text-emerald-800 line-through' : 'text-slate-900'}`}>
                                {med.name}
                              </h4>
                              <p className="text-xs font-bold text-slate-400">{med.dosage} • {med.frequency}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  med.stockCount === 0 ? 'bg-red-100 text-red-600' :
                                  med.stockCount <= med.threshold ? 'bg-amber-100 text-amber-600' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {med.stockCount} en stock
                                </span>
                              </div>
                            </div>
                            {isSelectedToday && !taken && med.stockCount > 0 && (
                              <button
                                onClick={() => onTakeMedication(med.id || (med as any)._id, entry.time)}
                                className="px-5 py-3 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-blue-600 transition shadow-md active:scale-95 shrink-0"
                              >
                                PRENDRE
                              </button>
                            )}
                            {taken && (
                              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-widest shrink-0">
                                <i className="fas fa-check mr-1"></i>Pris
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && activeMeds.length > 0 && (
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
          {scheduleByTime.length === 0 ? (
            <div className="p-16 text-center text-slate-300">
              <i className="fas fa-calendar-xmark text-5xl mb-4 opacity-30"></i>
              <p className="font-bold text-lg">Aucune dose programmée pour ce jour.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Heure</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Médicament</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Dosage</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Stock</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scheduleByTime.flatMap(entry =>
                  entry.meds.map(({ med, taken }) => (
                    <tr key={`${entry.time}-${med.id || (med as any)._id}`} className="hover:bg-slate-50/50 transition">
                      <td className="px-8 py-5">
                        <span className="font-black text-slate-900 text-lg">{entry.time}</span>
                        <span className="ml-2 text-[10px] font-black text-slate-400 uppercase">{getTimePeriod(entry.time)}</span>
                      </td>
                      <td className="px-8 py-5 font-black text-slate-900">{med.name}</td>
                      <td className="px-8 py-5 text-slate-500 font-bold">{med.dosage}</td>
                      <td className="px-8 py-5">
                        <span className={`text-xs font-black ${med.stockCount <= med.threshold ? 'text-red-600' : 'text-slate-500'}`}>
                          {med.stockCount} unités
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {taken ? (
                          <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full">PRIS</span>
                        ) : isSelectedToday && med.stockCount > 0 ? (
                          <button
                            onClick={() => onTakeMedication(med.id || (med as any)._id, entry.time)}
                            className="px-4 py-2 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-blue-600 transition active:scale-95"
                          >
                            PRENDRE
                          </button>
                        ) : (
                          <span className="px-4 py-1.5 bg-slate-100 text-slate-400 text-xs font-black rounded-full">EN ATTENTE</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Medication Summary */}
      {activeMeds.length > 0 && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-6">Résumé des Traitements Actifs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeMeds.map(med => {
              const daysLeft = med.startDate
                ? Math.max(0, Math.ceil((new Date(new Date(med.startDate).getTime() + med.durationInDays * 86400000).getTime() - Date.now()) / 86400000))
                : 0;
              return (
                <div key={med.id || (med as any)._id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    med.stockCount <= med.threshold ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    <i className="fas fa-capsules"></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-sm text-slate-900 truncate">{med.name}</h4>
                    <p className="text-[10px] font-bold text-slate-400">
                      {med.schedules?.length || 0}x/jour • {daysLeft}j restants • {med.stockCount} en stock
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleView;
