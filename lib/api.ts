import { API_BASE, FRONTEND_ORIGIN } from './appConfig';

type JsonRecord = Record<string, any>;

const isHtmlResponse = (contentType: string, text: string) =>
  contentType.includes('text/html') || text.trim().startsWith('<!DOCTYPE html') || text.trim().startsWith('<html') || text.trim().startsWith('<');

export const getApiMisrouteMessage = () => {
  const apiOrigin = API_BASE.replace(/\/api$/, '');

  if (FRONTEND_ORIGIN && apiOrigin === FRONTEND_ORIGIN) {
    return 'Le frontend pointe actuellement vers lui-meme au lieu du backend. Demarrez le serveur API sur le port 5000 ou configurez VITE_API_BASE_URL.';
  }

  return 'Le backend ne repond pas avec du JSON valide. Verifiez que le serveur API est demarre et accessible.';
};

export const readApiResponse = async <T = any>(res: Response): Promise<T> => {
  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();

  if (!rawText.trim()) {
    return {} as T;
  }

  if (isHtmlResponse(contentType, rawText)) {
    throw new Error(getApiMisrouteMessage());
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(rawText || 'Reponse serveur invalide.');
  }
};

export const getApiErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export const expectOk = (res: Response, data: JsonRecord, fallback: string) => {
  if (!res.ok) {
    throw new Error((typeof data?.error === 'string' && data.error) || fallback);
  }
};
