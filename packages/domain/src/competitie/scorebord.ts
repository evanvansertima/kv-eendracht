/**
 * LIVE scorebord — the rules of a kaats partij as a state machine.
 *
 * This lives in the domain rather than in component state for the same reason the draw
 * logic does: it is intricate, it must be testable without a screen, and getting it
 * wrong at the side of a pitch is expensive.
 *
 * Punten ladder within one eerst:  0 → 2 → 4 → 6 → eerst gewonnen, terug naar 0.
 * A partij is won at six eersten.
 *
 * Two rules make the notation unusual and are handled here rather than in the UI:
 *
 * 1. A finished partij is never written as six eersten. The winning eerst is written as
 *    punten instead — "5 eersten + 6 punten" — see formatUitslag in uitslag.ts.
 * 2. At five eersten each and six punten each ("alles aan de hang") the next point
 *    decides the whole partij, and is written as 8 rather than another 6.
 */

import { MAX_EERSTEN, ALLES_AAN_DE_HANG_PUNTEN, isAllesAanDeHang } from './uitslag.ts';

export type Side = 'red' | 'white';

/** Punten within one eerst. The next point after 6 wins the eerst. */
const LADDER = [0, 2, 4, 6] as const;

export interface LogEntry {
  /** Milliseconds since the partij started, so a log can be replayed. */
  atMs: number;
  action:
    | 'punt'
    | 'eerst'
    | 'kaats-geplaatst'
    | 'kaats-verwijderd'
    | 'wissel'
    | 'partij-gewonnen'
    | 'ongedaan';
  side?: Side;
  /** Human-readable Dutch summary, ready for the logboek. */
  text: string;
  eerstenRed: number;
  eerstenWhite: number;
  puntenRed: number;
  puntenWhite: number;
}

export interface ScorebordState {
  eerstenRed: number;
  eerstenWhite: number;
  puntenRed: number;
  puntenWhite: number;
  /** Which partuur is serving. The lowest team number starts (red). */
  opslag: Side;
  /** 1e kaats is drawn white, 2e kaats red. Placed and removed by hand. */
  kaats1: boolean;
  kaats2: boolean;
  /**
   * A wissel has happened and the next point clears the 1e kaats.
   *
   * The 2e kaats survives that point and stays visible until it has itself been played.
   */
  clearFirstOnNextPoint: boolean;
  finished: boolean;
  winner: Side | null;
  /** Set on the first point; null until then, which is what starts the timer. */
  startedAtMs: number | null;
  log: LogEntry[];
}

export function createScorebord(opslag: Side = 'red'): ScorebordState {
  return {
    eerstenRed: 0,
    eerstenWhite: 0,
    puntenRed: 0,
    puntenWhite: 0,
    opslag,
    kaats1: false,
    kaats2: false,
    clearFirstOnNextPoint: false,
    finished: false,
    winner: null,
    startedAtMs: null,
    log: [],
  };
}

/**
 * Punten as they should be displayed for a side.
 *
 * Normally the ladder value. At alles aan de hang the deciding point is written as 8,
 * so a reader can tell at a glance that this point ends the partij.
 */
export function displayPunten(state: ScorebordState, side: Side): number {
  const punten = side === 'red' ? state.puntenRed : state.puntenWhite;
  return punten;
}

/** True when the next point decides the whole partij. */
export function isDecidingPoint(state: ScorebordState): boolean {
  return isAllesAanDeHang(
    state.eerstenRed,
    state.eerstenWhite,
    state.puntenRed,
    state.puntenWhite,
  );
}

function nextPunten(current: number): number | 'eerst' {
  const i = LADDER.indexOf(current as (typeof LADDER)[number]);
  // Anything off the ladder (including the 8 shown at alles aan de hang) wins the eerst.
  if (i === -1 || i === LADDER.length - 1) return 'eerst';
  return LADDER[i + 1]!;
}

function entry(
  state: ScorebordState,
  atMs: number,
  action: LogEntry['action'],
  text: string,
  side?: Side,
): LogEntry {
  return {
    atMs: state.startedAtMs === null ? 0 : atMs - state.startedAtMs,
    action,
    side,
    text,
    eerstenRed: state.eerstenRed,
    eerstenWhite: state.eerstenWhite,
    puntenRed: state.puntenRed,
    puntenWhite: state.puntenWhite,
  };
}

const NAAM: Record<Side, string> = { red: 'Rood', white: 'Wit' };

/**
 * Awards a point to a side.
 *
 * Returns a new state; the input is never mutated, so the previous state can be kept
 * for undo.
 */
