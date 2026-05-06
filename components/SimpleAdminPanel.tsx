import React, { useEffect, useMemo, useState } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { API_BASE } from '../lib/appConfig';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

interface SimpleAdminPanelProps {
  token: string;
}

interface TrendPoint {
  _id: string;
  count: number;
}

interface ComparisonData {
  thisWeek: number;
  lastWeek: number;
  change: number;
}

interface AnalyticsData {
  users: { total: number; active: number; patients: number; pharmacists: number; admins: number };
  pharmacies: { total: number; active: number; inactive: number };
  medications: { total: number; active: number; inactive: number };
  prescriptions: { total: number; processed: number; failed: number; pending: number; successRate: number; avgConfidence: number; avgProcessingTime: number; totalMedsExtracted: number };
  requests: { total: number; pending: number; confirmed: number; outOfStock: number; resolved: number; resolutionRate: number; avgResolutionHours: number };
  inventory: { total: number; available: number; low: number; outOfStock: number; expired: number; healthScore: number };
  categories: { total: number };
  growth: { users: TrendPoint[]; requests: TrendPoint[]; prescriptions: TrendPoint[]; medications: TrendPoint[] };
  weeklyComparison: { users: ComparisonData; requests: ComparisonData; prescriptions: ComparisonData; medications: ComparisonData };
  topMedications: { name: string; count: number; activeCount: number }[];
  topPharmacies: { pharmacyName: string; requestCount: number }[];
  adherence: { taken: number; missed: number; rate: number; trend: { _id: string; taken: number; missed: number }[] };
}

const EMPTY_ANALYTICS: AnalyticsData = {
  users: { total: 0, active: 0, patients: 0, pharmacists: 0, admins: 0 },
  pharmacies: { total: 0, active: 0, inactive: 0 },
  medications: { total: 0, active: 0, inactive: 0 },
  prescriptions: { total: 0, processed: 0, failed: 0, pending: 0, successRate: 0, avgConfidence: 0, avgProcessingTime: 0, totalMedsExtracted: 0 },
  requests: { total: 0, pending: 0, confirmed: 0, outOfStock: 0, resolved: 0, resolutionRate: 0, avgResolutionHours: 0 },
  inventory: { total: 0, available: 0, low: 0, outOfStock: 0, expired: 0, healthScore: 0 },
  categories: { total: 0 },
  growth: { users: [], requests: [], prescriptions: [], medications: [] },
  weeklyComparison: {
    users: { thisWeek: 0, lastWeek: 0, change: 0 },
    requests: { thisWeek: 0, lastWeek: 0, change: 0 },
    prescriptions: { thisWeek: 0, lastWeek: 0, change: 0 },
    medications: { thisWeek: 0, lastWeek: 0, change: 0 },
  },
  topMedications: [],
  topPharmacies: [],
  adherence: { taken: 0, missed: 0, rate: 0, trend: [] },
};

const CARD_GRADIENTS = [
  'from-[#0A74DA] to-[#2458D3]',
  'from-[#0F9D7A] to-[#0C7B6E]',
  'from-[#F59E0B] to-[#EA580C]',
  'from-[#E85D75] to-[#D9485F]',
];

const palette = {
  blue: '#2563EB',
  blueSoft: 'rgba(37, 99, 235, 0.18)',
  emerald: '#059669',
  emeraldSoft: 'rgba(5, 150, 105, 0.18)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.18)',
  rose: '#E11D48',
  roseSoft: 'rgba(225, 29, 72, 0.18)',
  violet: '#7C3AED',
  violetSoft: 'rgba(124, 58, 237, 0.18)',
  cyan: '#0891B2',
  cyanSoft: 'rgba(8, 145, 178, 0.18)',
  slate: '#64748B',
};

const getLastDays = (data: TrendPoint[], daysCount = 7): TrendPoint[] => {
  const days: TrendPoint[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    const found = data.find((item) => item._id === key);
    days.push({ _id: key, count: found?.count || 0 });
  }
  return days;
};

const sharedOptions: ChartOptions<'bar' | 'line' | 'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#475569',
        boxWidth: 12,
        boxHeight: 12,
        useBorderRadius: true,
        borderRadius: 4,
        font: {
          size: 11,
          weight: 700,
        },
      },
    },
    tooltip: {
      backgroundColor: '#0F172A',
      titleColor: '#F8FAFC',
      bodyColor: '#E2E8F0',
      borderColor: '#1E293B',
      borderWidth: 1,
      padding: 12,
      displayColors: true,
    },
  },
};

