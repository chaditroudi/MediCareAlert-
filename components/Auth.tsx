import React, { useMemo, useState } from 'react';
import { User, UserRole } from '../types';

interface AuthProps {
  onLogin: (user: User, token: string) => void;
}

interface FormData {
  name: string;
  email: string;
  password: string;
}

interface AuthResponse {
  user: User;
  token: string;
  error?: string;
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
  'http://localhost:5000/api';

const INITIAL_FORM: FormData = {
  name: '',
  email: '',
  password: '',
};

const FEATURES = [
  { icon: 'fa-pills', title: 'Gestion des Médicaments', desc: 'Ajoutez et suivez tous vos traitements' },
  { icon: 'fa-camera', title: 'Scan IA d\'Ordonnance', desc: 'Convertissez vos ordonnances en texte automatiquement' },
  { icon: 'fa-bell', title: 'Rappels Automatiques', desc: 'Ne manquez plus jamais une prise' },
  { icon: 'fa-map-location-dot', title: 'Localiser Pharmacies', desc: 'Trouvez la pharmacie la plus proche' },
];

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<UserRole>(UserRole.PATIENT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const uiText = useMemo(
    () => ({
      title: isLogin ? 'Bon retour !' : 'Rejoignez-nous',
      subtitle: isLogin ? 'Connectez-vous pour accéder à votre suivi' : 'Créez votre compte en quelques secondes',
      submit: isLogin ? 'Se connecter' : 'Créer mon compte',
      switchLabel: isLogin ? 'Pas encore de compte ?' : 'Déjà inscrit ?',
      switchAction: isLogin ? 'Créer un compte' : 'Se connecter',
      endpoint: isLogin ? 'login' : 'register',
    }),
    [isLogin]
  );

  const updateField =
    (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const toggleMode = () => {
    setIsLogin((prev) => !prev);
    setError('');
    setFormData(INITIAL_FORM);
    setRole(UserRole.PATIENT);
    setShowPassword(false);
  };

  const buildPayload = () => {
    const normalizedEmail = formData.email.trim().toLowerCase();
    if (isLogin) {
      return { email: normalizedEmail, password: formData.password };
    }
    return { name: formData.name.trim(), email: normalizedEmail, password: formData.password, role };
  };

  const submitAuth = async (): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE}/auth/${uiText.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });

    let data: AuthResponse | { error?: string } = {};
    try {
      data = await response.json();
    } catch {
      throw new Error('Réponse serveur invalide.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Échec de connexion au serveur.');
    }

    if (!('user' in data) || !('token' in data)) {
      throw new Error('Réponse serveur incomplète.');
    }

