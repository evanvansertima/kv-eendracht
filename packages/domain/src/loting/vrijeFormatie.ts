/**
 * Vrije Formatie (+ Beperkt) — spec §15/§16.
 * Beheerder stelt parturen samen; hier de validatielogica.
 */

import type { DrawPlayer, DrawTeam } from './types.ts';

export interface VfTeamInput {
  teamNo: number;
  name?: string;
  captainId?: string;
  players: DrawPlayer[];
}

export interface VfRestrictions {
  maxTeams?: number;
  minLevel?: 'A' | 'B' | 'C';
  maxLevel?: 'A' | 'B' | 'C';
  allowedAgeCategories?: string[];
  genderRule?: 'dames' | 'heren' | 'gemengd';
  invitationOnly?: boolean;
}

const LEVEL_ORDER = { A: 3, B: 2, C: 1 } as const;

/** Valideert vrije-formatieparturen; retourneert Nederlandstalige fouten. */
export function validateVrijeFormatie(
  teams: readonly VfTeamInput[],
  restrictions: VfRestrictions = {},
  ageCategoryByPlayer: Record<string, string | undefined> = {},
): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();

  for (const team of teams) {
    if (team.players.length < 2 || team.players.length > 3) {
      errors.push(`Partuur ${team.teamNo}: een partuur bestaat uit 2 of 3 spelers (nu ${team.players.length}).`);
    }
    const ids = new Set(team.players.map((p) => p.id));
    if (ids.size !== team.players.length) {
      errors.push(`Partuur ${team.teamNo}: bevat een dubbele speler.`);
    }
    for (const p of team.players) {
      const prev = seen.get(p.id);
      if (prev !== undefined && prev !== team.teamNo) {
        errors.push(`${p.displayName} staat in partuur ${prev} én partuur ${team.teamNo}. Een speler mag maar in één partuur per toernooi staan.`);
      }
      seen.set(p.id, team.teamNo);
    }
    if (team.captainId && !ids.has(team.captainId)) {
      errors.push(`Partuur ${team.teamNo}: de aanvoerder maakt geen deel uit van het partuur.`);
    }

    // beperkingen (Vrije Formatie Beperkt)
    for (const p of team.players) {
      if (restrictions.minLevel && p.skillLevel && LEVEL_ORDER[p.skillLevel] < LEVEL_ORDER[restrictions.minLevel]) {
        errors.push(`Partuur ${team.teamNo}: ${p.displayName} (niveau ${p.skillLevel}) voldoet niet aan minimumniveau ${restrictions.minLevel}.`);
      }
      if (restrictions.maxLevel && p.skillLevel && LEVEL_ORDER[p.skillLevel] > LEVEL_ORDER[restrictions.maxLevel]) {
        errors.push(`Partuur ${team.teamNo}: ${p.displayName} (niveau ${p.skillLevel}) overschrijdt maximumniveau ${restrictions.maxLevel}.`);
      }
      if (restrictions.genderRule === 'dames' && p.gender !== 'dame') {
        errors.push(`Partuur ${team.teamNo}: ${p.displayName} is geen dame; deze partij is alleen voor dames.`);
      }
      if (restrictions.genderRule === 'heren' && p.gender !== 'heer') {
        errors.push(`Partuur ${team.teamNo}: ${p.displayName} is geen heer; deze partij is alleen voor heren.`);
      }
      const cat = ageCategoryByPlayer[p.id];
      if (restrictions.allowedAgeCategories && cat && !restrictions.allowedAgeCategories.includes(cat)) {
        errors.push(`Partuur ${team.teamNo}: leeftijdscategorie '${cat}' van ${p.displayName} is niet toegestaan.`);
      }
    }
    if (restrictions.genderRule === 'gemengd' && team.players.length >= 2) {
      const genders = new Set(team.players.map((p) => p.gender));
      if (genders.size < 2) {
        errors.push(`Partuur ${team.teamNo}: een gemengd partuur bevat zowel dames als heren.`);
      }
    }
  }

  if (restrictions.maxTeams !== undefined && teams.length > restrictions.maxTeams) {
    errors.push(`Maximaal ${restrictions.maxTeams} parturen toegestaan (nu ${teams.length}). Gebruik de wachtlijst.`);
  }

  return errors;
}

/** Zet VfTeamInput om naar DrawTeam (na validatie). */
export function toDrawTeams(teams: readonly VfTeamInput[]): DrawTeam[] {
  return teams.map((t) => ({ teamNo: t.teamNo, players: t.players }));
}
