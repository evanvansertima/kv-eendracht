import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games, type NewPlayer } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { Card, Loading, ErrorState, EmptyState, SectionHeader } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const LEVELS = ['A', 'B', 'C'] as const;
const GENDERS = [
  { value: 'heer', label: 'Man' },
  { value: 'dame', label: 'Vrouw' },
  { value: 'anders', label: 'Anders' },
] as const;

/**
 * Player administration — primarily a player database.
 *
 * Contact details appear here because staff legitimately need them, and because RLS
 * decides whether this caller may see them. The public app reads v_players_public,
 * which omits phone, email and admin_notes entirely.
 */
export default function Spelers() {
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<NewPlayer>({
    first_name: '',
    infix: '',
    last_name: '',
    skill_level: null,
    gender: null,
    club: 'KV Eendracht',
  });

  const load = useCallback(() => games.players(), []);
  const state = useAsync(load, []);

  useFocusEffect(
    useCallback(() => {
      state.reload();
    }, []),
  );

  async function create() {
    if (form.first_name.trim().length < 1 || form.last_name.trim().length < 1) {
      setError('Vul in elk geval een voornaam en achternaam in.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await games.createPlayer({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        infix: form.infix?.trim() || null,
        club: form.club?.trim() || null,
      });
      setAdding(false);
      setForm({
        first_name: '',
        infix: '',
        last_name: '',
        skill_level: null,
        gender: null,
        club: 'KV Eendracht',
      });
      state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? state.data.filter((p) => p.display_name.toLowerCase().includes(q))
    : state.data;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {/* Search and the add button share a row: the field is deliberately not
          full-width so the primary action sits beside it rather than below. */}
      <View style={s.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Zoek op naam…"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Zoek speler op naam"
          style={s.search}
        />
        <Pressable
          onPress={() => setAdding((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Speler toevoegen"
          accessibilityState={{ expanded: adding }}
          style={({ pressed }) => [s.addBtn, pressed && s.pressed]}
        >
          <Ionicons name={adding ? 'close' : 'add'} size={18} color={colors.onPrimary} />
          <Text style={s.addBtnText}>{adding ? 'Annuleren' : 'Speler toevoegen'}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {adding ? (
        <Card>
          <Text style={t.sectionLabel}>Naam</Text>
          <View style={s.nameRow}>
            <TextInput
              value={form.first_name}
              onChangeText={(v) => setForm((f) => ({ ...f, first_name: v }))}
              placeholder="Voornaam"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Voornaam"
              style={[s.input, s.flex]}
            />
            <TextInput
              value={form.infix ?? ''}
              onChangeText={(v) => setForm((f) => ({ ...f, infix: v }))}
              placeholder="van der"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Tussenvoegsel"
              style={[s.input, s.infix]}
            />
          </View>
          <TextInput
            value={form.last_name}
            onChangeText={(v) => setForm((f) => ({ ...f, last_name: v }))}
            placeholder="Achternaam"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Achternaam"
            style={s.input}
          />

          <Text style={[t.sectionLabel, s.spaced]}>Niveau</Text>
          <View style={s.chips}>
            {LEVELS.map((lv) => (
              <Pressable
                key={lv}
                onPress={() =>
                  setForm((f) => ({ ...f, skill_level: f.skill_level === lv ? null : lv }))
                }
                accessibilityRole="radio"
                accessibilityState={{ selected: form.skill_level === lv }}
                accessibilityLabel={`Niveau ${lv}`}
                style={[s.chip, form.skill_level === lv && s.chipOn]}
              >
                <Text style={[s.chipText, form.skill_level === lv && s.chipTextOn]}>{lv}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[t.sectionLabel, s.spaced]}>Geslacht</Text>
          <View style={s.chips}>
            {GENDERS.map((g) => (
              <Pressable
                key={g.value}
                onPress={() =>
                  setForm((f) => ({ ...f, gender: f.gender === g.value ? null : g.value }))
                }
                accessibilityRole="radio"
                accessibilityState={{ selected: form.gender === g.value }}
                accessibilityLabel={g.label}
                style={[s.chip, form.gender === g.value && s.chipOn]}
              >
                <Text style={[s.chipText, form.gender === g.value && s.chipTextOn]}>
                  {g.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[t.sectionLabel, s.spaced]}>Vereniging</Text>
          <TextInput
            value={form.club ?? ''}
            onChangeText={(v) => setForm((f) => ({ ...f, club: v }))}
            placeholder="KV Eendracht"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Vereniging"
            style={s.input}
          />

          <Pressable
            onPress={() => void create()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Speler opslaan"
            style={({ pressed }) => [s.saveBtn, pressed && s.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.addBtnText}>Opslaan</Text>
            )}
          </Pressable>
        </Card>
      ) : null}

      <SectionHeader title={`${filtered.length} spelers`} />

      {filtered.length === 0 ? (
        <EmptyState title="Geen spelers gevonden" hint="Pas je zoekopdracht aan." />
      ) : (
        filtered.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/admin/speler/${p.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${p.display_name}, details openen`}
            style={({ pressed }) => [pressed && s.pressed]}
          >
            <Card>
              <View style={s.row}>
                <View style={s.flex}>
                  <Text style={t.cardTitle}>{p.display_name}</Text>
                  <Text style={t.meta}>
                    {[
                      p.skill_level ? `Niveau ${p.skill_level}` : null,
                      p.gender === 'dame' ? 'Vrouw' : p.gender === 'heer' ? 'Man' : p.gender,
                      p.club,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Geen aanvullende gegevens'}
                  </Text>
                </View>
                {!p.is_active ? (
                  <View style={s.inactive}>
                    <Text style={s.inactiveText}>Inactief</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 800, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  search: {
    ...t.body,
    flex: 1,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  addBtnText: { ...t.button, color: colors.onPrimary },
  saveBtn: {
    minHeight: MIN_TOUCH + 6,
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    color: colors.text,
  },
  nameRow: { flexDirection: 'row', gap: spacing.sm },
  infix: { flexGrow: 0, flexBasis: 92 },
  spaced: { marginTop: spacing.md },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    minHeight: 36,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...t.button, fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: colors.onPrimary },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inactive: {
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  inactiveText: { ...t.chip, color: colors.onNeutralChip },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
