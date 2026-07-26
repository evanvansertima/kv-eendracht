import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radii } from '../theme/tokens';
import { type as t, tabular } from '../theme/typography';

/**
 * Snekertelling overview — the three speelrondes.
 *
 * Not a bracket. Nobody is knocked out: every speler plays all three rondes in a
 * different partuur each time, and the ranking is individual. Rendering the omloop
 * bracket here would suggest elimination that does not happen.
 *
 * The parturen are re-drawn per ronde, so each ronde owns its own teams. They are
 * grouped by the round_no on the partijen rather than by parsing the team name.
 */

export interface SnekerTeam {
  id: string;
  team_no: number;
  name: string | null;
  players: string | null;
}

export interface SnekerMatch {
  id: string;
  round_no: number;
  match_no: number;
  red_no: number | null;
  white_no: number | null;
  eersten_red: number | null;
  eersten_white: number | null;
}

export function SnekerOverzicht({
  teams,
  matches,
  isWide,
}: {
  teams: SnekerTeam[];
  matches: SnekerMatch[];
  isWide: boolean;
}) {
  const byTeamNo = new Map(teams.map((x) => [x.team_no, x]));
  const rondes = [...new Set(matches.map((m) => m.round_no))].sort((a, b) => a - b);

  if (rondes.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={t.meta}>Nog geen speelrondes. Loot eerst de parturen.</Text>
      </View>
    );
  }

  return (
    <View style={isWide ? s.row : undefined}>
      {rondes.map((ronde) => {
        const partijen = matches
          .filter((m) => m.round_no === ronde)
          .sort((a, b) => a.match_no - b.match_no);

        return (
          <View key={ronde} style={isWide ? s.col : undefined}>
            <Text style={s.rondeTitle}>Speelronde {ronde}</Text>

            {partijen.map((m) => {
              const red = m.red_no != null ? byTeamNo.get(m.red_no) : undefined;
              const white = m.white_no != null ? byTeamNo.get(m.white_no) : undefined;
              const played = m.eersten_red != null && m.eersten_white != null;
              const redWon = played && m.eersten_red! > m.eersten_white!;

              return (
                <View key={m.id} style={s.partij}>
                  <Side
                    label={red?.players ?? `Partuur ${m.red_no ?? '?'}`}
                    accent={colors.live}
                    score={m.eersten_red}
                    won={played && redWon}
                  />
                  <Side
                    label={white?.players ?? `Partuur ${m.white_no ?? '?'}`}
                    accent={colors.onSport}
                    score={m.eersten_white}
                    won={played && !redWon}
                    last
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function Side({
  label,
  accent,
  score,
  won,
  last,
}: {
  label: string;
  accent: string;
  score: number | null;
  won: boolean;
  last?: boolean;
}) {
  return (
    <View style={[s.side, last && s.sideLast, won && s.sideWon]}>
      <View style={[s.dot, { backgroundColor: accent }]} />
      <Text style={[s.team, won && s.teamWon]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[s.score, won && s.teamWon]}>{score ?? '–'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  col: { flex: 1 },
  empty: { padding: spacing.xl, alignItems: 'center' },

  rondeTitle: { ...t.sectionLabel, color: colors.textMuted, marginTop: spacing.md, marginBottom: spacing.sm },

  partij: {
    backgroundColor: colors.sport,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
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
  team: { ...t.tableName, flex: 1, color: colors.onSportMuted },
  teamWon: { color: colors.onSport, fontWeight: '700' },
  score: {
    ...tabular,
    ...t.tableNumLead,
    color: colors.onSportMuted,
    minWidth: 16,
    textAlign: 'right',
  },
});
