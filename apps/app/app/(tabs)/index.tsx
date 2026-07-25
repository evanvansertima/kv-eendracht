import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, SYSTEM_LABELS, FORMATION_LABELS } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatEventMoment, formatDate } from '../../src/lib/dates';
import { Card, SectionHeader, StatusLabel, Loading, ErrorState, EmptyState, Button } from '../../src/components/ui';
import { colors, spacing, radii } from '../../src/theme/tokens';

export default function Home() {
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const load = useCallback(
    () =>
      Promise.all([api.agenda(), api.tournaments(), api.standings(), api.news(), api.activePoll()]),
    [],
  );
  const state = useAsync(load, []);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const [agenda, tournaments, standings, news, poll] = state.data;
  const nextEvent = agenda[0];
  const nextTournament = tournaments[0];
  const top5 = standings.slice(0, 5);

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>KAATSVERENIGING</Text>
        <Text style={s.heroTitle}>KV EENDRACHT</Text>
        <View style={s.accentBar} />
      </View>

      <View style={s.quickRow}>
        <Button label="Agenda" variant="ghost" onPress={() => router.push('/agenda')} />
        <Button label="Toernooien" variant="ghost" onPress={() => router.push('/toernooien')} />
        <Button label="Competitie" variant="ghost" onPress={() => router.push('/competitie')} />
      </View>

      <View style={isWide ? s.columns : undefined}>
        <View style={isWide ? s.column : undefined}>
          <SectionHeader title="Volgende activiteit" />
          {nextEvent ? (
            <Card>
              <Text style={s.itemTitle}>{nextEvent.title}</Text>
              <Text style={s.muted}>
                {formatEventMoment(nextEvent.starts_at)}
                {nextEvent.location ? ` · ${nextEvent.location}` : ''}
              </Text>
            </Card>
          ) : (
            <EmptyState title="Geen activiteiten gepland" />
          )}

          <SectionHeader title="Volgend toernooi" />
          {nextTournament ? (
            <Card dark>
              <View style={s.rowBetween}>
                <Text style={s.itemTitleLight}>{nextTournament.name}</Text>
                <StatusLabel status="binnenkort" />
              </View>
              <Text style={s.mutedLight}>
                {nextTournament.played_on ? formatDate(nextTournament.played_on) : 'Datum volgt'}
                {nextTournament.location ? ` · ${nextTournament.location}` : ''}
              </Text>
              <Text style={s.mutedLight}>
                {SYSTEM_LABELS[nextTournament.match_system] ?? nextTournament.match_system}
                {' · '}
                {FORMATION_LABELS[nextTournament.formation_category] ??
                  nextTournament.formation_category}
              </Text>
            </Card>
          ) : (
            <EmptyState title="Geen toernooien gepland" />
          )}
        </View>

        <View style={isWide ? s.column : undefined}>
          <SectionHeader title="Top 5 competitie" />
          <Card>
            {top5.length === 0 ? (
              <EmptyState title="Nog geen stand" />
            ) : (
              top5.map((r) => (
                <View key={r.player_id} style={s.standRow}>
                  <Text style={s.pos}>{r.position ?? '–'}</Text>
                  <Text style={s.name} numberOfLines={1}>
                    {r.display_name}
                  </Text>
                  <Text style={s.num}>{r.eersten_voor}</Text>
                </View>
              ))
            )}
          </Card>

          <SectionHeader title="Laatste nieuws" />
          {news.slice(0, 3).map((n) => (
            <Card key={n.id}>
              <Text style={s.itemTitle}>{n.title}</Text>
              {n.intro ? (
                <Text style={s.muted} numberOfLines={2}>
                  {n.intro}
                </Text>
              ) : null}
            </Card>
          ))}

          {poll ? (
            <>
              <SectionHeader title="Peiling" />
              <Card>
                <Text style={s.itemTitle}>{poll.question}</Text>
                {poll.options.map((o) => (
                  <Text key={o.option_id} style={s.muted}>
                    • {o.label}
                  </Text>
                ))}
                <Text style={s.hint}>Stemmen kan zodra je bent ingelogd.</Text>
              </Card>
            </>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 1100, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  columns: { flexDirection: 'row', gap: spacing.xl },
  column: { flex: 1 },

  hero: { backgroundColor: colors.surfaceDark, borderRadius: radii.lg, padding: spacing.xl },
  heroKicker: { color: colors.accent, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  heroTitle: {
    color: colors.white,
    fontSize: 36,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  accentBar: {
    height: 5,
    width: 90,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
    transform: [{ skewX: '-8deg' }],
  },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTitle: { fontWeight: '700', fontSize: 15, color: colors.black },
  itemTitleLight: { fontWeight: '800', fontSize: 16, color: colors.white, flex: 1 },
  muted: { color: colors.gray500, marginTop: 2 },
  mutedLight: { color: colors.gray300, marginTop: 2 },
  hint: { color: colors.gray500, fontSize: 12, marginTop: spacing.sm, fontStyle: 'italic' },

  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray300,
  },
  pos: { width: 26, color: colors.gray700, fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontWeight: '600', color: colors.black },
  num: { width: 34, textAlign: 'right', fontVariant: ['tabular-nums'], fontWeight: '700' },
});
