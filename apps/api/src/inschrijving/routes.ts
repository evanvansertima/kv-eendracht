import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { withRls, type Claims } from '../db.ts';
import { requireRole, HttpError } from '../auth/middleware.ts';
import { translateDbError } from '../errors.ts';
import {
  createPaymentProvider,
  BETAALSTATUS_LABEL,
  type BetaalStatus,
  TestPaymentProvider,
} from '../payments/provider.ts';

/**
 * Inschrijven voor een wedstrijd, plus the payment that may go with it.
 *
 * A registration is a whole partuur submitted by one aanmelder, who is often not one of
 * the players — a parent, or the partuur captain. Their contact details belong to the
 * registration, not to any player record.
 *
 * Two mechanisms stop duplicates, because there are two distinct ways to create one:
 *
 *   1. `idempotency_key`, generated once per form session. A refresh, a double-tap, or a
 *      back-button return replays the same key and gets the same registration back
 *      instead of a second partuur.
 *   2. `betaling_referentie` is unique. A webhook delivered twice, or a return URL
 *      opened twice, resolves to one row and is applied once.
 */

const uuid = z.string().uuid('Ongeldige verwijzing.');

/** How many spelers a partuur holds, per formatiecategorie. */
export const PARTUUR_GROOTTE: Record<string, number> = {
  vrije_formatie: 3,
  vrije_formatie_beperkt: 3,
  del: 1, // Individual entry; the loting forms the parturen later.
  del_abc: 1,
  twee_tegen_twee: 2,
  pearke: 2,
};

const spelerSchema = z.object({
  /** An existing player, when chosen from the database. */
  player_id: uuid.nullable().optional(),
  /** Otherwise a name, so a guest can be entered without a player record. */
  naam: z.string().trim().min(2, 'Vul een naam in.').max(80).nullable().optional(),
});

