import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  tournaments,
  SYSTEM_LABELS,
  FORMATION_LABELS,
  type TournamentRow,
} from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate, formatEventMoment } from '../../src/lib/dates';
import {
  Card,
  Loading,
  ErrorState,
  EmptyState,
  StatusLabel,
  Segmented,
  type Status,
} from '../../src/components/ui';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const TABS = ['Komend', 'Afgelopen'] as const;
type Tab = (typeof TABS)[number];

/** Maps a row onto the three public chips. */
function chipFor(row: TournamentRow): Status {
  if (row.status === 'draft') return 'concept';
  if (row.status === 'finished' || row.status === 'cancelled') return 'afgelopen';
  if (row.status === 'live') return 'live';
  if (row.played_on && new Date(row.played_on) < new Date()) return 'afgelopen';
  return 'binnenkort';
}

export default function Wedstrijden() {
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Komend');

  const load = useCallback(() => tournaments.overview(), []);
  const state = useAsync(load, []);

  useFocusEffect(
    useCallback(() => {
      state.reload();
    }, []),
  );

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const rows = tab === 'Komend' ? state.data.komend : state.data.afgelopen;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <Segmented options={TABS} value={tab} onChange={setTab} />

      {rows.length === 0 ? (
        <EmptyState
          title={tab === 'Komend' ? 'Geen wedstrijden gepland' : 'Nog geen afgelopen wedstrijden'}
          hint={tab === 'Komend' ? 'Zodra er een wedstrijd staat, verschijnt die hier.' : undefined}
        />
      ) : (
        rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() => router.push(`/toernooi/${row.id}`)}
            accessibilityRole="button"
            accessibilityLabel={row.name}
            style={({ pressed }) => [pressed && s.pressed]}
          >
            <Card>
              <View style={s.rowBetween}>
                <Text style={s.title}>{row.name}</Text>
                <StatusLabel status={chipFor(row)} />
              </View>
              <Text style={s.muted}>
                {row.played_on ? formatDate(row.played_on) : 'Datum volgt'}
                {row.location ? ` · ${row.location}` : ''}
              </Text>

              <View style={s.tags}>
                <Text style={s.tag}>{SYSTEM_LABELS[row.match_system] ?? row.match_system}</Text>
                <Text style={s.tag}>
                  {FORMATION_LABELS[row.formation_category] ?? row.formation_category}
                </Text>
              </View>

              {/* Registration state is the thing a member actually looks for. */}
              {row.registration_open ? (
                <View style={s.regOpen}>
                  <Ionicons name="person-add-outline" size={14} color={colors.gain} />
                  <Text style={s.regOpenText}>
                    Inschrijving open · {row.registered} ingeschreven
                    {row.registration_deadline
                      ? ` · sluit ${formatEventMoment(row.registration_deadline)}`
                      : ''}
                  </Text>
                </View>
              ) : row.draw_published_at ? (
                <Text style={s.muted}>
                  Geloot · {row.team_count} parturen
                </Text>
              ) : row.registered > 0 ? (
                <Text style={s.muted}>
                  Inschrijving gesloten · {row.registered} ingeschreven
                </Text>
              ) : null}
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  pressed: { opacity: 0.75 },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { ...t.cardTitle, flex: 1 },
  muted: { ...t.meta, marginTop: 2 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  tag: {
    ...t.meta,
    color: colors.textMuted,
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    overflow: 'hidden',
  },

  regOpen: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  regOpenText: { ...t.meta, color: colors.gain, flex: 1 },
});
