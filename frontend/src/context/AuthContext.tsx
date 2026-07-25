// Gestion de la session côté client.
//
// Choix de stockage : localStorage pour l'access token ET le refresh
// token. Compromis assumé — une tablette de cuisine partagée entre
// équipiers a besoin de rester connectée entre les rechargements de
// page sans ressaisir un mot de passe à chaque fois (contexte "mains
// occupées, tablette posée" du prompt d'origine). Le vrai risque de
// localStorage est le vol de token via une faille XSS ; à durcir plus
// tard (cookies httpOnly + CSRF) si l'app grandit au-delà d'un usage
// interne restreint.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, ApiRequestError } from '../lib/apiClient';

export type UserRole = 'GERANT' | 'CUISINE' | 'SERVICE';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  restaurantId: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

interface RefreshResponse extends AuthTokens {}

export interface BootstrapRestaurantPayload {
  restaurantName: string;
  gerant: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}

interface StoredSession extends AuthTokens {
  user: AuthUser;
}

const STORAGE_KEY = 'foodcfo_session';

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function persistSession(session: StoredSession | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  createRestaurant: (payload: BootstrapRestaurantPayload) => Promise<void>;
  logout: () => Promise<void>;
  // Pour les futurs appels API authentifiés (Phase 1.5+) : injecte le
  // token courant et rafraîchit automatiquement une fois en cas de 401.
  authFetch: <T>(path: string, options?: RequestInit) => Promise<T>;
  // Exposé pour les rares appels qui ne passent pas par authFetch (ex:
  // téléchargement d'un export CSV, Phase 6 — pas de JSON à parser,
  // donc pas via apiRequest<T>).
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredSession();
    if (stored) {
      setUser(stored.user);
      setAccessToken(stored.accessToken);
      setRefreshToken(stored.refreshToken);
    }
    setIsLoading(false);
  }, []);

  function applySession(tokens: AuthTokens, sessionUser: AuthUser) {
    setUser(sessionUser);
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    persistSession({ ...tokens, user: sessionUser });
  }

  async function login(email: string, password: string) {
    const data = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    applySession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
  }

  async function createRestaurant(payload: BootstrapRestaurantPayload) {
    const data = await apiRequest<LoginResponse>('/api/restaurants/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    applySession({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
  }

  async function logout() {
    if (refreshToken) {
      try {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // La déconnexion côté client doit réussir même si l'appel réseau
        // échoue (serveur injoignable, token déjà expiré...).
      }
    }
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    persistSession(null);
  }

  async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      return await apiRequest<T>(path, options, accessToken ?? undefined);
    } catch (err) {
      const isExpiredToken = err instanceof ApiRequestError && err.status === 401;
      if (isExpiredToken && refreshToken) {
        try {
          const refreshed = await apiRequest<RefreshResponse>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });
          setAccessToken(refreshed.accessToken);
          setRefreshToken(refreshed.refreshToken);
          if (user) persistSession({ ...refreshed, user });
          // Une seule tentative de nouvelle requête avec le token frais —
          // pas de boucle si le refresh token lui-même est invalide.
          return await apiRequest<T>(path, options, refreshed.accessToken);
        } catch {
          await logout();
          throw err;
        }
      }
      throw err;
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, createRestaurant, logout, authFetch, accessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l\'intérieur de <AuthProvider>.');
  }
  return ctx;
}