    return data;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await submitAuth();
      onLogin(data.user, data.token);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Connexion impossible. Vérifiez que le backend est démarré.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full rounded-2xl border-2 bg-white px-5 py-4 pl-12 font-semibold text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60 ${
      focusedField === field
        ? 'border-blue-500 shadow-lg shadow-blue-500/10 ring-4 ring-blue-500/10'
        : 'border-slate-200 hover:border-slate-300'
    }`;

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      {/* Animated Background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-20 top-1/4 h-[500px] w-[500px] animate-pulse rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -right-20 bottom-1/4 h-[400px] w-[400px] animate-pulse rounded-full bg-emerald-500/15 blur-[100px]" style={{ animationDelay: '2s' }} />
        <div className="absolute left-1/2 top-0 h-[300px] w-[300px] animate-pulse rounded-full bg-indigo-500/10 blur-[80px]" style={{ animationDelay: '4s' }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Left Panel — Branding & Features (hidden on mobile) */}
      <div className="relative z-10 hidden w-[45%] flex-col justify-between p-12 lg:flex xl:p-16">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
            <i className="fas fa-plus-medical text-xl text-white"></i>
          </div>
          <div>
            <span className="text-xl font-black text-white">MedCare</span>
            <span className="ml-1 text-xl font-black text-blue-400">Alert+</span>
          </div>
        </div>

        {/* Hero Text */}
        <div className="space-y-8">
          <div>
            <h2 className="text-5xl font-black leading-tight text-white xl:text-6xl">
              Votre santé,<br />
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                simplifiée.
              </span>
            </h2>
            <p className="mt-4 max-w-md text-lg font-medium leading-relaxed text-slate-400">
              Le suivi médical intelligent conçu pour la Tunisie. Gérez vos traitements, scannez vos ordonnances et ne manquez plus aucune prise.
            </p>
          </div>

          {/* Feature List */}
          <div className="space-y-4">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group flex items-center gap-4 rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-sm transition-all duration-300 hover:border-white/10 hover:bg-white/10"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 text-blue-400 transition-transform duration-300 group-hover:scale-110">
                  <i className={`fas ${f.icon}`}></i>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{f.title}</h4>
                  <p className="text-xs font-medium text-slate-500">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs font-medium text-slate-600">
          © 2026 MedCareAlert+ — Fait avec <i className="fas fa-heart text-red-500"></i> en Tunisie
        </p>
      </div>

      {/* Right Panel — Form */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-[460px]">
          {/* Mobile Logo */}
          <div className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
              <i className="fas fa-plus-medical text-white"></i>
            </div>
            <div>
              <span className="text-lg font-black text-white">MedCare</span>
              <span className="ml-1 text-lg font-black text-blue-400">Alert+</span>
            </div>
          </div>

          {/* Form Card */}
          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.07] p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl md:p-10">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tight text-white">
                {uiText.title}
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-400">
                {uiText.subtitle}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Name Field (register only) */}
              {!isLogin && (
                <div className="space-y-2">
                  <label htmlFor="name" className="ml-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Nom complet
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <i className="fas fa-user text-sm"></i>
                    </div>
                    <input
                      id="name"
                      type="text"
                      required
                      disabled={loading}
                      placeholder="Ahmed Ben Ali"
                      autoComplete="name"
                      className={inputClass('name')}
                      value={formData.name}
                      onChange={updateField('name')}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </div>
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="ml-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Adresse e-mail
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <i className="fas fa-envelope text-sm"></i>
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    disabled={loading}
                    placeholder="nom@email.tn"
                    autoComplete="email"
                    inputMode="email"
                    className={inputClass('email')}
                    value={formData.email}
                    onChange={updateField('email')}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="ml-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Mot de passe
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <i className="fas fa-lock text-sm"></i>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={loading}
                    placeholder="Min. 6 caractères"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    className={`${inputClass('password')} pr-12`}
                    value={formData.password}
                    onChange={updateField('password')}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:text-blue-500"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm`}></i>
                  </button>
                </div>
              </div>

              {/* Role Selector (register only) */}
              {!isLogin && (
                <fieldset className="space-y-3 pt-1">
                  <legend className="ml-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Type de compte
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setRole(UserRole.PATIENT)}
                      aria-pressed={role === UserRole.PATIENT}
                      className={`group flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all duration-200 ${
                        role === UserRole.PATIENT
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${
                        role === UserRole.PATIENT
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                          : 'bg-white/10 text-slate-400 group-hover:text-slate-300'
                      }`}>
                        <i className="fas fa-user-injured text-lg"></i>
                      </div>
                      <span className={`text-xs font-black uppercase tracking-widest ${
                        role === UserRole.PATIENT ? 'text-blue-400' : 'text-slate-400'
                      }`}>
                        Patient
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setRole(UserRole.PHARMACIST)}
                      aria-pressed={role === UserRole.PHARMACIST}
                      className={`group flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all duration-200 ${
                        role === UserRole.PHARMACIST
                          ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 ${
                        role === UserRole.PHARMACIST
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                          : 'bg-white/10 text-slate-400 group-hover:text-slate-300'
                      }`}>
                        <i className="fas fa-prescription-bottle-medical text-lg"></i>
                      </div>
                      <span className={`text-xs font-black uppercase tracking-widest ${
                        role === UserRole.PHARMACIST ? 'text-emerald-400' : 'text-slate-400'
                      }`}>
                        Pharmacien
                      </span>
                    </button>
                  </div>
                </fieldset>
              )}

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 backdrop-blur-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
                    <i className="fas fa-circle-exclamation text-sm"></i>
                  </div>
                  <p className="text-sm font-semibold text-red-300">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="group relative mt-2 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 py-4 font-black text-white shadow-xl shadow-blue-500/25 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-emerald-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <i className="fas fa-circle-notch animate-spin"></i>
                      Connexion en cours...
                    </>
                  ) : (
                    <>
                      {uiText.submit}
                      <i className="fas fa-arrow-right text-sm transition-transform duration-200 group-hover:translate-x-1"></i>
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Divider */}
            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-bold text-slate-500">OU</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Switch Mode */}
            <div className="text-center">
              <span className="text-sm font-medium text-slate-500">{uiText.switchLabel} </span>
              <button
                type="button"
                onClick={toggleMode}
                disabled={loading}
                className="text-sm font-bold text-blue-400 transition-colors hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uiText.switchAction}
              </button>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-6 flex items-center justify-center gap-6 text-slate-600">
            <div className="flex items-center gap-1.5">
              <i className="fas fa-shield-halved text-xs text-emerald-500/70"></i>
              <span className="text-[11px] font-semibold">Sécurisé</span>
            </div>
            <div className="flex items-center gap-1.5">
              <i className="fas fa-lock text-xs text-blue-500/70"></i>
              <span className="text-[11px] font-semibold">Chiffré</span>
            </div>
            <div className="flex items-center gap-1.5">
              <i className="fas fa-user-shield text-xs text-indigo-500/70"></i>
              <span className="text-[11px] font-semibold">Privé</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;