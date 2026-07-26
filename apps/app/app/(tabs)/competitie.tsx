import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type StandingRow } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDateTime } from '../../src/lib/dates';
import { Loading, ErrorState, EmptyState, SportPanel, SectionHeader } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/** Rise/fall arrow from the stored previous position (spec section 10.12). */
function Delta({ row }: { row: StandingRow }) {
  if (row.position == null || row.previous_position == null)
    return <Text style={s.flat}>·</Text>;
  const delta = row.previous_position - row.position;
  if (delta === 0) return <Text style={s.flat}>·</Text>;
  // Arrow plus number, never colour alone — red/green carries no meaning for a
  // colourblind reader on its own.
  return (
    <Text style={delta > 0 ? s.up : s.down}>
      {delta > 0 ? '▲' : '▼'}
      {Math.abs(delta)}
    </Text>
  );
}

function signed(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

function StandingsTable({ rows, isWide }: { rows: StandingRow[]; isWide: boolean }) {
  if (rows.length === 0) {
    return (
      <SportPanel>
        <Text style={s.emptyOnSport}>Nog geen deelnemers in deze stand.</Text>
      </SportPanel>
    );
  }

  return (
    <SportPanel>
      <View style={[s.row, s.head]}>
        <Text style={[s.pos, s.headText]}>#</Text>
        <View style={s.delta} />
        <Text style={[s.name, s.headText]}>Speler</Text>
        <Text style={[s.num, s.headText]}>V</Text>
        <Text style={[s.num, s.headText]}>T</Text>
        <Text style={[s.num, s.headText]}>S</Text>
        <Text style={[s.num, s.headText]}>D</Text>
        {isWide ? <Text style={[s.num, s.headText]}>G</Text> : null}
        {isWide ? <Text style={[s.num, s.headText]}>W</Text> : null}
      </View>

      {rows.map((r, i) => (
        <View key={r.player_id} style={[s.row, i === rows.length - 1 && s.noBorder]}>
          <Text style={s.pos}>{r.position ?? '–'}</Text>
          <View style={s.delta}>
            <Delta row={r} />
          </View>
          <Text style={s.name} numberOfLines={1}>
            {r.display_name}
          </Text>
          {/* Eersten voor leads the sort order, so it is the one number set bold. */}
          <Text style={s.numLead}>{r.eersten_voor}</Text>
          <Text style={s.num}>{r.eersten_tegen}</Text>
          <Text style={[s.num, r.saldo > 0 ? s.up : r.saldo < 0 ? s.down : undefined]}>
            {signed(r.saldo)}
          </Text>
          <Text style={s.num}>{r.deelnames}</Text>
          {isWide ? <Text style={s.num}>{r.gespeeld}</Text> : null}
          {isWide ? <Text style={s.num}>{r.gewonnen}</Text> : null}
        </View>
      ))}
    </SportPanel>
  );
}

export default function Competitie() {
  const { isWide } = useBreakpoint();
  const load = useCallback(() => api.standings(), []);
  const state = useAsync(load, []);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.length === 0)
    return <EmptyState title="Nog geen stand" hint="De stand verschijnt na de eerste speelronde." />;

  // Groups come pre-ranked from the API: each table is ranked within itself, so a
  // Dames table never shows global positions 2, 5, 7.
  const heren = state.data.filter((r) => r.groep === 'heren');
  const dames = state.data.filter((r) => r.groep === 'dames');

  // Most recent recalculation across both groups.
  const updated = state.data.reduce<string | null>(
    (latest, r) => (r.updated_at && (!latest || r.updated_at > latest) ? r.updated_at : latest),
    null,
  );

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <SectionHeader title="Competitiestand Heren" />
      <StandingsTable rows={heren} isWide={isWide} />

      <SectionHeader title="Competitiestand Dames" />
      <StandingsTable rows={dames} isWide={isWide} />

      <Text style={s.legend}>
        V = eersten voor · T = eersten tegen · S = saldo · D = deelnames
        {isWide ? ' · G = gespeeld · W = gewonnen' : ''}
      </Text>
      <Text style={s.legend}>
        Winnaar krijgt 7 eersten voor; verliezer de eigen eersten (KNKB-telling).
      </Text>
      {updated ? <Text style={s.updated}>Update {formatDateTime(updated)}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineOnSport,
  },
  noBorder: { borderBottomWidth: 0 },
  head: { borderBottomColor: 'rgba(255,255,255,0.18)', paddingBottom: spacing.sm },
  headText: { ...t.tableHead, color: colors.onSportMuted },

  pos: { ...t.tableNum, width: 24, color: colors.onSportMuted, textAlign: 'left' },
  delta: { width: 30 },
  name: { ...t.tableName, flex: 1, color: colors.onSport },
  num: { ...t.tableNum, width: 32, textAlign: 'right', color: colors.onSportMuted },
  numLead: { ...t.tableNumLead, width: 32, textAlign: 'right', color: colors.onSport },
  emptyOnSport: { ...t.meta, color: colors.onSportMuted, paddingVertical: spacing.sm },

  up: { ...t.tableNum, fontSize: 11, color: colors.gain },
  down: { ...t.tableNum, fontSize: 11, color: colors.loss },
  flat: { ...t.tableNum, fontSize: 11, color: colors.onSportMuted, opacity: 0.5 },

  legend: { ...t.meta, marginTop: spacing.sm },
  updated: { ...t.meta, marginTop: spacing.md, fontStyle: 'italic' },
});