const axisOptions = {
  ticks: {
    color: '#94A3B8',
    font: {
      size: 10,
      weight: 700 as const,
    },
  },
  grid: {
    color: 'rgba(148, 163, 184, 0.14)',
    drawBorder: false,
  },
};

const ChartCard: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
    <div className="mb-5">
      <h3 className="text-lg font-black text-slate-900">{title}</h3>
      <p className="text-sm text-slate-400">{subtitle}</p>
    </div>
    <div className="h-80">{children}</div>
  </div>
);

const SummaryCard: React.FC<{ label: string; value: number | string; sub: string; gradient: string }> = ({ label, value, sub, gradient }) => (
  <div className={`bg-gradient-to-br ${gradient} rounded-[1.8rem] p-5 text-white shadow-lg`}>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{label}</p>
    <p className="mt-4 text-3xl font-black leading-none">{value}</p>
    <p className="mt-2 text-sm font-medium text-white/80">{sub}</p>
  </div>
);

const DetailStatCard: React.FC<{ label: string; value: number | string; tone: string; sub?: string }> = ({ label, value, tone, sub }) => (
  <div className={`rounded-[1.6rem] border p-4 ${tone}`}>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">{label}</p>
    <p className="mt-3 text-2xl font-black leading-none">{value}</p>
    {sub ? <p className="mt-2 text-xs font-semibold opacity-80">{sub}</p> : null}
  </div>
);

