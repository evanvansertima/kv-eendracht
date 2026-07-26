import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type Omloop } from '@kv/domain';
import { colors, spacing, radii, MIN_TOUCH } from '../theme/tokens';
import { type as t, tabular } from '../theme/typography';

/**
 * Omloop bracket.
 *
 * Laid out as columns — one per omloop — scrolling horizontally, because a bracket read
 * left to right is how everyone already understands a schema. On a phone the columns
 * are narrow and scroll; on a desktop they all fit.
 *
 * The staand nummer is drawn as its own card rather than hidden, since "who went
 * through without playing" is the thing people ask about first.
 */

export interface BracketResult {
  /** Key: `${roundNo}-${matchNo}` */
  [key: string]: { red: number; white: number } | undefined;
}

export function Bracket({
  omlopen,
  results,
  onEnterResult,
  teamName,
}: {
  omlopen: Omloop[];
  results: BracketResult;
  onEnterResult?: (roundNo: number, matchNo: number) => void;
  teamName?: (teamNo: number) => string;
}) {
  const name = teamName ?? ((n: number) => `Partuur ${n}`);

  if (omlopen.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={t.meta}>Nog geen schema. Loot eerst de parturen.</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.row}>
      {omlopen.map((omloop) => (
        <View key={omloop.roundNo} style={s.column}>
          <Text style={s.columnTitle}>{omloop.label}</Text>

          {omloop.partijen.map((p) => {
            const key = `${omloop.roundNo}-${p.matchNo}`;
            const result = results[key];
            const played = result != null;
            const redWon = played && result.red > result.white;

            return (
              <Pressable
                key={key}
                onPress={() => onEnterResult?.(omloop.roundNo, p.matchNo)}
                disabled={!onEnterResult}
                accessibilityRole={onEnterResult ? 'button' : undefined}
                accessibilityLabel={`${name(p.redTeamNo)} tegen ${name(p.whiteTeamNo)}${
                  played ? `, uitslag ${result.red} om ${result.white}` : ', nog te spelen'
                }`}
                style={({ pressed }) => [s.match, pressed && onEnterResult && s.pressed]}
              >
                {/* Red side: lowest partuur number, starts at the opslag. */}
                <View style={[s.side, played && redWon && s.sideWon]}>
                  <View style={[s.dot, { backgroundColor: colors.live }]} />
                  <Text style={[s.team, played && redWon && s.teamWon]} numberOfLines={1}>
                    {name(p.redTeamNo)}
                  </Text>
                  <Text style={[s.score, played && redWon && s.teamWon]}>
                    {played ? result.red : '–'}
                  </Text>
                </View>

                <View style={[s.side, s.sideLast, played && !redWon && s.sideWon]}>
                  <View style={[s.dot, s.dotWhite]} />
                  <Text style={[s.team, played && !redWon && s.teamWon]} numberOfLines={1}>
                    {name(p.whiteTeamNo)}
                  </Text>
                  <Text style={[s.score, played && !redWon && s.teamWon]}>
                    {played ? result.white : '–'}
                  </Text>
                </View>

                {onEnterResult && !played ? (
                  <View style={s.enterHint}>
                    <Ionicons name="create-outline" size={12} color={colors.onSportMuted} />
                    <Text style={s.enterHintText}>Uitslag</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {omloop.staandNummer !== null ? (
            <View style={s.staand}>
              <Ionicons name="arrow-forward-circle" size={14} color={colors.accent} />
              <Text style={s.staandText} numberOfLines={1}>
                {name(omloop.staandNummer)}
              </Text>
              <Text style={s.staandLabel}>staand nummer</Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  column: { width: 190, gap: spacing.sm },
  columnTitle: { ...t.sectionLabel, color: colors.textMuted, marginBottom: spacing.xs },

  match: {
    backgroundColor: colors.sport,
    borderRadius: radii.md,
    overflow: 'hidden',
    minHeight: MIN_TOUCH + 12,
  },
  pressed: { opacity: 0.8 },

  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineOnSport,
  },
  sideLast: { borderBottomWidth: 0 },
  sideWon: { backgroundColor: colors.sportRaised },

  dot: { width: 7, height: 7, borderRadius: 4 },
  dotWhite: { backgroundColor: colors.onSport },

  team: { ...t.tableName, flex: 1, color: colors.onSportMuted },
  teamWon: { color: colors.onSport, fontWeight: '700' },
  score: { ...tabular, ...t.tableNumLead, color: colors.onSportMuted, minWidth: 16, textAlign: 'right' },

  enterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  enterHintText: { ...t.chip, color: colors.onSportMuted },

  staand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  staandText: { ...t.tableName, color: colors.onAccentSoft, flex: 1 },
  staandLabel: { ...t.chip, color: colors.onAccentSoft },

  empty: { padding: spacing.xl, alignItems: 'center' },
});
