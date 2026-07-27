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
  generateOmloopSchema,
  drawSnekerMaten,
  type DrawPlayer,
  type DrawResult,
  type DrawTeam,
} from '@kv/domain';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireAuth, requireRole, HttpError } from '../auth/middleware.ts';
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
                draw_manually_adjusted, registration_deadline,
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
        /**
         * Inleggeld in cents. Omit or send null for gratis.
         *
         * Cents, not euros: money in a float eventually produces a total a cent out
         * that cannot be explained to a penningmeester.
         */
        inleggeld_cents: z.number().int().min(0).max(100_000).nullable().optional(),
        /** Only meaningful when there is an inleggeld to pay. */
        betaling_verplicht: z.boolean().optional(),
      })
      .parse(req.body);

    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.tournaments
           (name, played_on, location, description, match_system, formation_category,
            available_courts, third_place_match, abc_strict, pearke_mixed_required,
            inleggeld_cents, betaling_verplicht, status)
         values ($1,$2,$3,$4,$5,$6, coalesce($7,2), coalesce($8,false),
                 coalesce($9,true), coalesce($10,true), $11, coalesce($12,false), 'draft')
         returning id, name, status, inleggeld_cents`,
        [
          body.name, body.played_on, body.location ?? null, body.description ?? null,
          body.match_system, body.formation_category, body.available_courts ?? null,
          body.third_place_match ?? null, body.abc_strict ?? null,
          body.pearke_mixed_required ?? null,
          body.inleggeld_cents ?? null, body.betaling_verplicht ?? null,
        ],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  // ---------------------------------------------------------------- overview
  //
  // Upcoming and finished wedstrijden in one call, so the list screen needs no
  // client-side date arithmetic to decide which section a row belongs in.
  app.get('/v1/tournaments/overview', async (req) =>
    db(async (tx) => {
      const { rows } = await tx.query(`
        select t.id, t.name, t.played_on, t.location, t.match_system, t.formation_category,
               t.status, t.registration_opens_at, t.registration_deadline,
               t.draw_published_at,
               public.registration_is_open(t.id) as registration_open,
               (select count(*) from public.tournament_registrations r
                 where r.tournament_id = t.id and r.status <> 'withdrawn') as registered,
               (select count(*) from public.teams tm where tm.tournament_id = t.id) as team_count,
               case
                 when t.status in ('finished','cancelled') then 'afgelopen'
                 when t.played_on is not null and t.played_on < current_date then 'afgelopen'
                 else 'komend'
               end as periode
          from public.tournaments t
         order by t.played_on desc nulls last
      `);
      return {
        komend: rows.filter((r) => r.periode === 'komend'),
        afgelopen: rows.filter((r) => r.periode === 'afgelopen'),
      };
    }, req.claims).catch(translateDbError),
  );

  // ---------------------------------------------------------------- registration
  app.get('/v1/tournaments/:id/registrations', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      // Names and levels from the public view: a participant list is public, contact
      // details are not.
      const { rows } = await tx.query(
        `select r.id, r.player_id, r.status, r.created_at, r.partuur_group,
                p.display_name, p.skill_level, p.gender
           from public.tournament_registrations r
           join public.v_players_public p on p.id = r.player_id
          where r.tournament_id = $1 and r.status <> 'withdrawn'
          order by r.partuur_group nulls last, p.skill_level nulls last, p.display_name`,
        [id],
      );
      const { rows: open } = await tx.query<{ open: boolean }>(
        'select public.registration_is_open($1) as open',
        [id],
      );
      // Grouped A / B / C, which is how stap 3 presents a D.E.L. field.
      const byLevel: Record<string, typeof rows> = { A: [], B: [], C: [], onbekend: [] };
      for (const r of rows) (byLevel[r.skill_level ?? 'onbekend'] ??= []).push(r);

      // Parturen for Vrije Formatie and Pearke, where spelers register together.
      const parturen: { group: string; players: typeof rows }[] = [];
      const byGroup = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!r.partuur_group) continue;
        const list = byGroup.get(r.partuur_group) ?? [];
        list.push(r);
        byGroup.set(r.partuur_group, list);
      }
      for (const [group, players] of byGroup) parturen.push({ group, players });

      const mode = await tx.query<{ partuur: boolean }>(
        'select public.registers_as_partuur($1) as partuur',
        [id],
      );

      return {
        items: rows,
        byLevel,
        parturen,
        registers_as_partuur: mode.rows[0]?.partuur ?? false,
        registration_open: open[0]?.open ?? false,
      };
    }, req.claims).catch(translateDbError);
  });

  /** Sets the registration window and publishes the wedstrijd so people can sign up. */
  app.post('/v1/tournaments/:id/open-registration', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        registration_opens_at: z.string().datetime({ offset: true }).nullable().optional(),
        registration_deadline: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(req.body ?? {});

    return db(async (tx) => {
      const { rows } = await tx.query(
        `update public.tournaments
            set status = case when status = 'draft' then 'published' else status end,
                registration_opens_at = $2,
                registration_deadline = $3
          where id = $1 and draw_published_at is null
          returning id, status, registration_opens_at, registration_deadline`,
        [id, body.registration_opens_at ?? null, body.registration_deadline ?? null],
      );
      if (!rows[0]) {
        throw new HttpError(409, 'Deze wedstrijd is al geloot; inschrijven kan niet meer.');
      }
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  /** A participant signs themselves up. RLS decides whether they may. */
  app.post('/v1/tournaments/:id/register', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);

    const created = await db(async (tx) => {
      const me = await tx.query<{ my_player_id: string | null }>(
        'select public.my_player_id() as my_player_id',
      );
      const playerId = me.rows[0]?.my_player_id;
      if (!playerId) {
        throw new HttpError(
          409,
          'Je account is nog niet gekoppeld aan een spelersprofiel. Vraag de beheerder om je te koppelen.',
        );
      }

      const { rows } = await tx.query(
        `insert into public.tournament_registrations (tournament_id, player_id, status)
         values ($1, $2, 'registered')
         on conflict (tournament_id, player_id)
           do update set status = 'registered'
         returning id, status`,
        [id, playerId],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  /** Withdraw. Recorded rather than deleted, so the list keeps its history. */
  app.post('/v1/tournaments/:id/withdraw', { preHandler: requireAuth }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const { rows } = await tx.query(
        `update public.tournament_registrations r
            set status = 'withdrawn'
          where r.tournament_id = $1 and r.player_id = public.my_player_id()
          returning r.id`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, 'Je bent niet ingeschreven voor deze wedstrijd.');
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  /**
   * Registers a complete partuur, for Vrije Formatie and Pearke.
   *
   * The spelers share a partuur_group, so the list can show them together and the
   * loting can use them as-is rather than drawing.
   */
  app.post('/v1/tournaments/:id/register-partuur', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        player_ids: z
          .array(uuid)
          .min(2, 'Een partuur bestaat uit minimaal 2 spelers.')
          .max(3, 'Een partuur bestaat uit maximaal 3 spelers.'),
      })
      .parse(req.body);

    if (new Set(body.player_ids).size !== body.player_ids.length) {
      throw new HttpError(400, 'Dezelfde speler staat twee keer in dit partuur.');
    }

    const created = await db(async (tx) => {
      const check = await tx.query<{ partuur: boolean; open: boolean }>(
        `select public.registers_as_partuur($1) as partuur,
                public.registration_is_open($1) as open`,
        [id],
      );
      if (!check.rows[0]?.partuur) {
        throw new HttpError(
          409,
          'Bij deze wedstrijd schrijf je je individueel in; de parturen worden geloot.',
        );
      }
      if (!check.rows[0].open) {
        throw new HttpError(409, 'De inschrijving voor deze wedstrijd is gesloten.');
      }

      // A speler already on the list cannot appear in a second partuur. The unique
      // constraint would catch it, but naming who is clearer than a bare conflict.
      const existing = await tx.query<{ display_name: string }>(
        `select p.display_name from public.tournament_registrations r
           join public.v_players_public p on p.id = r.player_id
          where r.tournament_id = $1 and r.player_id = any($2::uuid[])
            and r.status <> 'withdrawn'`,
        [id, body.player_ids],
      );
      if (existing.rows.length > 0) {
        throw new HttpError(
          409,
          `${existing.rows.map((r) => r.display_name).join(', ')} staat al ingeschreven.`,
        );
      }

      const group = await tx.query<{ id: string }>('select gen_random_uuid() as id');
      const groupId = group.rows[0]!.id;

      for (const playerId of body.player_ids) {
        await tx.query(
          `insert into public.tournament_registrations
             (tournament_id, player_id, status, partuur_group)
           values ($1, $2, 'registered', $3)`,
          [id, playerId, groupId],
        );
      }

      return { partuur_group: groupId, players: body.player_ids.length };
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  /** An admin adds someone who cannot or will not sign up themselves. */
  app.post('/v1/tournaments/:id/registrations', { preHandler: admin }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ player_ids: z.array(uuid).min(1) }).parse(req.body);

    const added = await db(async (tx) => {
      let n = 0;
      for (const playerId of body.player_ids) {
        const { rowCount } = await tx.query(
          `insert into public.tournament_registrations (tournament_id, player_id, status)
           values ($1, $2, 'registered')
           on conflict (tournament_id, player_id) do update set status = 'registered'`,
          [id, playerId],
        );
        n += rowCount ?? 0;
      }
      return { added: n };
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return added;
  });

  /** Links a login to a player record, which is what makes self-registration possible. */
  app.post('/v1/admin/players/:id/link', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ profile_id: uuid.nullable() }).parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query(
        'update public.player_profiles set profile_id = $2 where id = $1 returning id, profile_id',
        [id, body.profile_id],
      );
      if (!rows[0]) throw new HttpError(404, 'Speler niet gevonden.');
      return rows[0];
    }, req.claims).catch(translateDbError);
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
        /**
         * Set when the beheerder moved spelers after the loting.
         *
         * Seed verification is skipped for these, because a hand-edited draw is by
         * definition not what the seed produces. The flag is stored so the wedstrijd
         * says so rather than presenting a seed that no longer reproduces the parturen.
         */
        manually_adjusted: z.boolean().optional(),
      })
      .parse(req.body);

    const published = await db(async (tx) => {
      const t = await tx.query<{
        id: string;
        status: string;
        draw_published_at: string | null;
        match_system: (typeof MATCH_SYSTEMS)[number];
        formation_category: (typeof FORMATIONS)[number];
        abc_strict: boolean;
        pearke_mixed_required: boolean;
        third_place_match: boolean;
        consolation_mode: string | null;
      }>(
        `select id, status, draw_published_at, match_system, formation_category,
                abc_strict, pearke_mixed_required, third_place_match, consolation_mode
           from public.tournaments where id = $1`,
        [id],
      );
      const tour = t.rows[0];
      if (!tour) throw new HttpError(404, 'Toernooi niet gevonden.');
      // Guard on whether it has been DRAWN, not on status.
      //
      // Opening the inschrijving already moves status to 'published' — that is what
      // makes the wedstrijd visible to register for. Checking status here meant every
      // wedstrijd with an inschrijving became impossible to draw, which is the entire
      // flow. draw_published_at is the fact that actually matters.
      if (tour.draw_published_at !== null) {
        throw new HttpError(409, 'Deze wedstrijd is al geloot.');
      }

      const players = await loadPlayers(tx, body.player_ids);

      // Vrije Formatie and Pearke are not drawn: the parturen arrive already formed
      // through registration, so publishing reads them back rather than inventing an
      // arrangement the club did not choose.
      const preformed = await tx.query<{ partuur_group: string; player_id: string }>(
        `select partuur_group, player_id from public.tournament_registrations
          where tournament_id = $1 and partuur_group is not null and status <> 'withdrawn'
          order by partuur_group, player_id`,
        [id],
      );

      let result: DrawResult;
      if (preformed.rows.length > 0) {
        const byGroup = new Map<string, DrawPlayer[]>();
        for (const row of preformed.rows) {
          const player = players.find((p) => p.id === row.player_id);
          if (!player) continue;
          const list = byGroup.get(row.partuur_group) ?? [];
          list.push(player);
          byGroup.set(row.partuur_group, list);
        }
        result = {
          ok: byGroup.size > 0,
          teams: [...byGroup.values()].map((ps, i) => ({ teamNo: i + 1, players: ps })),
          reserves: [],
          messages: [`${byGroup.size} ingeschreven parturen overgenomen.`],
          seed: body.seed,
        };
      } else {
        result = runDraw(tour.formation_category, players, body.seed, {
          abcStrict: tour.abc_strict,
          pearkeMixedRequired: tour.pearke_mixed_required,
        });
      }
      if (!result.ok) throw new HttpError(400, result.messages[0] ?? 'Loting niet mogelijk.');

      // Verification: the client's claim must match what this seed actually produces.
      //
      // Skipped for an adjusted draw — the whole point of a manual change is that the
      // parturen differ from the seed. The flag below records that, so the wedstrijd
      // never shows a seed that pretends to reproduce them.
      if (body.teams && !body.manually_adjusted) {
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

      // An adjusted draw persists what the beheerder actually arranged; an untouched
      // one persists the verified server-side result. Using `result.teams` for both
      // would silently discard every manual change.
      const teamsToPersist =
        body.manually_adjusted && body.teams
          ? body.teams.map((x) => ({
              teamNo: x.team_no,
              players: x.player_ids.map((pid) => {
                const found = players.find((p) => p.id === pid);
                if (!found) throw new HttpError(400, 'Een speler in de indeling bestaat niet.');
                return found;
              }),
            }))
          : result.teams;

      // Persist parturen.
      //
      // Snekertelling is the exception: its parturen are re-drawn every omloop, so the
      // formation draw only establishes WHO takes part. Writing its single set here too
      // would collide with the per-omloop rows on
      // uq_teams_no_per_tournament_bracket — generateMatches owns team creation for
      // that system.
      const idByTeamNo = new Map<number, string>();
      if (tour.match_system !== 'sneker') {
        for (const team of teamsToPersist) {
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
      }

      const matchCount = await generateMatches(tx, id, tour, teamsToPersist, idByTeamNo, body.seed);

      await tx.query(
        `update public.tournaments
            set status = 'published', draw_seed = $2,
                draw_manually_adjusted = $3,
                draw_published_at = now(), draw_published_by = auth.uid()
          where id = $1`,
        [id, body.seed, body.manually_adjusted ?? false],
      );

      return {
        seed: body.seed,
        manually_adjusted: body.manually_adjusted ?? false,
        teams: teamsToPersist.length,
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

  // Snekertelling: three speelrondes, each a different combination, never two of the
  // same maten in one partuur. All three rondes are persisted up front — unlike the
  // doorschuif, they do not depend on results.
  if (tour.match_system === 'sneker') {
    const sneker = drawSnekerMaten(
      teams.flatMap((t2) => t2.players),
      seed,
    );
    if (!sneker.ok) throw new HttpError(400, sneker.messages[0] ?? 'Snekerloting niet mogelijk.');

    // The parturen differ per omloop, so each omloop gets its own teams rows rather
    // than reusing the ones the formation draw produced.
    //
    // team_no is offset per omloop because uq_teams_no_per_tournament_bracket is unique
    // on (tournament_id, bracket, team_no) — reusing 1..n each omloop collides on the
    // second one. The name carries the omloop, so the display stays readable.
    const perRonde = sneker.rounds[0]?.teams.length ?? 0;
    let total = 0;
    for (const ronde of sneker.rounds) {
      const idByNo = new Map<number, string>();
      for (const team of ronde.teams) {
        const teamNo = (ronde.roundNo - 1) * perRonde + team.teamNo;
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.teams (tournament_id, team_no, name)
           values ($1, $2, $3) returning id`,
          [tournamentId, teamNo, `Omloop ${ronde.roundNo} · partuur ${team.teamNo}`],
        );
        idByNo.set(teamNo, rows[0]!.id);
        for (const p of team.players) {
          await tx.query(
            `insert into public.team_members (team_id, player_id, role) values ($1,$2,'speler')`,
            [rows[0]!.id, p.id],
          );
        }
      }

      const nos = [...idByNo.keys()].sort((x, y) => x - y);
      for (let i = 0; i + 1 < nos.length; i += 2) {
        total += 1;
        await tx.query(
          `insert into public.matches
             (tournament_id, bracket, round_no, match_no, sneker_round,
              team_red_id, team_white_id, status)
           values ($1,'main',$2,$3,$2,$4,$5,'scheduled')`,
          [
            tournamentId,
            ronde.roundNo,
            Math.floor(i / 2) + 1,
            idByNo.get(nos[i]!),
            idByNo.get(nos[i + 1]!),
          ],
        );
      }
    }
    return total;
  }

  // Plain afvalsysteem uses the club's doorschuif, not a seeded power-of-two bracket.
  //
  // Only the FIRST omloop is persisted. In a doorschuif the composition of omloop 2
  // depends on every result of omloop 1 — the staand nummer moves to the top, shifting
  // all the pairings — so there is nothing stable to pre-link next_match_id to. Later
  // omlopen are derived from results instead, which is also what lets a corrected
  // uitslag reshape the rest of the schema rather than leaving a stale bracket behind.
  if (tour.match_system === 'knockout') {
    const schema = generateOmloopSchema(teams.map((t2) => t2.teamNo));
    const omloop1 = schema.omlopen[0];
    if (!omloop1) throw new HttpError(400, schema.messages[0] ?? 'Schema niet mogelijk.');

    for (const p of omloop1.partijen) {
      await tx.query(
        `insert into public.matches
           (tournament_id, bracket, round_no, match_no, team_red_id, team_white_id, status)
         values ($1,'main',1,$2,$3,$4,'scheduled')`,
        [tournamentId, p.matchNo, idByTeamNo.get(p.redTeamNo), idByTeamNo.get(p.whiteTeamNo)],
      );
    }
    return omloop1.partijen.length;
  }

  // knockout_consolation keeps the seeded bracket: a herkansing needs the loser routing
  // that next_match_id and consolation_next_match_id provide.
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
