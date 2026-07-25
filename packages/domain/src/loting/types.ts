/** Gedeelde typen voor alle lotingsvormen. */

export type SkillLevel = 'A' | 'B' | 'C';
export type Gender = 'dame' | 'heer' | 'anders';

export interface DrawPlayer {
  id: string;
  displayName: string;
  skillLevel?: SkillLevel | null;
  gender?: Gender | null;
}

export interface DrawTeam {
  /** Wedstrijdnummer; laagste nummer begint aan de opslag. */
  teamNo: number;
  players: DrawPlayer[];
}

export interface ReserveEntry {
  player: DrawPlayer;
  /** Nederlandstalige uitleg waarom deze speler reserve staat. */
  reason: string;
}

export interface DrawResult {
  ok: boolean;
  teams: DrawTeam[];
  reserves: ReserveEntry[];
  /** Nederlandstalige melding bij problemen of bijzonderheden. */
  messages: string[];
  seed: number;
}
