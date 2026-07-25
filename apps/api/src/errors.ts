import { HttpError } from './auth/middleware.ts';

/**
 * Translates Postgres errors into Dutch messages suitable for direct display.
 *
 * The RPCs already raise Dutch text — `Geen rechten om uitslagen in te voeren`,
 * `Alleen beheerders mogen standen herberekenen`. Those messages are the project's
 * vocabulary and are surfaced as-is rather than replaced with a second, competing set
 * written here.
 *
 * What this adds is the cases Postgres reports structurally rather than in prose:
 * constraint violations, which otherwise reach the user as raw SQL noise.
 */

type PgError = {
  code?: string;
  message?: string;
  constraint?: string;
  detail?: string;
  table?: string;
};

/** Constraint name -> what a club volunteer needs to be told. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  match_results_match_id_key: 'Voor deze partij is al een uitslag ingevoerd.',
  match_results_client_mutation_id_key: 'Deze uitslag is al verwerkt.',
  attendance_round_id_player_id_key:
    'Deze speler is al geregistreerd voor deze speelavond.',
  competition_rounds_competition_id_round_no_key:
    'Er bestaat al een speelavond met dit nummer.',
  poll_votes_poll_id_user_id_key: 'Je hebt al gestemd in deze peiling.',
  reactions_user_id_subject_type_subject_id_key: 'Je hebt hier al op gereageerd.',
  competition_players_competition_id_player_id_key:
    'Deze speler doet al mee aan deze competitie.',
};

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'Deze gegevens bestaan al.',
  '23503': 'De verwijzing bestaat niet (meer).',
  '23514': 'De ingevoerde waarden zijn niet toegestaan.',
  '23502': 'Niet alle verplichte velden zijn ingevuld.',
  '22P02': 'Ongeldige invoer.',
  // insufficient_privilege — RLS refused the row. Deliberately vague: telling the caller
  // which row exists but is forbidden is itself a disclosure.
  '42501': 'Je hebt geen rechten voor deze actie.',
};

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Use as `.catch(translateDbError)` on a database call.
 *
 * Always throws; the return type is `never` so TypeScript keeps narrowing correctly at
 * the call site.
 */
export function translateDbError(err: unknown): never {
  // Our own HttpErrors already carry a Dutch message and the right status.
  if (err instanceof HttpError) throw err;

  if (isPgError(err)) {
    if (err.constraint && CONSTRAINT_MESSAGES[err.constraint]) {
      throw new HttpError(409, CONSTRAINT_MESSAGES[err.constraint]!);
    }

    // raise_exception (P0001) is a deliberate message from one of our own RPCs. It is
    // already written in Dutch for the user, so pass it through unchanged.
    if (err.code === 'P0001' && err.message) {
      throw new HttpError(403, err.message);
    }

    if (err.code && CODE_MESSAGES[err.code]) {
      const status = err.code === '42501' ? 403 : 409;
      throw new HttpError(status, CODE_MESSAGES[err.code]!);
    }
  }

  // Anything unrecognised is a server fault. Rethrow so the global handler logs the
  // detail and returns a generic message — a raw Postgres error can carry table names
  // and query fragments, which do not belong in a client response.
  throw err;
}
