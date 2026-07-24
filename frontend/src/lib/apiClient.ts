// Client HTTP minimal vers le backend. Pas de librairie externe
// (axios, etc.) — fetch natif suffit pour ce volume d'appels, et évite
// une dépendance de plus.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface ApiErrorBody {
  error: string;
  message: string;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  // Pas de Content-Type forcé pour un FormData (upload de fichier) :
  // le navigateur doit fixer lui-même le boundary multipart, un
  // Content-Type manuel casserait le parsing côté serveur.
  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = await res.json();
    } catch {
      // Le serveur n'a pas renvoyé de JSON exploitable (erreur réseau,
      // page d'erreur générique...) — on garde un message générique.
    }
    throw new ApiRequestError(res.status, body?.error ?? 'UNKNOWN_ERROR', body?.message ?? 'Une erreur est survenue.');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
