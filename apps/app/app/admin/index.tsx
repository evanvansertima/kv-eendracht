import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { Card, SectionHeader, Loading, ErrorState } from '../../src/components/ui';
import { useSession } from '../../src/lib/SessionProvider';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Beheerdersdashboard — a hub, not a workspace.
 *
 * Speelrondes used to be listed here directly; they now live under Competitie, which
 * owns everything about the running competition (rondes, loten, uitslagen). The
 * dashboard's job is to show what needs attention and route onward.
 */
export default function AdminDashboard() {
  const { user, canEnterResults } = useSession();
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const load = useCallback(async () => {
    const competitions = await games.competitions();
    const active = competitions[0];
    const rounds = active ? await games.rounds(active.id) : [];
    return { active, openRounds: rounds.filter((r) => r.status === 'open') };
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

  const { active, openRounds } = state.data;

  const sections = [
    {
      label: 'Competitie',
      sub: active
        ? `${active.name} · ${openRounds.length} open speelronde${openRounds.length === 1 ? '' : 's'}`
        : 'Speelrondes, loten en uitslagen',
      href: '/admin/competitie',
      icon: 'stats-chart-outline',
      badge: openRounds.length || null,
    },
    {
      label: 'Wedstrijden',
      sub: 'Toernooien aanmaken, loten en publiceren',
      href: '/admin/toernooi/nieuw',
      icon: 'trophy-outline',
      badge: null,
    },
    {
      label: 'Spelers',
      sub: 'Spelersdatabase, zoeken en toevoegen',
      href: '/admin/spelers',
      icon: 'people-outline',
      badge: null,
    },
    {
      label: 'Agenda',
      sub: 'Activiteiten beheren',
      href: '/admin/agenda',
      icon: 'calendar-outline',
      badge: null,
    },
    {
      label: 'Moderatie',
      sub: 'Wachtrij en meldingen',
      href: '/admin/moderatie',
      icon: 'shield-checkmark-outline',
      badge: null,
    },
  ] as const;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>Beheer</Text>
        <Text style={s.heroTitle}>{user?.display_name}</Text>
        <Text style={s.heroMeta}>
          {canEnterResults ? 'Mag uitslagen invoeren' : 'Alleen-lezen voor uitslagen'}
        </Text>
      </View>

      <SectionHeader title="Onderdelen" />
      {sections.map((item) => (
        <Pressable
          key={item.label}
          onPress={() => router.push(item.href)}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={({ pressed }) => [pressed && s.pressed]}
        >
          <Card>
            <View style={s.row}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
              <View style={s.flex}>
                <Text style={t.cardTitle}>{item.label}</Text>
                <Text style={t.meta}>{item.sub}</Text>
              </View>
              {item.badge ? (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{item.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 860, width: '100%', alignSelf: 'center', padding: spacing.xxl },
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
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...t.chip, color: colors.onAccentSoft },
});
