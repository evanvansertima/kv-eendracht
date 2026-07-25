import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { Card, Loading, ErrorState, EmptyState, SectionHeader } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Player administration.
 *
 * Contact details are shown here because staff legitimately need them — and because RLS,
 * not this screen, is what decides whether this caller may see them. The public app
 * reads from v_players_public, which omits phone, email and admin_notes entirely.
 */
export default function Spelers() {
  const { isWide } = useBreakpoint();
  const [search, setSearch] = useState('');

  const load = useCallback(() => games.players(), []);
  const state = useAsync(load, []);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? state.data.filter((p) => p.display_name.toLowerCase().includes(q))
    : state.data;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Zoek op naam…"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Zoek speler"
        style={s.search}
      />

      <SectionHeader title={`${filtered.length} spelers`} />

      {filtered.length === 0 ? (
        <EmptyState title="Geen spelers gevonden" hint="Pas je zoekopdracht aan." />
      ) : (
        filtered.map((p) => (
          <Card key={p.id}>
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={t.cardTitle}>{p.display_name}</Text>
                <Text style={t.meta}>
                  {[p.skill_level ? `Niveau ${p.skill_level}` : null, p.gender, p.club]
                    .filter(Boolean)
                    .join(' · ') || 'Geen aanvullende gegevens'}
                </Text>
                {p.phone || p.email ? (
                  <Text style={s.contact}>
                    {[p.phone, p.email].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              {!p.is_active ? (
                <View style={s.inactive}>
                  <Text style={s.inactiveText}>Inactief</Text>
                </View>
              ) : (
                <Ionicons name="person-circle-outline" size={22} color={colors.textMuted} />
              )}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 800, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  search: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contact: { ...t.meta, color: colors.primary, marginTop: 2 },
  inactive: {
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  inactiveText: { ...t.chip, color: colors.onNeutralChip },
});
