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
  /** 'heren' or 'dames' — the API ranks each group independently. */
  groep: 'heren' | 'dames';
  updated_at: string | null;
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

// ---------------------------------------------------------------- games (admin)

export type Competition = {
  id: string;
  name: string;
  category: string | null;
  status: string;
  season_name: string | null;
  player_count: number;
};

export type Round = {
  id: string;
  round_no: number;
  played_on: string | null;
  status: 'open' | 'finalized';
  finalized_at: string | null;
  match_count: number;
  result_count: number;
};

export type RoundMatch = {
  id: string;
  match_no: number;
  court: number | null;
  status: string;
  red_no: number | null;
  white_no: number | null;
  red_players: string | null;
  white_players: string | null;
  eersten_red: number | null;
  eersten_white: number | null;
  winner: 'red' | 'white' | 'draw' | null;
};

export type RoundDetail = {
  round: Round & { competition_id: string; competition_name: string };
  matches: RoundMatch[];
};

export type PreviewRow = { player_id: string; display_name: string; current_status: string };

export type AdminPlayer = {
  id: string;
  display_name: string;
  first_name: string;
  infix: string | null;
  last_name: string;
  skill_level: 'A' | 'B' | 'C' | null;
  gender: 'dame' | 'heer' | 'anders' | null;
  club: string | null;
  is_active: boolean;
  phone: string | null;
  email: string | null;
  archived_at: string | null;
};

export type PlayerMatch = {
  id: string;
  match_no: number;
  status: string;
  round_no: number | null;
  played_on: string | null;
  tournament_name: string | null;
  own_team_no: number | null;
  eersten_voor: number | null;
  eersten_tegen: number | null;
  won: boolean;
  has_result: boolean;
};

export type PlayerRanking = {
  position: number;
  group_size: number;
  groep: 'heren' | 'dames';
  competition_name: string;
  eersten_voor: number;
  eersten_tegen: number;
  saldo: number;
  deelnames: number;
  gespeeld: number;
  gewonnen: number;
  verloren: number;
};

export type PlayerDetail = {
  player: AdminPlayer & {
    birth_date: string | null;
    age_category: string | null;
    admin_notes: string | null;
    created_at: string;
  };
  ranking: PlayerRanking | null;
  matches: PlayerMatch[];
};

export type NewPlayer = {
  first_name: string;
  infix?: string | null;
  last_name: string;
  skill_level?: 'A' | 'B' | 'C' | null;
  gender?: 'dame' | 'heer' | 'anders' | null;
  club?: string | null;
};

