const envApiBase = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

const getDefaultApiBase = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:5000/api';
  }

  const { protocol, hostname, port, origin } = window.location;
  if (!port || port === '5000') {
    return `${origin}/api`;
  }

  return `${protocol}//${hostname}:5000/api`;
};

export const API_BASE = envApiBase || getDefaultApiBase();
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL?.trim().replace(/\/$/, '') || API_ORIGIN;

export const resolveAssetUrl = (path?: string | null) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
};

export const FRONTEND_ORIGIN = typeof window === 'undefined' ? '' : window.location.origin;
