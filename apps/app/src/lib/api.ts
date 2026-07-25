/**
 * API client. Replaces v1's src/lib/supabase.ts.
 *
 * Deliberately a thin typed fetch wrapper: the server owns authorization (RLS) and
 * Dutch error messaging, so the client's job is transport and nothing more.
 */

import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './session';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Called when the session cannot be recovered, so the UI can drop back to a logged-out
 * state. Set by the session provider rather than imported, to avoid a cycle.
 */
let onSessionLost: (() => void) | undefined;
export function setSessionLostHandler(fn: () => void): void {
  onSessionLost = fn;
}

async function rawFetch(path: string, init: RequestInit | undefined, token: string | null) {
  return fetch(`${BASE}/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

/**
 * Exchanges the stored refresh token for a new session.
 *
 * Single-flight: several requests can 401 at once when a token expires, and each firing
 * its own refresh would burn the rotating token and trip the API's reuse detection,
 * logging the user out for doing nothing wrong. They all await the same promise instead.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const refresh = await getRefreshToken();
      if (!refresh) return false;

      const res = await rawFetch(
        '/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) },
        null,
      );
      if (!res.ok) return false;

      const session = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };
      setAccessToken(session.access_token, session.expires_in);
      await setRefreshToken(session.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      // Cleared regardless, so a later expiry can refresh again.
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // An expired access token is refreshed before the request rather than after a 401,
  // which saves a round trip on the common case.
  let token = getAccessToken();
  if (!token && (await getRefreshToken())) {
    if (await refreshSession()) token = getAccessToken();
  }

  let response: Response;
  try {
    response = await rawFetch(path, init, token);
  } catch {
    // Network-level failure: the server was never reached.
    throw new ApiError('Geen verbinding met de server.', 0);
  }

  // A 401 on a request we believed was authenticated means the token died mid-flight.
  // Refresh once and retry; never loop.
  if (response.status === 401 && token) {
    if (await refreshSession()) {
      try {
        response = await rawFetch(path, init, getAccessToken());
      } catch {
        throw new ApiError('Geen verbinding met de server.', 0);
      }
    } else {
      await clearSession();
      onSessionLost?.();
    }
  }

  if (!response.ok) {
    // The API speaks RFC 9457 problem+json with a Dutch `detail` meant for display.
    const problem = await response.json().catch(() => null);
    throw new ApiError(
      problem?.detail ?? 'Er ging iets mis. Probeer het later opnieuw.',
      response.status,
    );
  }

  // 204 and other empty bodies would throw on .json().
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type StandingRow = {
  player_id: string;
  display_name: string;
  eersten_voor: number;
  eersten_tegen: number;
  saldo: number;
  deelnames: number;
  gespeeld: number;
  gewonnen: number;
  verloren: number;
  position: number | null;
  previous_position: number | null;
};

export type AgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
};

export type NewsPost = {
  id: string;
  title: string;
  intro: string | null;
  category: string | null;
  author_name: string | null;
  published_at: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  played_on: string | null;
  location: string | null;
  match_system: string;
  formation_category: string;
  status: string;
};

export type ForumTopic = {
  id: string;
  title: string;
  body: string;
  category_name: string | null;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  like_count: number;
  created_at: string;
  author_name: string | null;
};

export type ForumCategory = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export type Poll = {
  id: string;
  question: string;
  results_visible: string;
  is_closed: boolean;
  options: { option_id: string; label: string; votes: number; sort_order: number }[];
};

type List<T> = { items: T[] };

export type Me = {
  id: string;
  display_name: string;
  role: 'guest' | 'moderator' | 'admin' | 'super_admin';
  email: string | null;
  is_anonymous: boolean;
  match_entry_rights: boolean;
};

export type SessionResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

async function storeSession(s: SessionResponse): Promise<void> {
  setAccessToken(s.access_token, s.expires_in);
  await setRefreshToken(s.refresh_token);
}

export const auth = {
  async login(email: string, password: string): Promise<Me> {
    const s = await request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await storeSession(s);
    return api.me();
  },

  /** Community sign-in: a display name, no password. */
  async anonymous(displayName: string): Promise<Me> {
    const s = await request<SessionResponse>('/auth/anonymous', {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName }),
    });
    await storeSession(s);
    return api.me();
  },

  async logout(): Promise<void> {
    const refresh = await getRefreshToken();
    // Best effort: the local session is cleared even if the server call fails, so the
    // user is never left appearing logged in.
    if (refresh) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => undefined);
    }
    await clearSession();
  },

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

export const api = {
  health: () => request<{ status: string; database: string; latencyMs: number }>('/health'),
  me: () => request<Me>('/auth/me'),
  standings: () => request<List<StandingRow>>('/standings').then((r) => r.items),
  agenda: () => request<List<AgendaEvent>>('/agenda').then((r) => r.items),
  news: () => request<List<NewsPost>>('/news').then((r) => r.items),
  tournaments: () => request<List<Tournament>>('/tournaments').then((r) => r.items),
  forumTopics: () => request<List<ForumTopic>>('/forum/topics').then((r) => r.items),
  forumCategories: () => request<List<ForumCategory>>('/forum/categories').then((r) => r.items),
  activePoll: () => request<{ poll: Poll | null }>('/polls/active').then((r) => r.poll),
};

/** Dutch labels for the sport enums. Kept here so screens never show raw enum values. */
export const SYSTEM_LABELS: Record<string, string> = {
  knockout: 'Knock-out',
  knockout_consolation: 'Knock-out + herkansing',
  poule: 'Poules',
  competition: 'Competitie',
  sneker: 'Sneker telling',
};

export const FORMATION_LABELS: Record<string, string> = {
  vrije_formatie: 'Vrije formatie',
  del: 'D.E.L.',
  del_abc: 'D.E.L. ABC',
  vrije_formatie_beperkt: 'Vrije formatie (beperkt)',
  twee_tegen_twee: '2 tegen 2',
  pearke: 'Pearke',
};
