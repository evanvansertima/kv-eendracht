/**
 * API client. Replaces v1's src/lib/supabase.ts.
 *
 * Deliberately a thin typed fetch wrapper: the server owns authorization (RLS) and
 * Dutch error messaging, so the client's job is transport and nothing more.
 */

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    // Network-level failure: the server was never reached.
    throw new ApiError('Geen verbinding met de server.', 0);
  }

  if (!response.ok) {
    // The API speaks RFC 9457 problem+json with a Dutch `detail` meant for display.
    const problem = await response.json().catch(() => null);
    throw new ApiError(
      problem?.detail ?? 'Er ging iets mis. Probeer het later opnieuw.',
      response.status,
    );
  }

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

export const api = {
  health: () => request<{ status: string; database: string; latencyMs: number }>('/health'),
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
