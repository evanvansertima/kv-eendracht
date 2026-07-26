import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { closePool } from '../db.ts';
import { databaseReachable } from './rls.helpers.ts';

/**
 * Wedstrijd flow, driven through the real routes with app.inject().
 *
 * Every test here corresponds to a bug that actually shipped and was caught by hand.
 * SQL-level tests cannot see these: they live in route guards, in the seed-verification
 * branch, and in which draw path publish chooses. A guard that rejects the wrong thing
 * is invisible to a policy test.
 *
 * Each test creates its own wedstrijd, so they neither depend on nor disturb seed data.
 */

let app: FastifyInstance;
let reachable = false;
let token = '';

/** Signs in as the seeded beheerder. */
async function login(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: 'beheer@kveendracht.nl', password: process.env.SEED_ADMIN_PASSWORD ?? 'kaatsen2026' },
  });
  if (res.statusCode !== 200) return '';
  return res.json<{ access_token: string }>().access_token;
}

function auth() {
  return { authorization: `Bearer ${token}` };
}

async function createWedstrijd(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/tournaments',
    headers: auth(),
    payload: {
      name: `Testwedstrijd ${Math.random().toString(36).slice(2, 8)}`,
      played_on: '2027-06-05',
      match_system: 'knockout',
      formation_category: 'del',
      ...overrides,
    },
  });
  return res.json<{ id: string }>().id;
}

async function playerIds(n: number): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/v1/players' });
  return res.json<{ items: { id: string }[] }>().items.slice(0, n).map((p) => p.id);
}

beforeAll(async () => {
  reachable = await databaseReachable();
  if (!reachable) {
    console.warn('Wedstrijd suite skipped: no database reachable.');
    return;
  }
  try {
    process.loadEnvFile(new URL('../../../../.env', import.meta.url).pathname);
  } catch {
    /* environment already supplied */
  }
  app = await buildApp(loadConfig(), { logger: false });
  token = await login();
  if (!token) {
    console.warn('Wedstrijd suite skipped: could not sign in as the seeded beheerder.');
    reachable = false;
  }
});

afterAll(async () => {
  if (app) await app.close();
  await closePool().catch(() => undefined);
});

