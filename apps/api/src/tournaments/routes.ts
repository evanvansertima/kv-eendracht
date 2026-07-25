import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  drawDel,
  drawDelAbc,
  drawPearke,
  drawTweeTegenTwee,
  generateKnockout,
  assignPoules,
  generatePouleSchedule,
  type DrawPlayer,
  type DrawResult,
  type DrawTeam,
} from '@kv/domain';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';

/**
 * Tournaments: create, draw, publish.
 *
 * The draw is where the seed-verification decision lives. The client draws for
 * interactivity, then posts the seed and the teams it produced; the server re-runs the
 * SAME pure function from that seed and refuses to publish on any difference. Both sides
 * import packages/domain, so the check is cheap and makes tournaments.draw_seed a fact
 * anyone can reproduce rather than an unverified claim.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

const MATCH_SYSTEMS = ['knockout', 'knockout_consolation', 'poule', 'competition', 'sneker'] as const;
const FORMATIONS = [
  'vrije_formatie',
  'del',
  'del_abc',
  'vrije_formatie_beperkt',
  'twee_tegen_twee',
  'pearke',
] as const;

/** Runs the formation draw the tournament is configured for. */
function runDraw(
  formation: (typeof FORMATIONS)[number],
  players: DrawPlayer[],
  seed: number,
  opts: { abcStrict?: boolean; pearkeMixedRequired?: boolean },
): DrawResult {
  switch (formation) {
    case 'del':
      return drawDel(players, seed);
    case 'del_abc':
      return drawDelAbc(players, seed, { strict: opts.abcStrict ?? true });
    case 'twee_tegen_twee':
      return drawTweeTegenTwee(players, seed);
    case 'pearke':
      return drawPearke(players, seed, { mixedRequired: opts.pearkeMixedRequired ?? true });
    default:
      // vrije_formatie and vrije_formatie_beperkt are entered by hand, not drawn.
      throw new HttpError(
        400,
        'Deze formatiecategorie wordt handmatig samengesteld en kan niet geloot worden.',
      );
  }
}

