import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import heroPhoto from '../../assets/images/hero-kaatser.jpg';
import { api, SYSTEM_LABELS, FORMATION_LABELS } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatEventMoment, formatDate } from '../../src/lib/dates';
import {
  Card,
  SectionHeader,
  StatusLabel,
  SportPanel,
  Loading,
  ErrorState,
  EmptyState,
} from '../../src/components/ui';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const QUICK = [
  { label: 'Agenda', href: '/agenda', icon: 'calendar-outline' },
  { label: 'Wedstrijden', href: '/toernooien', icon: 'trophy-outline' },
  { label: 'Competitie', href: '/competitie', icon: 'stats-chart-outline' },
] as const;

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
        {/*
          Action photo, right-aligned and faded behind the title.

          Drop a photo at assets/images/hero-kaatser.jpg and it appears here. The file is
          intentionally optional: `defaultSource` is absent and the Image simply renders
          nothing if it is missing, so a missing asset degrades to the plain dark banner
          rather than a broken layout.
        */}
        <Image
          source={heroPhoto}
          style={s.heroPhoto}
          contentFit="cover"
          transition={200}
          accessibilityLabel="Kaatser in actie"
        />
        {/* A real gradient, not a solid block: a hard edge where a solid overlay ends
            reads as a rendering fault rather than as a fade. */}
        <LinearGradient
          colors={[colors.sport, colors.sport, 'transparent']}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={s.heroFade}
        />
        <View style={s.heroText}>
          <Text style={s.heroKicker}>Kaatsvereniging</Text>
          <Text style={s.heroTitle}>Eendracht</Text>
          <View style={s.heroRule} />
        </View>
      </View>

      <View style={s.quickRow}>
        {QUICK.map((q) => (
          <Text
            key={q.href}
            accessibilityRole="button"
            accessibilityLabel={q.label}
            onPress={() => router.push(q.href)}
            style={s.quick}
          >
            {q.label}
          </Text>
        ))}
      </View>

      <View style={isWide ? s.columns : undefined}>
        <View style={isWide ? s.column : undefined}>
          <SectionHeader title="Volgende activiteit" />
          {nextEvent ? (
            <Card>
              <Text style={t.cardTitle}>{nextEvent.title}</Text>
              <Text style={t.meta}>
                {formatEventMoment(nextEvent.starts_at)}
                {nextEvent.location ? ` · ${nextEvent.location}` : ''}
              </Text>
            </Card>
          ) : (
            <EmptyState title="Geen activiteiten gepland" />
          )}

          <SectionHeader title="Volgende wedstrijd" />
          {nextTournament ? (
            <View style={s.tourCard}>
              <View style={s.rowBetween}>
                <Text style={s.tourTitle}>{nextTournament.name}</Text>
                <StatusLabel status="binnenkort" />
              </View>
              <Text style={s.onSportMeta}>
                {nextTournament.played_on ? formatDate(nextTournament.played_on) : 'Datum volgt'}
                {nextTournament.location ? ` · ${nextTournament.location}` : ''}
              </Text>
              <Text style={s.onSportMeta}>
                {SYSTEM_LABELS[nextTournament.match_system] ?? nextTournament.match_system}
                {' · '}
                {FORMATION_LABELS[nextTournament.formation_category] ??
                  nextTournament.formation_category}
              </Text>
            </View>
          ) : (
            <EmptyState title="Geen wedstrijden gepland" />
          )}
        </View>

        <View style={isWide ? s.column : undefined}>
          <SectionHeader title="Top 5 competitie" />
          <SportPanel>
            {top5.length === 0 ? (
              <Text style={s.onSportMeta}>Nog geen stand.</Text>
            ) : (
              top5.map((r, i) => (
                <View key={r.player_id} style={[s.standRow, i === top5.length - 1 && s.noBorder]}>
                  <Text style={s.pos}>{r.position ?? '–'}</Text>
                  <Text style={s.name} numberOfLines={1}>
                    {r.display_name}
                  </Text>
                  <Text style={s.numLead}>{r.eersten_voor}</Text>
                </View>
              ))
            )}
          </SportPanel>

          <SectionHeader title="Laatste nieuws" />
          {news.slice(0, 3).map((n) => (
            <Card key={n.id}>
              <Text style={t.cardTitle}>{n.title}</Text>
              {n.intro ? (
                <Text style={t.meta} numberOfLines={2}>
                  {n.intro}
                </Text>
              ) : null}
            </Card>
          ))}

          {poll ? (
            <>
              <SectionHeader title="Peiling" />
              <Card>
                <Text style={t.cardTitle}>{poll.question}</Text>
                {poll.options.map((o) => (
                  <View key={o.option_id} style={s.pollRow}>
                    <Ionicons name="ellipse-outline" size={13} color={colors.textMuted} />
                    <Text style={[t.body, s.flex]}>{o.label}</Text>
                  </View>
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
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 1080, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  columns: { flexDirection: 'row', gap: spacing.xl },
  column: { flex: 1 },
  flex: { flex: 1 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    overflow: 'hidden',
    minHeight: 150,
    justifyContent: 'center',
  },
  // Right half of the banner, at 30% so the title stays the loudest thing on it.
  heroPhoto: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '58%',
    opacity: 0.3,
  },
  // Gradient-ish wash from the left so text never sits on busy pixels. A solid overlay
  // with decreasing width reads as a fade without pulling in a gradient dependency.
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroText: { zIndex: 1 },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, marginTop: spacing.xs },
  heroRule: {
    height: 3,
    width: 30,
    borderRadius: 2,
    backgroundColor: colors.primaryOnSport,
    marginTop: spacing.md,
  },

  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quick: {
    ...t.button,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tourCard: {
    backgroundColor: colors.sportRaised,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  tourTitle: { ...t.cardTitle, color: colors.onSport, flex: 1 },
  onSportMeta: { ...t.meta, color: colors.onSportMuted, marginTop: 2 },

  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineOnSport,
  },
  noBorder: { borderBottomWidth: 0 },
  pos: { ...t.tableNum, width: 24, color: colors.onSportMuted },
  name: { ...t.tableName, flex: 1, color: colors.onSport },
  numLead: { ...t.tableNumLead, width: 34, textAlign: 'right', color: colors.onSport },

  pollRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  hint: { ...t.meta, marginTop: spacing.sm, fontStyle: 'italic' },
});