const SimpleAdminPanel: React.FC<SimpleAdminPanelProps> = ({ token }) => {
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(`${API_BASE}/analytics/admin`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error('Impossible de charger les analytics admin.');
        }

        const data = await response.json();
        setAnalytics({ ...EMPTY_ANALYTICS, ...data });
      } catch (err) {
        console.error(err);
        setError('Les analytics ne sont pas disponibles pour le moment.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, [token]);

  const summaryCards = [
    { label: 'Utilisateurs', value: analytics.users.total, sub: `${analytics.users.active} actifs`, gradient: CARD_GRADIENTS[0] },
    { label: 'Pharmacies', value: analytics.pharmacies.total, sub: `${analytics.pharmacies.active} actives`, gradient: CARD_GRADIENTS[1] },
    { label: 'Demandes', value: analytics.requests.total, sub: `${analytics.requests.pending} en attente`, gradient: CARD_GRADIENTS[2] },
    { label: 'Ordonnances', value: analytics.prescriptions.total, sub: `${analytics.prescriptions.successRate}% traitées`, gradient: CARD_GRADIENTS[3] },
  ];

  const usersTrend = useMemo(() => getLastDays(analytics.growth.users), [analytics.growth.users]);
  const requestsTrend = useMemo(() => getLastDays(analytics.growth.requests), [analytics.growth.requests]);
  const prescriptionsTrend = useMemo(() => getLastDays(analytics.growth.prescriptions), [analytics.growth.prescriptions]);
  const adherenceTrend = useMemo(() => analytics.adherence.trend.slice(-7), [analytics.adherence.trend]);

  const roleDoughnutData: ChartData<'doughnut'> = {
    labels: ['Patients', 'Pharmaciens', 'Administrateurs'],
    datasets: [{
      data: [analytics.users.patients, analytics.users.pharmacists, analytics.users.admins],
      backgroundColor: [palette.blue, palette.emerald, palette.amber],
      borderColor: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
      borderWidth: 4,
      hoverOffset: 8,
    }],
  };

  const requestStatusData: ChartData<'doughnut'> = {
    labels: ['En attente', 'Confirmées', 'Rupture', 'Résolues'],
    datasets: [{
      data: [analytics.requests.pending, analytics.requests.confirmed, analytics.requests.outOfStock, analytics.requests.resolved],
      backgroundColor: [palette.amber, palette.emerald, palette.rose, palette.blue],
      borderColor: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'],
      borderWidth: 4,
      hoverOffset: 8,
    }],
  };

  const usersBarData: ChartData<'bar'> = {
    labels: usersTrend.map((item) => item._id.slice(8)),
    datasets: [{
      label: 'Utilisateurs',
      data: usersTrend.map((item) => item.count),
      backgroundColor: palette.blue,
      borderRadius: 10,
      maxBarThickness: 30,
    }],
  };

  const requestsLineData: ChartData<'line'> = {
    labels: requestsTrend.map((item) => item._id.slice(8)),
    datasets: [{
      label: 'Demandes',
      data: requestsTrend.map((item) => item.count),
      borderColor: palette.amber,
      backgroundColor: palette.amberSoft,
      pointBackgroundColor: palette.amber,
      pointBorderColor: '#FFFFFF',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 6,
      borderWidth: 3,
      fill: true,
      tension: 0.35,
    }],
  };

  const prescriptionsBarData: ChartData<'bar'> = {
    labels: prescriptionsTrend.map((item) => item._id.slice(8)),
    datasets: [{
      label: 'Ordonnances',
      data: prescriptionsTrend.map((item) => item.count),
      backgroundColor: palette.emerald,
      borderRadius: 10,
      maxBarThickness: 30,
    }],
  };

  const adherenceBarData: ChartData<'bar'> = {
    labels: adherenceTrend.map((item) => item._id.slice(8)),
    datasets: [
      {
        label: 'Prises',
        data: adherenceTrend.map((item) => item.taken),
        backgroundColor: palette.emerald,
        borderRadius: 8,
      },
      {
        label: 'Manquées',
        data: adherenceTrend.map((item) => item.missed),
        backgroundColor: palette.rose,
        borderRadius: 8,
      },
    ],
  };

  const topMedicationBarData: ChartData<'bar'> = {
    labels: analytics.topMedications.slice(0, 6).map((item) => item.name),
    datasets: [{
      label: 'Occurrences',
      data: analytics.topMedications.slice(0, 6).map((item) => item.count),
      backgroundColor: palette.violet,
      borderRadius: 8,
      maxBarThickness: 18,
    }],
  };

  const topPharmaciesBarData: ChartData<'bar'> = {
    labels: analytics.topPharmacies.slice(0, 6).map((item) => item.pharmacyName),
    datasets: [{
      label: 'Demandes',
      data: analytics.topPharmacies.slice(0, 6).map((item) => item.requestCount),
      backgroundColor: palette.cyan,
      borderRadius: 8,
      maxBarThickness: 18,
    }],
  };

  const weeklyComparisonData: ChartData<'bar'> = {
    labels: ['Utilisateurs', 'Demandes', 'Ordonnances', 'Médicaments'],
    datasets: [
      {
        label: 'Cette semaine',
        data: [
          analytics.weeklyComparison.users.thisWeek,
          analytics.weeklyComparison.requests.thisWeek,
          analytics.weeklyComparison.prescriptions.thisWeek,
          analytics.weeklyComparison.medications.thisWeek,
        ],
        backgroundColor: palette.blue,
        borderRadius: 8,
      },
      {
        label: 'Semaine passée',
        data: [
          analytics.weeklyComparison.users.lastWeek,
          analytics.weeklyComparison.requests.lastWeek,
          analytics.weeklyComparison.prescriptions.lastWeek,
          analytics.weeklyComparison.medications.lastWeek,
        ],
        backgroundColor: '#CBD5E1',
        borderRadius: 8,
      },
    ],
  };

  const doughnutOptions: ChartOptions<'doughnut'> = {
    ...sharedOptions,
    cutout: '68%',
    plugins: {
      ...sharedOptions.plugins,
      legend: {
        position: 'bottom',
        labels: {
          ...sharedOptions.plugins?.legend?.labels,
        },
      },
    },
  };

  const barOptions: ChartOptions<'bar'> = {
    ...sharedOptions,
    scales: {
      x: {
        ...axisOptions,
        ticks: {
          ...axisOptions.ticks,
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        ...axisOptions,
        beginAtZero: true,
      },
    },
    plugins: {
      ...sharedOptions.plugins,
      legend: {
        display: false,
      },
    },
  };

  const stackedBarOptions: ChartOptions<'bar'> = {
    ...sharedOptions,
    scales: {
      x: {
        ...axisOptions,
        stacked: false,
      },
      y: {
        ...axisOptions,
        beginAtZero: true,
      },
    },
    plugins: {
      ...sharedOptions.plugins,
      legend: {
        position: 'bottom',
      },
    },
  };

  const horizontalBarOptions: ChartOptions<'bar'> = {
    ...sharedOptions,
    indexAxis: 'y',
    scales: {
      x: {
        ...axisOptions,
        beginAtZero: true,
      },
      y: {
        ...axisOptions,
      },
    },
    plugins: {
      ...sharedOptions.plugins,
      legend: {
        display: false,
      },
    },
  };

  const lineOptions: ChartOptions<'line'> = {
    ...sharedOptions,
    scales: {
      x: {
        ...axisOptions,
      },
      y: {
        ...axisOptions,
        beginAtZero: true,
      },
    },
    plugins: {
      ...sharedOptions.plugins,
      legend: {
        display: false,
      },
    },
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-10 text-center">
        <div className="w-12 h-12 mx-auto border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-sm font-semibold text-slate-500">Chargement des analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-[2rem] border border-red-100 shadow-sm p-8">
        <p className="text-sm font-semibold text-red-600">{error}</p>
        <p className="mt-2 text-xs text-slate-400">Le backend attendu est `GET /api/analytics/admin`.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-[linear-gradient(135deg,_#ffffff_0%,_#f4f8fb_100%)] rounded-[2rem] border border-slate-100 shadow-sm p-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Analytique admin</p>
            <h2 className="mt-3 text-3xl font-black text-slate-900">Tableau de bord analytique</h2>
            <p className="mt-2 text-sm text-slate-500 max-w-2xl">
              Vue plus propre et plus graphique avec Chart.js, basée sur les vraies données du backend.
            </p>
          </div>
          <div className="rounded-[1.5rem] bg-slate-900 text-white px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Adhérence</p>
            <p className="mt-2 text-3xl font-black">{analytics.adherence.rate}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} label={card.label} value={card.value} sub={card.sub} gradient={card.gradient} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-slate-900">Détail des utilisateurs</h3>
            <p className="text-sm text-slate-400">Les comptes supprimés visuellement sont remis ici.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <DetailStatCard label="Patients" value={analytics.users.patients} tone="border-blue-100 bg-blue-50 text-blue-700" />
            <DetailStatCard label="Pharmaciens" value={analytics.users.pharmacists} tone="border-emerald-100 bg-emerald-50 text-emerald-700" />
            <DetailStatCard label="Administrateurs" value={analytics.users.admins} tone="border-amber-100 bg-amber-50 text-amber-700" />
            <DetailStatCard label="Actifs" value={analytics.users.active} tone="border-slate-200 bg-slate-50 text-slate-700" sub={`${analytics.users.total} au total`} />
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
          <div className="mb-5">
            <h3 className="text-lg font-black text-slate-900">Détail des pharmacies</h3>
            <p className="text-sm text-slate-400">Vue simple des pharmacies enregistrées dans la plateforme.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailStatCard label="Pharmacies" value={analytics.pharmacies.total} tone="border-cyan-100 bg-cyan-50 text-cyan-700" />
            <DetailStatCard label="Actives" value={analytics.pharmacies.active} tone="border-emerald-100 bg-emerald-50 text-emerald-700" />
            <DetailStatCard label="Inactives" value={analytics.pharmacies.inactive} tone="border-rose-100 bg-rose-50 text-rose-700" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Répartition des comptes" subtitle="Patients, pharmaciens et admins">
          <Doughnut data={roleDoughnutData} options={doughnutOptions} />
        </ChartCard>
        <ChartCard title="Statut des demandes" subtitle="Répartition des demandes patient">
          <Doughnut data={requestStatusData} options={doughnutOptions} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Évolution des utilisateurs" subtitle="7 derniers jours">
          <Bar data={usersBarData} options={barOptions} />
        </ChartCard>
        <ChartCard title="Évolution des demandes" subtitle="7 derniers jours">
          <Line data={requestsLineData} options={lineOptions} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Ordonnances enregistrées" subtitle="7 derniers jours">
          <Bar data={prescriptionsBarData} options={barOptions} />
        </ChartCard>
        <ChartCard title="Adhérence des prises" subtitle="Prises vs doses manquées">
          <Bar data={adherenceBarData} options={stackedBarOptions} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Médicaments les plus fréquents" subtitle="Top 6 des médicaments">
          <Bar data={topMedicationBarData} options={horizontalBarOptions} />
        </ChartCard>
        <ChartCard title="Pharmacies les plus sollicitées" subtitle="Top 6 par nombre de demandes">
          <Bar data={topPharmaciesBarData} options={horizontalBarOptions} />
        </ChartCard>
      </div>

      <ChartCard title="Comparaison hebdomadaire" subtitle="Cette semaine vs semaine passée">
        <Bar data={weeklyComparisonData} options={stackedBarOptions} />
      </ChartCard>
    </div>
  );
};

export default SimpleAdminPanel;
