import type { TextStyle } from 'react-native';
import { colors } from './tokens';

/**
 * Typography — Barlow Condensed for headings, Inter for everything else.
 *
 * Condensed headings carry the sport character while fitting long Dutch compounds
 * ("Competitiestand", "Herkansingspartij") without wrapping. The v1 spec asked for Black
 * Italic; this system uses upright ExtraBold instead — heavy italics were the sports
 * broadcast idiom of a decade ago and lose legibility badly at small sizes. See
 * docs/Decisions/ADR-0008-fryslan-design-system.md.
 *
 * Tabular numerals on every figure in standings and results is non-negotiable: with
 * proportional digits the columns shift width per row and comparison gets measurably
 * harder.
 */
export const fonts = {
  heading: 'BarlowCondensed_700Bold',
  headingBold: 'BarlowCondensed_800ExtraBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

/** Applied to every numeric cell in standings, scores and results. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  /** Club name in the hero block. */
  hero: {
    fontFamily: fonts.headingBold,
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.4,
  } satisfies TextStyle,

  /** Screen title inside a page (not the navigation header). */
  pageTitle: {
    fontFamily: fonts.headingBold,
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.2,
    color: colors.text,
  } satisfies TextStyle,

  /**
   * Section label. Small, spaced and uppercase rather than large and shouty — the quiet
   * chrome that lets the data below it dominate.
   */
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: colors.textMuted,
  } satisfies TextStyle,

  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  } satisfies TextStyle,

  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  } satisfies TextStyle,

  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  } satisfies TextStyle,

  /** Table headings in standings. */
  tableHead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  } satisfies TextStyle,

  /** A player or partuur name in a table row. */
  tableName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  } satisfies TextStyle,

  /** Ordinary numeric cell. */
  tableNum: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    ...tabular,
  } satisfies TextStyle,

  /** The figure a row is ranked on — the one number that should read loudest. */
  tableNumLead: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    ...tabular,
  } satisfies TextStyle,

  /** Status chips: LIVE / BINNENKORT / AFGELOPEN. */
  chip: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  } satisfies TextStyle,

  button: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  } satisfies TextStyle,
} as const;
