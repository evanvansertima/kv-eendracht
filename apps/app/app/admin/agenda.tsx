import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { agendaAdmin, type AdminAgendaEvent } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatEventMoment } from '../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Free text plus suggestions, so a new category never needs a migration.
 *
 * Kept in step with the filter on the public agenda: offering a type there that the
 * filter cannot show would hide the event from everyone browsing by category.
 */
const TYPES = ['Competitie', 'Wedstrijd', 'Training'];

export default function AgendaBeheer() {
  const { isWide } = useBreakpoint();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [type, setType] = useState(TYPES[0]!);
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const load = useCallback(() => agendaAdmin.list(), []);
  const state = useAsync(load, []);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Actie mislukt.');
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || !/^\d{2}:\d{2}$/.test(time.trim())) {
      setError('Vul een geldige datum (JJJJ-MM-DD) en tijd (UU:MM) in.');
      return;
    }
    // Amsterdam is UTC+2 in summer and +1 in winter; building the offset from the local
    // date rather than hard-coding it keeps a winter event at the right clock time.
    const local = new Date(`${date.trim()}T${time.trim()}:00`);
    const offsetMin = -local.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
    const iso = `${date.trim()}T${time.trim()}:00${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;

    await act('create', async () => {
      await agendaAdmin.create({
        title: title.trim(),
        starts_at: iso,
        event_type: type,
        location: location.trim() || null,
        image_url: imageUrl.trim() || null,
        is_published: true,
      });
      setAdding(false);
      setTitle('');
      setDate('');
      setLocation('');
      setImageUrl('');
    });
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {adding ? (
        <Card>
          <Text style={t.cardTitle}>Nieuwe activiteit</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Titel"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Titel"
            style={s.input}
          />
          <View style={s.rowGap}>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="2026-09-12"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Datum"
              style={[s.input, s.flex]}
            />
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="19:00"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Tijd"
              style={[s.input, s.time]}
            />
          </View>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Locatie"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Locatie"
            style={s.input}
          />
          <TextInput
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="Afbeelding-URL (optioneel)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            accessibilityLabel="Afbeelding-URL"
            style={s.input}
          />
          <View style={s.chips}>
            {TYPES.map((ty) => (
              <Pressable
                key={ty}
                onPress={() => setType(ty)}
                accessibilityRole="radio"
                accessibilityState={{ selected: type === ty }}
                accessibilityLabel={ty}
                style={[s.chip, type === ty && s.chipOn]}
              >
                <Text style={[s.chipText, type === ty && s.chipTextOn]}>{ty}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.rowGap}>
            <Pressable
              onPress={() => setAdding(false)}
              accessibilityRole="button"
              accessibilityLabel="Annuleren"
              style={[s.btn, s.btnGhost]}
            >
              <Text style={s.btnGhostText}>Annuleren</Text>
            </Pressable>
            <Pressable
              onPress={() => void create()}
              disabled={title.trim().length < 3 || busy === 'create'}
              accessibilityRole="button"
              accessibilityLabel="Opslaan"
              style={[s.btn, s.btnPrimary, title.trim().length < 3 && s.btnDisabled]}
            >
              {busy === 'create' ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={s.btnPrimaryText}>Opslaan</Text>
              )}
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel="Activiteit toevoegen"
          style={({ pressed }) => [s.btn, s.btnPrimary, pressed && s.pressed]}
        >
          <Text style={s.btnPrimaryText}>Activiteit toevoegen</Text>
        </Pressable>
      )}

      <SectionHeader title={`${state.data.length} activiteiten`} />
      {state.data.length === 0 ? (
        <EmptyState title="Nog geen activiteiten" />
      ) : (
        state.data.map((e: AdminAgendaEvent) => (
          <Card key={e.id}>
            <View style={s.itemRow}>
              <View style={s.flex}>
                <Text style={t.cardTitle}>{e.title}</Text>
                <Text style={t.meta}>
                  {formatEventMoment(e.starts_at)}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  void act(e.id, () => agendaAdmin.update(e.id, { is_published: !e.is_published }))
                }
                accessibilityRole="switch"
                accessibilityState={{ checked: e.is_published }}
                accessibilityLabel={e.is_published ? 'Depubliceren' : 'Publiceren'}
                style={[s.pill, e.is_published ? s.pillOn : s.pillOff]}
              >
                <Text style={e.is_published ? s.pillOnText : s.pillOffText}>
                  {e.is_published ? 'Zichtbaar' : 'Concept'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void act(e.id, () => agendaAdmin.remove(e.id))}
                accessibilityRole="button"
                accessibilityLabel={`${e.title} verwijderen`}
                style={s.iconBtn}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={18} color={colors.loss} />
              </Pressable>
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
  pressed: { opacity: 0.75 },

  input: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    color: colors.text,
  },
  time: { flexGrow: 0, flexBasis: 96 },
  rowGap: { flexDirection: 'row', gap: spacing.sm },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...t.button, fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: colors.onPrimary },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full },
  pillOn: { backgroundColor: colors.primarySoft },
  pillOff: { backgroundColor: colors.neutralChip },
  pillOnText: { ...t.chip, color: colors.primary },
  pillOffText: { ...t.chip, color: colors.onNeutralChip },
  iconBtn: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...t.button, color: colors.onPrimary },
  btnGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  btnGhostText: { ...t.button, color: colors.text },
  btnDisabled: { opacity: 0.45 },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
