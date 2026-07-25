import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type StandingRow } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { Card, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme/tokens';

/** Rise/fall arrow from the stored previous position (spec section 10.12). */
function Delta({ row }: { row: StandingRow }) {
  if (row.position == null || row.previous_position == null) return <Text style={s.flat}>·</Text>;
  const delta = row.previous_position - row.position;
  if (delta === 0) return <Text style={s.flat}>·</Text>;
  return (
    <Text style={delta > 0 ? s.up : s.down}>
      {delta > 0 ? '▲' : '▼'}
      {Math.abs(delta)}
    </Text>
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
    return <EmptyState title="Nog geen stand" hint="De stand verschijnt na de eerste speelavond." />;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <Card>
        <View style={[s.row, s.head]}>
          <Text style={[s.pos, s.headText]}>#</Text>
          <Text style={[s.delta, s.headText]} />
          <Text style={[s.name, s.headText]}>Speler</Text>
          <Text style={[s.num, s.headText]}>V</Text>
          <Text style={[s.num, s.headText]}>T</Text>
          <Text style={[s.num, s.headText]}>S</Text>
          <Text style={[s.num, s.headText]}>D</Text>
          {isWide ? <Text style={[s.num, s.headText]}>G</Text> : null}
          {isWide ? <Text style={[s.num, s.headText]}>W</Text> : null}
        </View>

        {state.data.map((r) => (
          <View key={r.player_id} style={s.row}>
            <Text style={s.pos}>{r.position ?? '–'}</Text>
            <View style={s.delta}>
              <Delta row={r} />
            </View>
            <Text style={s.name} numberOfLines={1}>
              {r.display_name}
            </Text>
            <Text style={s.num}>{r.eersten_voor}</Text>
            <Text style={s.num}>{r.eersten_tegen}</Text>
            <Text style={s.num}>{r.saldo}</Text>
            <Text style={s.num}>{r.deelnames}</Text>
            {isWide ? <Text style={s.num}>{r.gespeeld}</Text> : null}
            {isWide ? <Text style={s.num}>{r.gewonnen}</Text> : null}
          </View>
        ))}

        <Text style={s.legend}>
          V = eersten voor · T = eersten tegen · S = saldo · D = deelnames
          {isWide ? ' · G = gespeeld · W = gewonnen' : ''}
        </Text>
        <Text style={s.legend}>
          Sortering: eersten voor ↓, eersten tegen ↑, saldo ↓, deelnames ↓, naam ↑
        </Text>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray300,
  },
  head: { borderBottomWidth: 2, borderBottomColor: colors.black },
  headText: { fontWeight: '800', fontSize: 12, color: colors.gray700 },
  pos: { width: 26, color: colors.gray700, fontVariant: ['tabular-nums'] },
  delta: { width: 28, alignItems: 'flex-start' },
  name: { flex: 1, fontWeight: '600', color: colors.black },
  num: { width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
  up: { color: colors.success, fontSize: 11, fontWeight: '700' },
  down: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  flat: { color: colors.gray300, fontSize: 11 },
  legend: { marginTop: spacing.sm, fontSize: 11, color: colors.gray500 },
});