export const games = {
  competitions: () => request<{ items: Competition[] }>('/competitions').then((r) => r.items),

  rounds: (competitionId: string) =>
    request<{ items: Round[] }>(`/competitions/${competitionId}/rounds`).then((r) => r.items),

  createRound: (competitionId: string, playedOn: string) =>
    request<{ id: string; round_no: number }>(`/competitions/${competitionId}/rounds`, {
      method: 'POST',
      body: JSON.stringify({ played_on: playedOn }),
    }),

  round: (roundId: string) => request<RoundDetail>(`/rounds/${roundId}`),

  /**
   * Draws parturen without persisting, so the beheerder can review and adjust first.
   * The server returns the parturen it produced from this seed and mode.
   */
  drawRound: (roundId: string, seed: number, playerIds: string[], mode: string) =>
    request<{
      seed: number;
      parturen: { team_no: number; player_ids: string[] }[];
      reserves: { name: string; reason: string }[];
      messages: string[];
    }>(`/rounds/${roundId}/draw-preview`, {
      method: 'POST',
      body: JSON.stringify({ seed, player_ids: playerIds, mode }),
    }),

  /**
   * Persists a draw. `manual` is true when parturen were adjusted by hand, which tells
   * the server to skip seed verification — the seed no longer reproduces the line-up.
   */
  publishDraw: (
    roundId: string,
    seed: number,
    playerIds: string[],
    parturen: { team_no: number; player_ids: string[] }[],
    manual: boolean,
  ) =>
    request<{ seed: number; teams: number; matches: number; messages: string[] }>(
      `/rounds/${roundId}/draw`,
      {
        method: 'POST',
        body: JSON.stringify({ seed, player_ids: playerIds, teams: parturen, manual }),
      },
    ),

  /**
   * Enter a result. `clientMutationId` must be stable across retries of the SAME entry —
   * that is what makes a resend after a dropped connection safe.
   */
  enterResult: (
    matchId: string,
    input: { eersten_red: number; eersten_white: number; note?: string | null },
    clientMutationId: string,
  ) =>
    request<{ result_id: string; winner: string }>(`/matches/${matchId}/result`, {
      method: 'POST',
      body: JSON.stringify({ ...input, client_mutation_id: clientMutationId }),
    }),

  finalizePreview: (roundId: string) =>
    request<{ items: PreviewRow[]; groups: Record<string, PreviewRow[]> }>(
      `/rounds/${roundId}/finalize-preview`,
    ),

  finalize: (roundId: string) =>
    request<{ ok: boolean }>(`/rounds/${roundId}/finalize`, { method: 'POST' }),

  reopen: (roundId: string) =>
    request<{ ok: boolean }>(`/rounds/${roundId}/reopen`, { method: 'POST' }),

  setAttendance: (roundId: string, playerId: string, status: string, note?: string) =>
    request<{ id: string; status: string; source: string }>(
      `/rounds/${roundId}/attendance/${playerId}`,
      { method: 'PUT', body: JSON.stringify({ status, note }) },
    ),

  recalculate: (competitionId: string) =>
    request<{ ok: boolean }>(`/competitions/${competitionId}/recalculate`, { method: 'POST' }),

  players: (search?: string) =>
    request<{ items: AdminPlayer[] }>(
      `/admin/players${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ).then((r) => r.items),

  archivePlayer: (id: string) =>
    request<{ ok: boolean }>(`/admin/players/${id}/archive`, { method: 'POST' }),

  player: (id: string) => request<PlayerDetail>(`/admin/players/${id}`),

  createPlayer: (input: NewPlayer) =>
    request<{ id: string; display_name: string }>('/admin/players', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// ---------------------------------------------------------------- tournaments, agenda, moderation

export type DrawPreview = {
  ok: boolean;
  seed: number;
  messages: string[];
  teams: { team_no: number; players: { id: string; display_name: string }[] }[];
  reserves: { id: string; display_name: string; reason: string }[];
};

export type AdminAgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  is_published: boolean;
};

export type QueueItem = {
  subject_type: string;
  subject_id: string;
  preview: string;
  created_at: string;
};

export type ReportItem = {
  id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  status: string;
  created_at: string;
};

export const tournaments = {
  create: (input: {
    name: string;
    played_on: string;
    location?: string | null;
    match_system: string;
    formation_category: string;
  }) =>
    request<{ id: string; name: string; status: string }>('/tournaments', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  detail: (id: string) =>
    request<{
      tournament: Tournament & { draw_seed: number | null };
      teams: { id: string; team_no: number; players: string | null }[];
      matches: {
        id: string;
        bracket: string;
        round_no: number;
        match_no: number;
        poule_no: number | null;
        status: string;
        red_no: number | null;
        white_no: number | null;
        eersten_red: number | null;
        eersten_white: number | null;
        winner: 'red' | 'white' | 'draw' | null;
      }[];
    }>(`/tournaments/${id}`),

  /** Draws without persisting, so the wizard can re-draw freely. */
  preview: (id: string, seed: number, playerIds: string[]) =>
    request<DrawPreview>(`/tournaments/${id}/draw-preview`, {
      method: 'POST',
      body: JSON.stringify({ seed, player_ids: playerIds }),
    }),

  /** Publishes. The server re-runs the draw from the seed and rejects a mismatch. */
  publish: (
    id: string,
    seed: number,
    playerIds: string[],
    teams: { team_no: number; player_ids: string[] }[],
  ) =>
    request<{ seed: number; teams: number; matches: number; messages: string[] }>(
      `/tournaments/${id}/publish`,
      { method: 'POST', body: JSON.stringify({ seed, player_ids: playerIds, teams }) },
    ),
};

export const agendaAdmin = {
  list: () => request<{ items: AdminAgendaEvent[] }>('/admin/agenda').then((r) => r.items),

  create: (input: Partial<AdminAgendaEvent> & { title: string; starts_at: string }) =>
    request<{ id: string }>('/admin/agenda', { method: 'POST', body: JSON.stringify(input) }),

  update: (id: string, input: Partial<AdminAgendaEvent>) =>
    request<{ id: string }>(`/admin/agenda/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  remove: (id: string) => request<void>(`/admin/agenda/${id}`, { method: 'DELETE' }),
};

export const moderation = {
  queue: () => request<{ queue: QueueItem[]; reports: ReportItem[] }>('/moderation/queue'),

  act: (type: string, id: string, action: 'approve' | 'reject' | 'hide', reason?: string) =>
    request<{ id: string; moderation_status: string }>(`/moderation/${type}/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  resolveReport: (id: string, status: 'resolved' | 'dismissed') =>
    request<{ id: string }>(`/moderation/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
};

export const community = {
  createTopic: (categoryId: string, title: string, body: string) =>
    request<{ id: string; moderation_status: string }>('/forum/topics', {
      method: 'POST',
      body: JSON.stringify({ category_id: categoryId, title, body }),
    }),

  reply: (topicId: string, body: string, parentId?: string) =>
    request<{ id: string }>(`/forum/topics/${topicId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId }),
    }),

  like: (subjectType: string, subjectId: string) =>
    request<{ liked: boolean }>('/reactions', {
      method: 'POST',
      body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId }),
    }),

  vote: (pollId: string, optionId: string) =>
    request<{ voted: boolean; results: { option_id: string; label: string; votes: number }[] }>(
      `/polls/${pollId}/vote`,
      { method: 'POST', body: JSON.stringify({ option_id: optionId }) },
    ),

  report: (subjectType: string, subjectId: string, reason: string) =>
    request<{ ok: boolean }>('/reports', {
      method: 'POST',
      body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, reason }),
    }),
};

/** Dutch labels for the sport enums. Kept here so screens never show raw enum values. */
export const SYSTEM_LABELS: Record<string, string> = {
  knockout: 'Afvalsysteem',
  knockout_consolation: 'Afvalsysteem met herkansingsronde',
  poule: 'Poulesysteem',
  competition: 'Competitie',
  sneker: 'Snekertelling (verschillende maten)',
};

export const FORMATION_LABELS: Record<string, string> = {
  vrije_formatie: 'VF (Vrije formatie)',
  del: 'D.E.L. (Door elkaar loten)',
  pearke: 'Pearke (man + vrouw)',
  // Still in the database and still rendered if an older toernooi uses one, but no
  // longer offered when creating: the club's list is VF, D.E.L. and Pearke.
  del_abc: 'D.E.L. ABC',
  vrije_formatie_beperkt: 'Vrije formatie (beperkt)',
  twee_tegen_twee: '2 tegen 2',
};
