/**
 * Design tokens — the "Fryslân" system.
 *
 * Identity is deep Frisian blue rather than the placeholder red/black/white the original
 * spec carried (its own TODO said to redo the palette once the logo arrived). Kaatsen is
 * the Frisian sport and the Frisian flag is blue and white, so blue is both the most
 * place-rooted choice and — since club sports apps default to red-and-black — the most
 * distinctive one.
 *
 * Red survives only as a SEMANTIC signal: live, absent, conceded, negative saldo. It is no
 * longer a brand colour, which is better information design — red should mean something.
 *
 * Tokens are semantic pairs (surface / onSurface / …) rather than raw hex, so a dark theme
 * is a second palette object rather than an edit to every screen.
 * See docs/Decisions/ADR-0008-fryslan-design-system.md.
 */

/** Raw ramps. Screens must not import these — use the palette exports below. */
const raw = {
  // Blue-tinted neutrals rather than grey. Dark sport surfaces read as scoreboard rather
  // than as "dark mode", and numerals stay bright against them.
  ink: '#081221',
  navy900: '#0E1E33',
  navy800: '#162941',
  slate600: '#5B6E88',
  slate400: '#93A4BC',
  slate300: '#C6D0DD',
  slate200: '#E3E9F0',
  slate100: '#EEF2F7',
  paper: '#F6F8FB',
  white: '#FFFFFF',

  // Brand blue.
  blue600: '#1C5FD8',
  blue500: '#2B76F0',
  blue400: '#589BFF',
  blue050: '#EAF1FE',

  // Warm accent — upcoming events and highlights. The gold note carried over from v1.
  amber500: '#F0A11B',
  amber100: '#FDF0D6',

  // Semantics.
  green500: '#22A06B',
  red500: '#E5484D',
} as const;

export type Palette = {
  background: string;
  card: string;
  /** Dark sport surface — standings, scores, live content. */
  sport: string;
  sportRaised: string;
  text: string;
  textMuted: string;
  onSport: string;
  onSportMuted: string;
  line: string;
  lineOnSport: string;
  primary: string;
  onPrimary: string;
  primaryOnSport: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  onAccentSoft: string;
  gain: string;
  loss: string;
  live: string;
  onLive: string;
  neutralChip: string;
  onNeutralChip: string;
};

export const lightPalette: Palette = {
  background: raw.paper,
  card: raw.white,
  sport: raw.navy900,
  sportRaised: raw.navy800,
  text: '#0B1728',
  textMuted: raw.slate600,
  onSport: raw.white,
  onSportMuted: raw.slate400,
  line: raw.slate200,
  lineOnSport: 'rgba(255,255,255,0.08)',
  primary: raw.blue600,
  onPrimary: raw.white,
  primaryOnSport: raw.blue400,
  primarySoft: raw.blue050,
  accent: raw.amber500,
  accentSoft: raw.amber100,
  onAccentSoft: '#8A5A00',
  gain: raw.green500,
  loss: raw.red500,
  live: raw.red500,
  onLive: raw.white,
  neutralChip: raw.slate100,
  onNeutralChip: raw.slate600,
};

/** Dark theme. Sport surfaces are already dark, so only the content layer inverts. */
export const darkPalette: Palette = {
  background: raw.ink,
  card: raw.navy900,
  sport: raw.navy900,
  sportRaised: raw.navy800,
  text: '#EDF2F8',
  textMuted: raw.slate400,
  onSport: raw.white,
  onSportMuted: raw.slate400,
  line: 'rgba(255,255,255,0.09)',
  lineOnSport: 'rgba(255,255,255,0.09)',
  primary: raw.blue400,
  onPrimary: raw.ink,
  primaryOnSport: raw.blue400,
  primarySoft: 'rgba(43,118,240,0.16)',
  accent: raw.amber500,
  accentSoft: 'rgba(240,161,27,0.16)',
  onAccentSoft: raw.amber500,
  gain: raw.green500,
  loss: raw.red500,
  live: raw.red500,
  onLive: raw.white,
  neutralChip: 'rgba(255,255,255,0.08)',
  onNeutralChip: raw.slate400,
};

/**
 * Used by screens today. Light-only for now; switching to darkPalette becomes a one-line
 * change when a theme provider lands, because nothing references raw hex.
 */
export const colors = lightPalette;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 11,
  lg: 16,
  full: 999,
} as const;

/** Minimum touch target (a11y, spec section 12 rule 10). */
export const MIN_TOUCH = 44;

/**
 * Score entry uses far larger targets than the 44pt minimum: that screen is operated
 * one-handed at the side of a pitch, often in poor weather. Carried over from the v1
 * spec, which got this right.
 */
export const SCORE_TOUCH = 88;

export const elevation = {
  card: {
    shadowColor: '#0B1728',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
} as const;