export function awardPoint(state: ScorebordState, side: Side, atMs: number): ScorebordState {
  if (state.finished) return state;

  const next: ScorebordState = {
    ...state,
    log: [...state.log],
    // The timer starts on the first point, not when the screen opens.
    startedAtMs: state.startedAtMs ?? atMs,
  };

  const deciding = isDecidingPoint(state);
  const current = side === 'red' ? next.puntenRed : next.puntenWhite;
  const outcome = nextPunten(current);

  if (outcome === 'eerst') {
    // The eerst is won. Punten reset and both kaatsen disappear.
    if (side === 'red') next.eerstenRed += 1;
    else next.eerstenWhite += 1;
    next.puntenRed = 0;
    next.puntenWhite = 0;
    next.kaats1 = false;
    next.kaats2 = false;
    next.clearFirstOnNextPoint = false;

    next.log.push(
      entry(
        next,
        atMs,
        'eerst',
        deciding
          ? `${NAAM[side]} wint het beslissende eerst (${ALLES_AAN_DE_HANG_PUNTEN} punten)`
          : `${NAAM[side]} wint een eerst`,
        side,
      ),
    );

    const eersten = side === 'red' ? next.eerstenRed : next.eerstenWhite;
    if (eersten >= MAX_EERSTEN) {
      next.finished = true;
      next.winner = side;
      next.log.push(entry(next, atMs, 'partij-gewonnen', `${NAAM[side]} wint de partij`, side));
    }
    return next;
  }

  // An ordinary point.
  if (side === 'red') next.puntenRed = outcome;
  else next.puntenWhite = outcome;

  // A wissel promised by an earlier kaats takes effect now: the 1e kaats is played and
  // disappears, while the 2e kaats stays until it has itself been played.
  if (next.clearFirstOnNextPoint) {
    next.kaats1 = false;
    next.clearFirstOnNextPoint = false;
  }

  next.log.push(entry(next, atMs, 'punt', `${NAAM[side]} scoort een punt`, side));

  // Wissel: one kaats placed and a side now standing on six punten.
  if (next.kaats1 && !next.kaats2 && (next.puntenRed === 6 || next.puntenWhite === 6)) {
    return applyWissel(next, atMs);
  }

  return next;
}

/** Swaps opslag and uitslaan, and arms the 1e kaats to clear on the next point. */
function applyWissel(state: ScorebordState, atMs: number): ScorebordState {
  const next: ScorebordState = {
    ...state,
    opslag: state.opslag === 'red' ? 'white' : 'red',
    clearFirstOnNextPoint: true,
    log: [...state.log],
  };
  next.log.push(
    entry(next, atMs, 'wissel', `Wissel: ${NAAM[next.opslag]} aan de opslag`),
  );
  return next;
}

/**
 * Places the next kaats.
 *
 * The 2e kaats can only follow the 1e — placing it first is not a legal state, so the
 * call is ignored rather than silently reordered.
 */
export function placeKaats(state: ScorebordState, atMs: number): ScorebordState {
  if (state.finished) return state;
  if (state.kaats1 && state.kaats2) return state;

  let next: ScorebordState = { ...state, log: [...state.log] };

  if (!next.kaats1) {
    next.kaats1 = true;
    next.log.push(entry(next, atMs, 'kaats-geplaatst', '1e kaats geplaatst'));
  } else {
    next.kaats2 = true;
    next.log.push(entry(next, atMs, 'kaats-geplaatst', '2e kaats geplaatst'));
  }

  // Two kaatsen on the field means a wissel, regardless of the score.
  if (next.kaats1 && next.kaats2) {
    next = applyWissel(next, atMs);
  } else if (next.puntenRed === 6 || next.puntenWhite === 6) {
    // One kaats with a side on six punten also means a wissel.
    next = applyWissel(next, atMs);
  }

  return next;
}

/** Removes the most recently placed kaats. Does not affect the score. */
export function removeKaats(state: ScorebordState, atMs: number): ScorebordState {
  if (state.finished) return state;
  if (!state.kaats1 && !state.kaats2) return state;

  const next: ScorebordState = { ...state, log: [...state.log] };
  if (next.kaats2) {
    next.kaats2 = false;
    next.log.push(entry(next, atMs, 'kaats-verwijderd', '2e kaats verwijderd'));
  } else {
    next.kaats1 = false;
    next.clearFirstOnNextPoint = false;
    next.log.push(entry(next, atMs, 'kaats-verwijderd', '1e kaats verwijderd'));
  }
  return next;
}

/** Elapsed milliseconds, or 0 before the first point. */
export function elapsedMs(state: ScorebordState, nowMs: number): number {
  return state.startedAtMs === null ? 0 : Math.max(0, nowMs - state.startedAtMs);
}

/** mm:ss, or h:mm:ss once a partij passes an hour. */
export function formatKlok(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The eersten as they should be shown, mid-partij or finished. */
export function scoreLabel(state: ScorebordState): string {
  return `${state.eerstenRed}-${state.eerstenWhite}`;
}
