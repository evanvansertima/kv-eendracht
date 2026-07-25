/**
 * Design tokens — centraal aanpasbaar (spec §5).
 * TODO na aanlevering logo: kleuren afstemmen op het officiële
 * KV Eendracht-logo (assets/images/kv-eendracht-logo.png).
 */

export const colors = {
  // clubkleuren
  primary: '#B3121F', // diep rood
  primaryDark: '#8C0E18',
  accent: '#E8A926', // okergeel/goud
  accentDark: '#C78E15',

  // basis
  white: '#FFFFFF',
  black: '#101114', // bijna zwart
  surfaceDark: '#16181D', // donkere sportvlakken
  surfaceDarker: '#0C0D10',
  gray900: '#1E2127',
  gray700: '#3A3F49',
  gray500: '#6B7280',
  gray300: '#D1D5DB',
  gray100: '#F3F4F6',
  background: '#F7F7F8',

  // status
  success: '#1E8E3E', // gewonnen/actief
  warning: '#E8710A', // concept/wachten
  danger: '#C5221F', // fout/afwezig
  live: '#E11D2E',

  // wedstrijdzijden
  sideRed: '#B3121F',
  sideWhite: '#F4F4F5',
} as const;

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
  md: 10,
  lg: 16,
  full: 999,
} as const;

/** Minimale aanraakgrootte (a11y, spec §5). */
export const MIN_TOUCH = 44;

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

/** Diagonale accenthoek voor de sportlook (graden). */
export const SKEW_DEG = '-8deg';
