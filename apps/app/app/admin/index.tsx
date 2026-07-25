import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { useSession } from '../../src/lib/SessionProvider';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

export default function AdminDashboard() {
  const { user, canEnterResults } = useSession();
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const load = useCallback(async () => {
    const competitions = await games.competitions();
    const active = competitions[0];
    const rounds = active ? await games.rounds(active.id) : [];
    return { competitions, active, rounds };
  }, []);
  const state = useAsync(load, []);

  useFocusEffect(
    useCallback(() => {
      state.reload();
    }, []),
  );

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { active, rounds } = state.data;
  const open = rounds.filter((r) => r.status === 'open');

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>Beheer</Text>
        <Text style={s.heroTitle}>{user?.display_name}</Text>
        <Text style={s.heroMeta}>
          {canEnterResults ? 'Mag uitslagen invoeren' : 'Alleen-lezen voor uitslagen'}
        </Text>
      </View>

      {active ? (
        <>
          <SectionHeader title="Open speelavonden" />
          {open.length === 0 ? (
            <EmptyState
              title="Geen open speelavond"
              hint="Alle speelavonden zijn afgerond."
            />
          ) : (
            open.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/admin/speelavond/${r.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Speelavond ${r.round_no}`}
                style={({ pressed }) => [pressed && s.pressed]}
              >
                <Card>
                  <View style={s.row}>
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{r.round_no}</Text>
                    </View>
                    <View style={s.flex}>
                      <Text style={t.cardTitle}>Speelavond {r.round_no}</Text>
                      <Text style={t.meta}>
                        {r.played_on ? formatDate(r.played_on) : 'Datum onbekend'} ·{' '}
                        {r.result_count}/{r.match_count} uitslagen
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            ))
          )}

          <SectionHeader title="Afgeronde speelavonden" />
          {rounds
            .filter((r) => r.status === 'finalized')
            .slice(0, 5)
            .map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/admin/speelavond/${r.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Speelavond ${r.round_no}, afgerond`}
                style={({ pressed }) => [pressed && s.pressed]}
              >
                <Card>
                  <View style={s.row}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.gain} />
                    <View style={s.flex}>
                      <Text style={t.cardTitle}>Speelavond {r.round_no}</Text>
                      <Text style={t.meta}>
                        {r.played_on ? formatDate(r.played_on) : ''} · {r.result_count} uitslagen
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
        </>
      ) : (
        <EmptyState title="Geen competitie gevonden" />
      )}

      <SectionHeader title="Overig" />
      <Pressable
        onPress={() => router.push('/admin/spelers')}
        accessibilityRole="button"
        accessibilityLabel="Spelers beheren"
        style={({ pressed }) => [pressed && s.pressed]}
      >
        <Card>
          <View style={s.row}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <View style={s.flex}>
              <Text style={t.cardTitle}>Spelers</Text>
              <Text style={t.meta}>Zoeken, bewerken en archiveren</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

      {(['Toernooien', 'Agenda', 'Moderatie'] as const).map((label) => (
        <Card key={label}>
          <View style={s.row}>
            <Ionicons name="ellipse-outline" size={20} color={colors.textMuted} />
            <View style={s.flex}>
              <Text style={t.cardTitle}>{label}</Text>
            </View>
            <Text style={s.soon}>Binnenkort</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 30, lineHeight: 34 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...t.tableNumLead, color: colors.primary },
  soon: {
    ...t.chip,
    color: colors.onAccentSoft,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
});
