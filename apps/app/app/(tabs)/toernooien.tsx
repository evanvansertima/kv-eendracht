import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, SYSTEM_LABELS, FORMATION_LABELS } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { Card, Loading, ErrorState, EmptyState, StatusLabel, type Status } from '../../src/components/ui';
import { colors, spacing } from '../../src/theme/tokens';

/** Maps the database status onto the three public chips from spec section 1. */
function chipFor(status: string, playedOn: string | null): Status {
  if (status === 'draft') return 'concept';
  if (status === 'finished' || status === 'archived') return 'afgelopen';
  if (status === 'active') return 'live';
  if (playedOn && new Date(playedOn) < new Date()) return 'afgelopen';
  return 'binnenkort';
}

export default function Toernooien() {
  const { isWide } = useBreakpoint();
  const load = useCallback(() => api.tournaments(), []);
  const state = useAsync(load, []);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  if (state.data.length === 0) {
    return <EmptyState title="Nog geen toernooien" hint="Zodra er een toernooi gepland staat, verschijnt het hier." />;
  }

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {state.data.map((t) => (
        <Card key={t.id}>
          <View style={s.rowBetween}>
            <Text style={s.title}>{t.name}</Text>
            <StatusLabel status={chipFor(t.status, t.played_on)} />
          </View>
          <Text style={s.muted}>
            {t.played_on ? formatDate(t.played_on) : 'Datum volgt'}
            {t.location ? ` · ${t.location}` : ''}
          </Text>
          <View style={s.tags}>
            <Text style={s.tag}>{SYSTEM_LABELS[t.match_system] ?? t.match_system}</Text>
            <Text style={s.tag}>
              {FORMATION_LABELS[t.formation_category] ?? t.formation_category}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontWeight: '800', fontSize: 16, color: colors.black, flex: 1 },
  muted: { color: colors.gray500, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray700,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