export function registerTournamentRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);
  const admin = requireRole('admin', 'super_admin');

  // ---------------------------------------------------------------- detail
  app.get('/v1/tournaments/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const t = await tx.query(
        `select id, name, description, played_on, location, match_system, formation_category,
                team_size, available_courts, status, visibility, draw_seed, draw_published_at,
                third_place_match, consolation_mode
           from public.tournaments where id = $1`,
        [id],
      );
      if (!t.rows[0]) throw new HttpError(404, 'Toernooi niet gevonden.');

      const teams = await tx.query(
        `select tm.id, tm.team_no, tm.name, tm.poule_no, tm.bracket, tm.is_bye,
                (select string_agg(p.display_name, ', ' order by p.display_name)
                   from public.team_members m
                   join public.v_players_public p on p.id = m.player_id
                  where m.team_id = tm.id) as players
           from public.teams tm where tm.tournament_id = $1 order by tm.team_no`,
        [id],
      );

      const matches = await tx.query(
        `select m.id, m.bracket, m.round_no, m.match_no, m.poule_no, m.court, m.status,
                tr.team_no as red_no, tw.team_no as white_no,
                mr.eersten_red, mr.eersten_white, mr.winner
           from public.matches m
           left join public.teams tr on tr.id = m.team_red_id
           left join public.teams tw on tw.id = m.team_white_id
           left join public.match_results mr on mr.match_id = m.id
          where m.tournament_id = $1
          order by m.bracket, m.round_no, m.match_no`,
        [id],
      );

      return { tournament: t.rows[0], teams: teams.rows, matches: matches.rows };
    }, req.claims);
  });

  // ---------------------------------------------------------------- create
  app.post('/v1/tournaments', { preHandler: admin }, async (req, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(3, 'Geef het toernooi een naam van minimaal 3 tekens.').max(120),
        played_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik het formaat JJJJ-MM-DD.'),
        location: z.string().max(120).nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        match_system: z.enum(MATCH_SYSTEMS),
        formation_category: z.enum(FORMATIONS),
        available_courts: z.number().int().positive().max(20).optional(),
        third_place_match: z.boolean().optional(),
        abc_strict: z.boolean().optional(),
        pearke_mixed_required: z.boolean().optional(),
      })
      .parse(req.body);

    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.tournaments
           (name, played_on, location, description, match_system, formation_category,
            available_courts, third_place_match, abc_strict, pearke_mixed_required, status)
         values ($1,$2,$3,$4,$5,$6, coalesce($7,2), coalesce($8,false),
                 coalesce($9,true), coalesce($10,true), 'draft')
         returning id, name, status`,
        [
          body.name, body.played_on, body.location ?? null, body.description ?? null,
          body.match_system, body.formation_category, body.available_courts ?? null,
          body.third_place_match ?? null, body.abc_strict ?? null,
          body.pearke_mixed_required ?? null,
        ],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  // ---------------------------------------------------------------- preview
  //
  // Draws without persisting anything, so the wizard can show a result and re-draw
  // freely. Identical maths to publish; only the writing differs.
  app.post('/v1/tournaments/:id/draw-preview', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ seed: z.number().int(), player_ids: z.array(uuid).min(2) }).parse(req.body);

    return db(async (tx) => {
      const t = await tx.query<{
        formation_category: (typeof FORMATIONS)[number];
        abc_strict: boolean;
        pearke_mixed_required: boolean;
      }>(
        'select formation_category, abc_strict, pearke_mixed_required from public.tournaments where id = $1',
        [id],
      );
      if (!t.rows[0]) throw new HttpError(404, 'Toernooi niet gevonden.');

      const players = await loadPlayers(tx, body.player_ids);
      const result = runDraw(t.rows[0].formation_category, players, body.seed, {
        abcStrict: t.rows[0].abc_strict,
        pearkeMixedRequired: t.rows[0].pearke_mixed_required,
      });

      return {
        ok: result.ok,
        seed: body.seed,
        messages: result.messages,
        teams: result.teams.map((team) => ({
          team_no: team.teamNo,
          players: team.players.map((p) => ({ id: p.id, display_name: p.displayName })),
        })),
        reserves: result.reserves.map((r) => ({
          id: r.player.id,
          display_name: r.player.displayName,
          reason: r.reason,
        })),
      };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- publish
  app.post('/v1/tournaments/:id/publish', { preHandler: admin }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        seed: z.number().int(),
        player_ids: z.array(uuid).min(2),
        teams: z
          .array(z.object({ team_no: z.number().int().positive(), player_ids: z.array(uuid) }))
          .optional(),
      })
      .parse(req.body);

    const published = await db(async (tx) => {
      const t = await tx.query<{
        id: string;
        status: string;
        match_system: (typeof MATCH_SYSTEMS)[number];
        formation_category: (typeof FORMATIONS)[number];
        abc_strict: boolean;
        pearke_mixed_required: boolean;
        third_place_match: boolean;
        consolation_mode: string | null;
      }>(
        `select id, status, match_system, formation_category, abc_strict,
                pearke_mixed_required, third_place_match, consolation_mode
           from public.tournaments where id = $1`,
        [id],
      );
      const tour = t.rows[0];
      if (!tour) throw new HttpError(404, 'Toernooi niet gevonden.');
      if (tour.status !== 'draft') throw new HttpError(409, 'Dit toernooi is al gepubliceerd.');

      const players = await loadPlayers(tx, body.player_ids);
      const result = runDraw(tour.formation_category, players, body.seed, {
        abcStrict: tour.abc_strict,
        pearkeMixedRequired: tour.pearke_mixed_required,
      });
      if (!result.ok) throw new HttpError(400, result.messages[0] ?? 'Loting niet mogelijk.');

      // Verification: the client's claim must match what this seed actually produces.
      if (body.teams) {
        const norm = (t2: { team_no: number; player_ids: string[] }[]) =>
          JSON.stringify(
            [...t2].sort((a, b) => a.team_no - b.team_no).map((x) => [x.team_no, [...x.player_ids].sort()]),
          );
        const mine = norm(
          result.teams.map((x) => ({ team_no: x.teamNo, player_ids: x.players.map((p) => p.id) })),
        );
        if (norm(body.teams) !== mine) {
          throw new HttpError(
            409,
            'De loting komt niet overeen met de seed. Loot opnieuw en probeer het nog eens.',
          );
        }
      }

      // Persist parturen.
      const idByTeamNo = new Map<number, string>();
      for (const team of result.teams) {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.teams (tournament_id, team_no, name) values ($1,$2,$3) returning id`,
          [id, team.teamNo, `Partuur ${team.teamNo}`],
        );
        idByTeamNo.set(team.teamNo, rows[0]!.id);
        for (const p of team.players) {
          await tx.query(
            `insert into public.team_members (team_id, player_id, role) values ($1,$2,'speler')`,
            [rows[0]!.id, p.id],
          );
        }
      }

      const matchCount = await generateMatches(tx, id, tour, result.teams, idByTeamNo, body.seed);

      await tx.query(
        `update public.tournaments
            set status = 'published', draw_seed = $2,
                draw_published_at = now(), draw_published_by = auth.uid()
          where id = $1`,
        [id, body.seed],
      );

      return {
        seed: body.seed,
        teams: result.teams.length,
        matches: matchCount,
        reserves: result.reserves.map((r) => ({
          display_name: r.player.displayName,
          reason: r.reason,
        })),
        messages: result.messages,
      };
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return published;
  });
}

