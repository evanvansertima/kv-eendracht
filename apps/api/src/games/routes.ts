import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { drawDel } from '@kv/domain';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireAuth, requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';

/**
 * Games: match nights, results, attendance, standings and players.
 *
 * These handlers are deliberately thin. The sport logic already exists as SECURITY
 * DEFINER functions written and tested in v1 — apply_match_result advances the bracket
 * and marks attendance, finalize_round marks absences and recalculates. Reimplementing
 * any of that here would duplicate transactional guarantees that belong in the database.
 *
 * So the job is: authorise, validate, call the RPC, translate the error. Nothing else.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

const resultSchema = z.object({
  eersten_red: z.number().int().min(0).max(6),
  eersten_white: z.number().int().min(0).max(6),
  winner: z.enum(['red', 'white', 'draw']).nullable().optional(),
  points_last_eerst: z.string().max(16).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // Required, not optional. This is what makes a retry safe after the connection drops
  // at the side of a pitch; without it a resend could double-count.
  client_mutation_id: uuid,
});

const attendanceSchema = z.object({
  status: z.enum(['present', 'absent', 'excused', 'injured', 'guest']),
  note: z.string().max(200).nullable().optional(),
});

export function registerGameRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);

  const staff = requireRole('moderator', 'admin', 'super_admin');
  const admin = requireRole('admin', 'super_admin');

  // ---------------------------------------------------------------- competitions
  app.get('/v1/competitions', async (req) =>
    db(async (tx) => {
      const { rows } = await tx.query(
        `select c.id, c.name, c.category, c.starts_on, c.ends_on, c.status, c.visibility,
                s.name as season_name,
                (select count(*) from public.competition_players cp
                  where cp.competition_id = c.id and cp.is_active) as player_count
           from public.competitions c
           left join public.seasons s on s.id = c.season_id
          order by c.starts_on desc nulls last`,
      );
      return { items: rows };
    }, req.claims),
  );

  // ---------------------------------------------------------------- rounds
  app.get('/v1/competitions/:id/rounds', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const { rows } = await tx.query(
        `select r.id, r.round_no, r.played_on, r.status, r.finalized_at,
                (select count(*) from public.matches m where m.competition_round_id = r.id)
                  as match_count,
                (select count(*) from public.matches m
                   join public.match_results mr on mr.match_id = m.id
                  where m.competition_round_id = r.id) as result_count
           from public.competition_rounds r
          where r.competition_id = $1
          order by r.round_no desc`,
        [id],
      );
      return { items: rows };
    }, req.claims);
  });

  app.post('/v1/competitions/:id/rounds', { preHandler: admin }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        round_no: z.number().int().positive().optional(),
        played_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gebruik het formaat JJJJ-MM-DD.'),
      })
      .parse(req.body);

    const created = await db(async (tx) => {
      // Default to the next number rather than making the caller compute it; the unique
      // constraint on (competition_id, round_no) is still the real guard.
      const { rows } = await tx.query<{ id: string; round_no: number }>(
        `insert into public.competition_rounds (competition_id, round_no, played_on)
         values ($1, coalesce($2, (
           select coalesce(max(round_no), 0) + 1
             from public.competition_rounds where competition_id = $1
         )), $3)
         returning id, round_no`,
        [id, body.round_no ?? null, body.played_on],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  app.get('/v1/rounds/:id', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const round = await tx.query(
        `select r.id, r.competition_id, r.round_no, r.played_on, r.status, r.finalized_at,
                c.name as competition_name
           from public.competition_rounds r
           join public.competitions c on c.id = r.competition_id
          where r.id = $1`,
        [id],
      );
      if (!round.rows[0]) throw new HttpError(404, 'Speelavond niet gevonden.');

      // Teams are folded into each match so the score screen needs one request. Player
      // names come from v_players_public, never player_profiles: that view omits phone,
      // email and admin_notes.
      const matches = await tx.query(
        `select m.id, m.match_no, m.court, m.status,
                m.team_red_id, m.team_white_id,
                tr.team_no as red_no, tw.team_no as white_no,
                (select string_agg(p.display_name, ', ' order by p.display_name)
                   from public.team_members tm
                   join public.v_players_public p on p.id = tm.player_id
                  where tm.team_id = m.team_red_id) as red_players,
                (select string_agg(p.display_name, ', ' order by p.display_name)
                   from public.team_members tm
                   join public.v_players_public p on p.id = tm.player_id
                  where tm.team_id = m.team_white_id) as white_players,
                mr.eersten_red, mr.eersten_white, mr.winner, mr.note
           from public.matches m
           left join public.teams tr on tr.id = m.team_red_id
           left join public.teams tw on tw.id = m.team_white_id
           left join public.match_results mr on mr.match_id = m.id
          where m.competition_round_id = $1
          order by m.match_no`,
        [id],
      );

      return { round: round.rows[0], matches: matches.rows };
    }, req.claims);
  });

  // ---------------------------------------------------------------- draw
  //
  // Forms parturen for a match night and generates the partijen.
  //
  // The client draws for interactivity (preview, opnieuw loten) and posts the seed with
  // the teams it produced. The server re-runs the SAME pure function from that seed and
  // refuses to publish if the result differs. Both sides import packages/domain, so this
  // is a cheap equality check that turns the stored seed from an unverified claim into a
  // fact: anyone can later reproduce exactly this draw.
  app.post('/v1/rounds/:id/draw', { preHandler: admin }, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        seed: z.number().int(),
        player_ids: z.array(uuid).min(4, 'Er zijn minimaal 4 spelers nodig.'),
        // What the client believes the draw produced. Optional: omit it to let the
        // server draw authoritatively (used by tests and any non-interactive caller).
        teams: z
          .array(z.object({ team_no: z.number().int().positive(), player_ids: z.array(uuid) }))
          .optional(),
      })
      .parse(req.body);

    const published = await db(async (tx) => {
      const round = await tx.query<{ id: string; status: string }>(
        'select id, status from public.competition_rounds where id = $1',
        [id],
      );
      if (!round.rows[0]) throw new HttpError(404, 'Speelavond niet gevonden.');
      if (round.rows[0].status !== 'open') {
        throw new HttpError(409, 'Deze speelavond is al afgerond.');
      }

      const existing = await tx.query('select 1 from public.matches where competition_round_id = $1', [id]);
      if (existing.rowCount) {
        throw new HttpError(409, 'Voor deze speelavond is al geloot.');
      }

      // Names come from the public view; a draw needs no contact details.
      const { rows: players } = await tx.query<{ id: string; display_name: string }>(
        `select id, display_name from public.v_players_public
          where id = any($1::uuid[]) order by display_name`,
        [body.player_ids],
      );
      if (players.length !== body.player_ids.length) {
        throw new HttpError(400, 'Niet alle geselecteerde spelers bestaan.');
      }

      const result = drawDel(
        players.map((p) => ({ id: p.id, displayName: p.display_name })),
        body.seed,
      );
      if (!result.ok) {
        throw new HttpError(400, result.messages[0] ?? 'Loting niet mogelijk.');
      }

      // Verification. Compare the server's draw with the client's claim, ignoring
      // ordering within a partuur since that carries no meaning.
      if (body.teams) {
        const norm = (t: { team_no: number; player_ids: string[] }[]) =>
          JSON.stringify(
            [...t]
              .sort((a, b) => a.team_no - b.team_no)
              .map((x) => [x.team_no, [...x.player_ids].sort()]),
          );
        const mine = norm(
          result.teams.map((t) => ({ team_no: t.teamNo, player_ids: t.players.map((p) => p.id) })),
        );
        if (norm(body.teams) !== mine) {
          throw new HttpError(
            409,
            'De loting komt niet overeen met de seed. Loot opnieuw en probeer het nog eens.',
          );
        }
      }

      // Persist teams, members, and a round-robin of partijen. The lowest team number is
      // the red side and serves first — see docs/Domain/Kaatsen-glossarium.md.
      const teamIds: string[] = [];
      for (const team of result.teams) {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.teams (competition_round_id, team_no, name)
           values ($1, $2, $3) returning id`,
          [id, team.teamNo, `Partuur ${team.teamNo}`],
        );
        const teamId = rows[0]!.id;
        teamIds.push(teamId);
        for (const p of team.players) {
          await tx.query(
            `insert into public.team_members (team_id, player_id, role) values ($1,$2,'speler')`,
            [teamId, p.id],
          );
        }
      }

      let matchNo = 0;
      for (let i = 0; i < teamIds.length; i += 2) {
        if (!teamIds[i + 1]) break;
        matchNo += 1;
        await tx.query(
          `insert into public.matches
             (competition_round_id, match_no, team_red_id, team_white_id, status)
           values ($1, $2, $3, $4, 'scheduled')`,
          [id, matchNo, teamIds[i], teamIds[i + 1]],
        );
      }

      return {
        seed: body.seed,
        teams: result.teams.length,
        matches: matchNo,
        reserves: result.reserves.map((r) => ({ name: r.player.displayName, reason: r.reason })),
        messages: result.messages,
      };
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return published;
  });

  // ---------------------------------------------------------------- results
  //
  // The one endpoint the club touches every week.
  app.post('/v1/matches/:id/result', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = resultSchema.parse(req.body);

    // Derive the winner when the caller did not send one. 6 eersten wins; the database
    // CHECK constraints reject anything inconsistent regardless.
    const winner =
      body.winner ??
      (body.eersten_red > body.eersten_white
        ? 'red'
        : body.eersten_white > body.eersten_red
          ? 'white'
          : null);

    if (!winner) {
      throw new HttpError(400, 'Een partij kan niet in gelijkspel eindigen.');
    }

    return db(async (tx) => {
      const { rows } = await tx.query<{ apply_match_result: string }>(
        'select public.apply_match_result($1,$2,$3,$4,$5,$6,$7) as apply_match_result',
        [
          id,
          body.eersten_red,
          body.eersten_white,
          winner,
          body.points_last_eerst ?? null,
          body.note ?? null,
          body.client_mutation_id,
        ],
      );
      return { result_id: rows[0]!.apply_match_result, winner };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- attendance
  app.get('/v1/rounds/:id/finalize-preview', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      const { rows } = await tx.query(
        'select player_id, display_name, current_status from public.round_finalize_preview($1)',
        [id],
      );
      // Grouped the way the confirmation screen presents it, so the client does not
      // reimplement the categories.
      const groups: Record<string, typeof rows> = {};
      for (const row of rows) (groups[row.current_status] ??= []).push(row);
      return { items: rows, groups };
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/rounds/:id/finalize', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      await tx.query('select public.finalize_round($1)', [id]);
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/rounds/:id/reopen', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      // Removes only auto-generated absences; manual corrections survive, which is the
      // whole point of the source column.
      await tx.query('select public.reopen_round($1)', [id]);
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  app.put('/v1/rounds/:roundId/attendance/:playerId', { preHandler: staff }, async (req) => {
    const params = z.object({ roundId: uuid, playerId: uuid }).parse(req.params);
    const body = attendanceSchema.parse(req.body);

    return db(async (tx) => {
      // source='manual' is what protects this record from being overwritten by the
      // automatic marking in apply_match_result, and from removal on reopen.
      const { rows } = await tx.query(
        `insert into public.attendance (round_id, player_id, status, source, note)
         values ($1, $2, $3, 'manual', $4)
         on conflict (round_id, player_id)
         do update set status = excluded.status, source = 'manual', note = excluded.note
         returning id, status, source`,
        [params.roundId, params.playerId, body.status, body.note ?? null],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/competitions/:id/recalculate', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      await tx.query('select public.recalculate_standings($1)', [id]);
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- players
  app.get('/v1/admin/players', { preHandler: staff }, async (req) => {
    const q = z
      .object({ search: z.string().max(80).optional(), include_archived: z.string().optional() })
      .parse(req.query);

    return db(async (tx) => {
      // player_profiles, not the public view: staff legitimately need contact details,
      // and RLS is what decides whether this caller may see them.
      const { rows } = await tx.query(
        `select id, first_name, infix, last_name, display_name, birth_date, age_category,
                gender, skill_level, club, is_active, phone, email, archived_at
           from public.player_profiles
          where ($2::boolean or archived_at is null)
            and ($1::text is null or display_name ilike '%' || $1 || '%')
          order by last_name, first_name`,
        [q.search ?? null, q.include_archived === 'true'],
      );
      return { items: rows };
    }, req.claims).catch(translateDbError);
  });

  /** Player detail: profile, competition ranking and match history. */
  app.get('/v1/admin/players/:id', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);

    return db(async (tx) => {
      const profile = await tx.query(
        `select id, first_name, infix, last_name, display_name, birth_date, age_category,
                gender, skill_level, club, is_active, phone, email, admin_notes, archived_at,
                created_at
           from public.player_profiles where id = $1`,
        [id],
      );
      if (!profile.rows[0]) throw new HttpError(404, 'Speler niet gevonden.');

      // Ranking within the player's own group, matching how the public standings are
      // presented — a Dames player's position means her position among the dames.
      // The ranking must be computed over the whole group, THEN filtered to this
      // player. Filtering inside the same select would apply WHERE before the window
      // function — leaving a single row, which always ranks 1st. That is why this is
      // two CTEs rather than one.
      const ranking = await tx.query(
        `with base as (
           select s.player_id, s.eersten_voor, s.eersten_tegen, s.saldo, s.deelnames,
                  s.gespeeld, s.gewonnen, s.verloren,
                  case when p.gender = 'dame' then 'dames' else 'heren' end as groep,
                  c.name as competition_name
             from public.standings s
             join public.player_profiles p on p.id = s.player_id
             join public.competitions c on c.id = s.competition_id
         ),
         ranked as (
           select *,
                  row_number() over (
                    partition by groep
                    order by eersten_voor desc, eersten_tegen asc, saldo desc, deelnames desc
                  )::int as position,
                  count(*) over (partition by groep)::int as group_size
             from base
         )
         select * from ranked where player_id = $1`,
        [id],
      );

      // Every partij this player appeared in, newest first.
      //
      // Returns the player's OWN eersten rather than red/white: "6-4" says nothing
      // without knowing which side they were on, and the screen should not have to
      // work that out for itself.
      const matches = await tx.query(
        `select m.id, m.match_no, m.status,
                cr.round_no, cr.played_on,
                tour.name as tournament_name,
                t.team_no as own_team_no,
                case when m.team_red_id = t.id then mr.eersten_red else mr.eersten_white end
                  as eersten_voor,
                case when m.team_red_id = t.id then mr.eersten_white else mr.eersten_red end
                  as eersten_tegen,
                (mr.winner is not null
                 and mr.winner = case when m.team_red_id = t.id then 'red' else 'white' end)
                  as won,
                (mr.id is not null) as has_result
           from public.team_members tm
           join public.teams t on t.id = tm.team_id
           join public.matches m
             on m.team_red_id = t.id or m.team_white_id = t.id
           left join public.competition_rounds cr on cr.id = m.competition_round_id
           left join public.tournaments tour on tour.id = m.tournament_id
           left join public.match_results mr on mr.match_id = m.id
          where tm.player_id = $1
          order by cr.played_on desc nulls last, m.match_no desc`,
        [id],
      );

      return {
        player: profile.rows[0],
        ranking: ranking.rows[0] ?? null,
        matches: matches.rows,
      };
    }, req.claims).catch(translateDbError);
  });

  const playerSchema = z.object({
    first_name: z.string().trim().min(1, 'Voornaam is verplicht.').max(60),
    infix: z.string().trim().max(20).nullable().optional(),
    last_name: z.string().trim().min(1, 'Achternaam is verplicht.').max(80),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    age_category: z.string().max(40).nullable().optional(),
    gender: z.enum(['dame', 'heer', 'anders']).nullable().optional(),
    skill_level: z.enum(['A', 'B', 'C']).nullable().optional(),
    club: z.string().max(80).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email('Vul een geldig e-mailadres in.').nullable().optional(),
    is_active: z.boolean().optional(),
  });

  app.post('/v1/admin/players', { preHandler: admin }, async (req, reply) => {
    const body = playerSchema.parse(req.body);
    const created = await db(async (tx) => {
      const { rows } = await tx.query(
        `insert into public.player_profiles
           (first_name, infix, last_name, birth_date, age_category, gender, skill_level,
            club, phone, email, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11, true))
         returning id, display_name`,
        [
          body.first_name, body.infix ?? null, body.last_name, body.birth_date ?? null,
          body.age_category ?? null, body.gender ?? null, body.skill_level ?? null,
          body.club ?? null, body.phone ?? null, body.email ?? null, body.is_active ?? null,
        ],
      );
      return rows[0];
    }, req.claims).catch(translateDbError);

    reply.status(201);
    return created;
  });

  app.patch('/v1/admin/players/:id', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = playerSchema.partial().parse(req.body);

    const fields = Object.entries(body).filter(([, v]) => v !== undefined);
    if (fields.length === 0) throw new HttpError(400, 'Geen wijzigingen opgegeven.');

    return db(async (tx) => {
      const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await tx.query(
        `update public.player_profiles set ${sets} where id = $1 returning id, display_name`,
        [id, ...fields.map(([, v]) => v)],
      );
      if (!rows[0]) throw new HttpError(404, 'Speler niet gevonden.');
      return rows[0];
    }, req.claims).catch(translateDbError);
  });

  app.post('/v1/admin/players/:id/archive', { preHandler: admin }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return db(async (tx) => {
      // Archive, never delete: this player appears in historical results.
      const { rows } = await tx.query(
        `update public.player_profiles
            set archived_at = now(), is_active = false
          where id = $1 and archived_at is null
          returning id`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, 'Speler niet gevonden of al gearchiveerd.');
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  // Referenced by requireAuth so the import is used even if every route above is staff.
  void requireAuth;
}