describe('publish guard', () => {
  /**
   * The regression: opening the inschrijving sets status to 'published', and publish
   * used to require 'draft'. That made every wedstrijd with an inschrijving impossible
   * to draw — the entire flow — while every SQL policy still passed.
   */
  it('can still draw after the inschrijving has been opened', async () => {
    if (!reachable) return;
    const id = await createWedstrijd();
    const ids = await playerIds(8);

    const opened = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/open-registration`,
      headers: auth(),
      payload: { registration_deadline: '2027-06-04T20:00:00+02:00' },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json<{ status: string }>().status).toBe('published');

    const published = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload: { seed: 42, player_ids: ids },
    });
    expect(published.statusCode).toBe(201);
  });

  it('refuses a second publish', async () => {
    if (!reachable) return;
    const id = await createWedstrijd();
    const ids = await playerIds(8);
    const payload = { seed: 7, player_ids: ids };

    const first = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json<{ detail: string }>().detail).toContain('al geloot');
  });
});

describe('seed verification', () => {
  /** Teams that the seed does not produce, so the check has something to catch. */
  function bogusTeams(ids: string[]) {
    return [
      { team_no: 1, player_ids: [ids[0]!, ids[1]!] },
      { team_no: 2, player_ids: [ids[2]!, ids[3]!] },
      { team_no: 3, player_ids: [ids[4]!, ids[5]!] },
      { team_no: 4, player_ids: [ids[6]!, ids[7]!] },
    ];
  }

  it('rejects teams that the seed does not produce', async () => {
    if (!reachable) return;
    const id = await createWedstrijd();
    const ids = await playerIds(8);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload: { seed: 5, player_ids: ids, teams: bogusTeams(ids) },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ detail: string }>().detail).toContain('komt niet overeen met de seed');
  });

  it('accepts the same teams when flagged as manually adjusted, and records it', async () => {
    if (!reachable) return;
    const id = await createWedstrijd();
    const ids = await playerIds(8);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload: { seed: 5, player_ids: ids, teams: bogusTeams(ids), manually_adjusted: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ manually_adjusted: boolean }>().manually_adjusted).toBe(true);

    // The wedstrijd must say so, rather than showing a seed that no longer reproduces
    // the parturen.
    const detail = await app.inject({ method: 'GET', url: `/v1/tournaments/${id}` });
    expect(detail.json<{ tournament: { draw_manually_adjusted: boolean } }>().tournament
      .draw_manually_adjusted).toBe(true);
  });
});

describe('vrije formatie and pearke', () => {
  it('uses the registered parturen instead of drawing', async () => {
    if (!reachable) return;
    const id = await createWedstrijd({ formation_category: 'vrije_formatie' });
    const ids = await playerIds(6);

    await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/open-registration`,
      headers: auth(),
      payload: { registration_deadline: '2027-06-04T20:00:00+02:00' },
    });

    for (const group of [ids.slice(0, 3), ids.slice(3, 6)]) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/tournaments/${id}/register-partuur`,
        headers: auth(),
        payload: { player_ids: group },
      });
      expect(res.statusCode).toBe(201);
    }

    const published = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/publish`,
      headers: auth(),
      payload: { seed: 1, player_ids: ids },
    });
    expect(published.statusCode).toBe(201);

    const body = published.json<{ teams: number; messages: string[] }>();
    expect(body.teams).toBe(2);
    expect(body.messages.join(' ')).toContain('ingeschreven parturen overgenomen');
  });

  it('refuses a speler who is already in another partuur', async () => {
    if (!reachable) return;
    const id = await createWedstrijd({ formation_category: 'pearke' });
    const ids = await playerIds(4);

    await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/open-registration`,
      headers: auth(),
      payload: { registration_deadline: '2027-06-04T20:00:00+02:00' },
    });

    const first = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/register-partuur`,
      headers: auth(),
      payload: { player_ids: [ids[0]!, ids[1]!] },
    });
    expect(first.statusCode).toBe(201);

    const clash = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/register-partuur`,
      headers: auth(),
      payload: { player_ids: [ids[0]!, ids[2]!] },
    });
    expect(clash.statusCode).toBe(409);
    expect(clash.json<{ detail: string }>().detail).toContain('staat al ingeschreven');
  });

  it('refuses partuur registration on a D.E.L. wedstrijd', async () => {
    if (!reachable) return;
    const id = await createWedstrijd({ formation_category: 'del' });
    const ids = await playerIds(2);

    await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/open-registration`,
      headers: auth(),
      payload: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/register-partuur`,
      headers: auth(),
      payload: { player_ids: ids },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ detail: string }>().detail).toContain('individueel');
  });
});

describe('authorisation', () => {
  it('refuses creating a wedstrijd without a token', async () => {
    if (!reachable) return;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tournaments',
      payload: {
        name: 'Zonder token',
        played_on: '2027-06-05',
        match_system: 'knockout',
        formation_category: 'del',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('keeps the overview readable without a token', async () => {
    if (!reachable) return;
    const res = await app.inject({ method: 'GET', url: '/v1/tournaments/overview' });
    expect(res.statusCode).toBe(200);
    // The static route must win over /v1/tournaments/:id, or this returns a 404 for a
    // wedstrijd named "overview".
    expect(res.json()).toHaveProperty('komend');
  });
});

describe('validation', () => {
  it('rejects a date that is not JJJJ-MM-DD', async () => {
    if (!reachable) return;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tournaments',
      headers: auth(),
      payload: {
        name: 'Verkeerde datum',
        played_on: '05-06-2027',
        match_system: 'knockout',
        formation_category: 'del',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a partuur of one', async () => {
    if (!reachable) return;
    const id = await createWedstrijd({ formation_category: 'vrije_formatie' });
    const ids = await playerIds(1);
    await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/open-registration`,
      headers: auth(),
      payload: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tournaments/${id}/register-partuur`,
      headers: auth(),
      payload: { player_ids: ids },
    });
    expect(res.statusCode).toBe(400);
  });
});