// ---------------------------------------------------------------- helpers

type Tx = Parameters<Parameters<typeof withRls>[2]>[0];

async function loadPlayers(tx: Tx, ids: string[]): Promise<DrawPlayer[]> {
  const { rows } = await tx.query<{
    id: string;
    display_name: string;
    skill_level: 'A' | 'B' | 'C' | null;
    gender: 'dame' | 'heer' | 'anders' | null;
  }>(
    `select id, display_name, skill_level, gender
       from public.v_players_public where id = any($1::uuid[]) order by display_name`,
    [ids],
  );
  if (rows.length !== ids.length) {
    throw new HttpError(400, 'Niet alle geselecteerde spelers bestaan.');
  }
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    skillLevel: r.skill_level,
    gender: r.gender,
  }));
}

/**
 * Generates the partijen for the tournament's match system.
 *
 * Knockout brackets keep their next_match_id links so apply_match_result can advance the
 * winner without the client telling it where to go.
 */
async function generateMatches(
  tx: Tx,
  tournamentId: string,
  tour: { match_system: string; third_place_match: boolean },
  teams: DrawTeam[],
  idByTeamNo: Map<number, string>,
  seed: number,
): Promise<number> {
  if (tour.match_system === 'poule') {
    // One poule per 8 parturen by default, honouring the KNKB maximum.
    const assignment = assignPoules(
      teams,
      { pouleCount: Math.max(1, Math.ceil(teams.length / 8)), maxTeams: 8 },
      seed,
    );
    if (!assignment.ok) throw new HttpError(400, assignment.messages[0] ?? 'Poule-indeling niet mogelijk.');

    const schedule = generatePouleSchedule(assignment.poules);
    let n = 0;
    for (const m of schedule) {
      n += 1;
      await tx.query(
        `insert into public.matches
           (tournament_id, poule_no, round_no, match_no, team_red_id, team_white_id, status)
         values ($1,$2,$3,$4,$5,$6,'scheduled')`,
        [
          tournamentId,
          m.pouleNo,
          m.roundNo,
          m.matchNo,
          idByTeamNo.get(m.redTeamNo),
          idByTeamNo.get(m.whiteTeamNo),
        ],
      );
    }
    return n;
  }

  // knockout, knockout_consolation, sneker round 1 and competition all start as a
  // straight bracket; the differences appear in later rounds.
  const bracket = generateKnockout(teams, {
    thirdPlaceMatch: tour.third_place_match,
    withConsolation: tour.match_system === 'knockout_consolation',
  });
  if (bracket.matches.length === 0) {
    throw new HttpError(400, bracket.messages[0] ?? 'Schema niet mogelijk.');
  }

  // teamNo -1 marks a staand nummer (bye), which has no team row — hence null rather
  // than a lookup that would silently miss.
  const teamRef = (slot: { teamNo: number | null }) =>
    slot.teamNo != null && slot.teamNo >= 0 ? (idByTeamNo.get(slot.teamNo) ?? null) : null;

  // Two passes: insert every match first, so next_match_id can reference rows that exist.
  const dbIdByKey = new Map<string, string>();
  for (const m of bracket.matches) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.matches
         (tournament_id, bracket, round_no, match_no, team_red_id, team_white_id, status)
       values ($1,$2,$3,$4,$5,$6,'scheduled') returning id`,
      [tournamentId, m.bracket, m.roundNo, m.matchNo, teamRef(m.red), teamRef(m.white)],
    );
    dbIdByKey.set(m.key, rows[0]!.id);
  }

  // Winner and loser routing. Both matter: apply_match_result advances the winner along
  // next_match_id and drops first-round losers into the herkansing along
  // consolation_next_match_id, so a missing link silently strands a partuur.
  for (const m of bracket.matches) {
    if (!m.nextKey && !m.consolationKey) continue;
    await tx.query(
      `update public.matches
          set next_match_id = $2, next_slot = $3,
              consolation_next_match_id = $4, consolation_next_slot = $5
        where id = $1`,
      [
        dbIdByKey.get(m.key),
        m.nextKey ? (dbIdByKey.get(m.nextKey) ?? null) : null,
        m.nextSlot,
        m.consolationKey ? (dbIdByKey.get(m.consolationKey) ?? null) : null,
        m.consolationSlot,
      ],
    );
  }

  return bracket.matches.length;
}