export function registerInschrijvingRoutes(app: FastifyInstance, config: Config): void {
  const db = <T>(fn: Parameters<typeof withRls<T>>[2], claims: Claims | null) =>
    withRls(config.DATABASE_URL, claims, fn);
  const admin = requireRole('admin', 'super_admin');
  const staff = requireRole('moderator', 'admin', 'super_admin');

  const payments = createPaymentProvider(config.PAYMENT_PROVIDER, {
    apiKey: config.WEEZTIX_API_KEY,
    publicUrl: config.PUBLIC_API_URL,
  });

  // ---------------------------------------------------------------- inschrijven
  app.post('/v1/tournaments/:id/inschrijven', async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z
      .object({
        idempotency_key: uuid,
        spelers: z.array(spelerSchema).min(1, 'Voeg minimaal één speler toe.').max(3),
        aanmelder_naam: z.string().trim().min(2, 'Vul je naam in.').max(80),
        aanmelder_email: z.string().email('Vul een geldig e-mailadres in.').max(160),
        aanmelder_telefoon: z.string().trim().min(6, 'Vul een telefoonnummer in.').max(40),
      })
      .parse(req.body);

    // No claims: registering is open to anyone, including a partuur from another
    // vereniging with no account. The RPC is SECURITY DEFINER and validates the
    // wedstrijd, the open inschrijving, the partuur size and the aanmelder itself —
    // widening the insert policy instead would have opened every registration and the
    // whole player database to anonymous writes.
    const result = await withRls(config.DATABASE_URL, null, async (tx) => {
      const { rows } = await tx.query<{ partuur_group: string; was_duplicate: boolean }>(
        'select * from public.inschrijven_wedstrijd($1,$2,$3::jsonb,$4,$5,$6)',
        [
          id,
          body.idempotency_key,
          JSON.stringify(body.spelers),
          body.aanmelder_naam,
          body.aanmelder_email,
          body.aanmelder_telefoon,
        ],
      );
      const row = rows[0]!;

      const t = await tx.query<{
        name: string;
        inleggeld_cents: number | null;
        betaling_verplicht: boolean;
      }>(
        'select name, inleggeld_cents, betaling_verplicht from public.tournaments where id = $1',
        [id],
      );

      return {
        partuur_group: row.partuur_group,
        duplicate: row.was_duplicate,
        betaalstatus: 'unpaid' as BetaalStatus,
        wedstrijd: t.rows[0] ?? null,
      };
    }).catch(translateDbError);

    // Gratis, or payment not required: the registration is complete as it stands.
    const wedstrijd = 'wedstrijd' in result ? result.wedstrijd : null;
    const inleggeld = wedstrijd?.inleggeld_cents ?? null;

    if (result.duplicate || !wedstrijd || inleggeld === null || inleggeld === 0) {
      reply.status(result.duplicate ? 200 : 201);
      return {
        partuur_group: result.partuur_group,
        betaalstatus: result.betaalstatus,
        betaalstatus_label: BETAALSTATUS_LABEL[result.betaalstatus],
        checkout_url: null,
        duplicate: result.duplicate,
      };
    }

    // Start a hosted checkout. The webhook decides the outcome, not this call.
    const checkout = await payments.createCheckout({
      reference: result.partuur_group,
      amountCents: inleggeld,
      description: `Inleggeld ${wedstrijd.name}`,
      returnUrl: `${config.PUBLIC_APP_URL}/inschrijving/${result.partuur_group}`,
      aanmelderNaam: body.aanmelder_naam,
      aanmelderEmail: body.aanmelder_email,
    });

    // Definer function, for the same reason as the registration itself: this request
    // has no session, and a policy-filtered UPDATE would match zero rows and report
    // success — leaving the registration unpaid with no reference, which makes every
    // later webhook unmatchable.
    await withRls(config.DATABASE_URL, null, async (tx) => {
      await tx.query('select public.koppel_betaling($1,$2,$3)', [
        result.partuur_group,
        checkout.providerReference,
        inleggeld,
      ]);
    }).catch(translateDbError);

    reply.status(201);
    return {
      partuur_group: result.partuur_group,
      betaalstatus: 'pending' as BetaalStatus,
      betaalstatus_label: BETAALSTATUS_LABEL.pending,
      checkout_url: checkout.checkoutUrl,
      duplicate: false,
    };
  });

  // ---------------------------------------------------------------- bevestiging
  app.get('/v1/inschrijving/:group', async (req) => {
    const { group } = z.object({ group: uuid }).parse(req.params);

    // No claims: the aanmelder follows the link from their confirmation e-mail and has
    // no account. The definer function returns exactly one registration by its group id,
    // which is an unguessable uuid.
    return withRls(config.DATABASE_URL, null, async (tx) => {
      const { rows } = await tx.query('select * from public.inschrijving_bevestiging($1)', [
        group,
      ]);
      const r = rows[0];
      if (!r) throw new HttpError(404, 'Inschrijving niet gevonden.');

      return {
        ...r,
        betaalstatus_label: BETAALSTATUS_LABEL[r.betaalstatus as BetaalStatus],
      };
    }).catch(translateDbError);
  });

  // ---------------------------------------------------------------- webhook
  //
  // Authoritative. The return URL only tells the user something; this decides.
  app.post('/v1/betaling/webhook', async (req, reply) => {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const parsed = payments.parseWebhook(raw, req.headers);
    let applied = true;

    if (!parsed) {
      // Unverifiable: ignore it. Anything else turns this into an endpoint for marking
      // arbitrary registrations paid.
      reply.status(400);
      return { ok: false };
    }

    // No claims: a webhook has no user session. The UPDATE policy requires is_admin(),
    // so a direct update would be filtered to zero rows and fail silently. The
    // SECURITY DEFINER function is the narrow, audited path for exactly this.
    await withRls(config.DATABASE_URL, null, async (tx) => {
      const { rows } = await tx.query<{ apply_betaalstatus: number }>(
        'select public.apply_betaalstatus($1, $2::public.betaalstatus)',
        [parsed.providerReference, parsed.status],
      );
      // Zero rows means the reference matches no registration. Reporting ok would hide
      // a provider misconfiguration, or a forged call, behind a success.
      if (rows[0]?.apply_betaalstatus === 0) {
        app.log.warn({ ref: parsed.providerReference }, 'webhook zonder bijbehorende inschrijving');
        applied = false;
      }
    }).catch((err) => {
      applied = false;
      app.log.error({ err, ref: parsed.providerReference }, 'betaalstatus niet toegepast');
    });

    if (!applied) {
      reply.status(404);
      return { ok: false, reason: 'onbekende betalingsreferentie' };
    }
    return { ok: true };
  });

  // ---------------------------------------------------------------- test checkout
  //
  // Stands in for the provider's hosted page until Weeztix credentials exist. Registered
  // only for the test provider, so it cannot exist in production.
  if (payments instanceof TestPaymentProvider) {
    app.get('/v1/betaling/test-checkout', async (req, reply) => {
      const q = z
        .object({
          ref: z.string(),
          amount: z.string(),
          description: z.string(),
          return_url: z.string(),
        })
        .parse(req.query);

      const euro = (Number(q.amount) / 100).toFixed(2).replace('.', ',');
      const btn = (status: string, label: string, colour: string) =>
        `<form method="post" action="/v1/betaling/test-afronden" style="display:inline">
           <input type="hidden" name="ref" value="${q.ref}">
           <input type="hidden" name="status" value="${status}">
           <input type="hidden" name="return_url" value="${q.return_url}">
           <button style="background:${colour};color:#fff;border:0;padding:14px 20px;
             border-radius:8px;font:600 15px system-ui;margin-right:8px;cursor:pointer">
             ${label}</button>
         </form>`;

      reply.type('text/html');
      return `<!doctype html><meta charset="utf-8">
        <title>Testbetaling</title>
        <div style="font:15px/1.5 system-ui;max-width:420px;margin:60px auto;padding:0 20px">
          <p style="color:#8A5A00;background:#FDF0D6;padding:10px;border-radius:8px">
            Testomgeving — dit is geen echte betaling.</p>
          <h1 style="font-size:20px">${q.description}</h1>
          <p style="font-size:28px;font-weight:700">€ ${euro}</p>
          ${btn('paid', 'Betaling slagen', '#22A06B')}
          ${btn('failed', 'Betaling mislukken', '#E5484D')}
          ${btn('pending', 'In behandeling laten', '#5B6E88')}
        </div>`;
    });

    app.post('/v1/betaling/test-afronden', async (req, reply) => {
      const body = z
        .object({ ref: z.string(), status: z.string(), return_url: z.string() })
        .parse(req.body);

      payments.setStatus(body.ref, body.status as BetaalStatus);

      // Deliver a webhook exactly as the real provider would, so the code path that runs
      // in production is the one being exercised here.
      await app.inject({
        method: 'POST',
        url: '/v1/betaling/webhook',
        payload: { reference: body.ref, status: body.status },
      });

      reply.redirect(body.return_url, 303);
    });
  }

  // ---------------------------------------------------------------- deelnemerslijst
  app.get('/v1/tournaments/:id/deelnemers', { preHandler: staff }, async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);

    return db(async (tx) => {
      const { rows } = await tx.query(
        `select r.id, r.partuur_group, r.player_id, r.status, r.betaalstatus,
                r.betaald_cents, r.bevestigd_op, r.created_at,
                r.aanmelder_naam, r.aanmelder_email, r.aanmelder_telefoon,
                p.display_name as speler, p.skill_level
           from public.tournament_registrations r
           join public.v_players_public p on p.id = r.player_id
          where r.tournament_id = $1
          order by r.created_at, p.display_name`,
        [id],
      );

      // Grouped into parturen, which is the unit a beheerder actually works with.
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = row.partuur_group ?? row.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }

      return {
        parturen: [...groups.entries()].map(([group, leden]) => ({
          partuur_group: group,
          spelers: leden.map((l) => ({
            registration_id: l.id,
            player_id: l.player_id,
            naam: l.speler,
            niveau: l.skill_level,
          })),
          aanmelder_naam: leden[0]!.aanmelder_naam,
          aanmelder_email: leden[0]!.aanmelder_email,
          aanmelder_telefoon: leden[0]!.aanmelder_telefoon,
          ingeschreven_op: leden[0]!.created_at,
          betaalstatus: leden[0]!.betaalstatus,
          betaalstatus_label: BETAALSTATUS_LABEL[leden[0]!.betaalstatus as BetaalStatus],
          betaald_cents: leden[0]!.betaald_cents,
          bevestigd: leden[0]!.bevestigd_op !== null,
          status: leden[0]!.status,
        })),
      };
    }, req.claims).catch(translateDbError);
  });

  // ---------------------------------------------------------------- beheer
  app.patch('/v1/inschrijving/:group', { preHandler: admin }, async (req) => {
    const { group } = z.object({ group: uuid }).parse(req.params);
    const body = z
      .object({
        betaalstatus: z
          .enum(['unpaid', 'pending', 'paid', 'failed', 'refunded'])
          .optional(),
        status: z.enum(['registered', 'waitlist', 'reserve', 'withdrawn']).optional(),
        bevestigd: z.boolean().optional(),
      })
      .parse(req.body);

    return db(async (tx) => {
      if (body.betaalstatus) {
        await tx.query(
          `update public.tournament_registrations
              set betaalstatus = $2::public.betaalstatus,
                  betaald_op = case when $2 = 'paid' then coalesce(betaald_op, now()) else betaald_op end
            where partuur_group = $1`,
          [group, body.betaalstatus],
        );
      }
      if (body.status) {
        await tx.query(
          'update public.tournament_registrations set status = $2 where partuur_group = $1',
          [group, body.status],
        );
      }
      if (body.bevestigd !== undefined) {
        await tx.query(
          `update public.tournament_registrations
              set bevestigd_op = case when $2 then now() else null end
            where partuur_group = $1`,
          [group, body.bevestigd],
        );
      }
      return { ok: true };
    }, req.claims).catch(translateDbError);
  });

  app.delete('/v1/inschrijving/:group', { preHandler: admin }, async (req, reply) => {
    const { group } = z.object({ group: uuid }).parse(req.params);
    await db(async (tx) => {
      const { rowCount } = await tx.query(
        'delete from public.tournament_registrations where partuur_group = $1',
        [group],
      );
      if (!rowCount) throw new HttpError(404, 'Inschrijving niet gevonden.');
    }, req.claims).catch(translateDbError);

    reply.status(204);
    return null;
  });

  /** Moves one speler to another partuur, or out of the wedstrijd entirely. */
  app.patch('/v1/inschrijving/speler/:registrationId', { preHandler: admin }, async (req) => {
    const { registrationId } = z.object({ registrationId: uuid }).parse(req.params);
    const body = z.object({ naar_partuur_group: uuid.nullable() }).parse(req.body);

    return db(async (tx) => {
      const { rows } = await tx.query(
        `update public.tournament_registrations
            set partuur_group = coalesce($2, gen_random_uuid())
          where id = $1 returning partuur_group`,
        [registrationId, body.naar_partuur_group],
      );
      if (!rows[0]) throw new HttpError(404, 'Speler niet gevonden in deze inschrijving.');
      return rows[0];
    }, req.claims).catch(translateDbError);
  });
}
