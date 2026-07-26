export type {
  BracketSlot,
  BracketMatch,
  BracketResult,
  KnockoutOptions,
} from './knockout.ts';
export {
  roundLabel,
  generateKnockout,
  advanceWinner,
  findDoubleActivePlayers,
} from './knockout.ts';

export type { MatchResultInput } from './matchResult.ts';
export {
  MAX_EERSTEN,
  matchResultSchema,
  autoWinner,
  findPlayersInMultipleActiveMatches,
} from './matchResult.ts';

export type {
  PouleConfig,
  TiebreakRule,
  PouleAssignment,
  PouleMatchPlan,
  PouleMatchResult,
  PouleStandingRow,
} from './poule.ts';
export { assignPoules, generatePouleSchedule, computePouleStanding } from './poule.ts';

export type {
  SnekerConfig,
  SnekerRoundDraw,
  SnekerMatchResult,
  SnekerStandingRow,
} from './sneker.ts';
export { SNEKER_DEFAULT, drawSnekerRounds, computeSnekerStanding } from './sneker.ts';
export * from './omloop.ts';
