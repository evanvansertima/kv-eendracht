import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  games,
  inschrijving,
  tournaments,
  formatEuro,
  FORMATION_LABELS,
  type InschrijfSpeler,
} from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { Card, Loading, ErrorState } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Inschrijven voor een wedstrijd.
 *
 * Deliberately open to anyone: a partuur from another vereniging has no account here,
 * and requiring one loses entries.
 *
 * The number of speler slots follows the formatiecategorie — 2 for Pearke, 3 for Vrije
 * Formatie, 1 for D.E.L. where the loting forms parturen afterwards. Showing three boxes
 * for a Pearke would invite an entry the API then rejects.
 */

/** Mirrors PARTUUR_GROOTTE in the API; the server validates regardless. */
const SLOTS: Record<string, number> = {
  vrije_formatie: 3,
  vrije_formatie_beperkt: 3,
  del: 1,
  del_abc: 1,
  twee_tegen_twee: 2,
  pearke: 2,
};

export default function Inschrijven() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const [spelers, setSpelers] = useState<InschrijfSpeler[]>([]);
  const [naam, setNaam] = useState('');
  const [email, setEmail] = useState('');
  const [telefoon, setTelefoon] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One key for this form session, reused on every attempt.
   *
   * This is what makes a refresh, a double-tap, or a return from the payment page replay
   * the original registration instead of creating a second partuur. Regenerating it per
   * submit would defeat the entire mechanism.
   */
  const idempotencyKey = useRef(
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const load = useCallback(
    async () => ({
      detail: await tournaments.detail(id),
      spelers: await games.players().catch(() => []),
    }),
    [id],
  );
  const state = useAsync(load, [id]);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const w = state.data.detail.tournament;
  const slots = SLOTS[w.formation_category] ?? 3;
  const inleg = w.inleggeld_cents ?? null;

  // Slots are only ever grown to the required length here, never reset, so typing in
  // slot 2 does not clear slot 1.
  const rows: InschrijfSpeler[] = Array.from({ length: slots }, (_, i) => spelers[i] ?? {});

  function setSlot(i: number, value: InschrijfSpeler) {
    setSpelers((prev) => {
      const next = Array.from({ length: slots }, (_, k) => prev[k] ?? {});
      next[i] = value;
      return next;
    });
  }

  const compleet =
    rows.every((r) => (r.naam ?? '').trim().length >= 2 || r.player_id) &&
    naam.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(email) &&
    telefoon.trim().length >= 6;

  async function submit() {
    if (!compleet || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await inschrijving.create(id, {
        idempotency_key: idempotencyKey.current,
        spelers: rows.map((r) => ({ player_id: r.player_id ?? null, naam: r.naam ?? null })),
        aanmelder_naam: naam.trim(),
        aanmelder_email: email.trim(),
        aanmelder_telefoon: telefoon.trim(),
      });

      if (result.checkout_url) {
        // Hosted checkout: leave the app and come back. The webhook decides the outcome,
        // so returning without paying simply leaves the status pending.
        if (Platform.OS === 'web') {
          globalThis.location.href = result.checkout_url;
        } else {
          await Linking.openURL(result.checkout_url);
          router.replace(`/inschrijving/${result.partuur_group}`);
        }
        return;
      }

      router.replace(`/inschrijving/${result.partuur_group}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inschrijven mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>
          {w.played_on ? formatDate(w.played_on) : 'Datum volgt'}
        </Text>
        <Text style={s.heroTitle}>{w.name}</Text>
        <Text style={s.heroMeta}>
          {FORMATION_LABELS[w.formation_category] ?? w.formation_category}
          {' · Inleggeld '}
          {formatEuro(inleg)}
        </Text>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <Card>
        <Text style={t.sectionLabel}>
          {slots === 1 ? 'Speler' : `Partuur · ${slots} spelers`}
        </Text>
        {rows.map((row, i) => (
          <View key={i} style={s.slot}>
            <Text style={s.slotLabel}>Speler {i + 1}</Text>
            <TextInput
              value={row.naam ?? ''}
              onChangeText={(v) => setSlot(i, { naam: v })}
              placeholder="Voor- en achternaam"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`Naam van speler ${i + 1}`}
              style={s.input}
            />
          </View>
        ))}
        <Text style={s.note}>
          Staat een speler nog niet in de ledenlijst? Vul gewoon de naam in.
        </Text>
      </Card>

      <Card>
        <Text style={t.sectionLabel}>Aanmelder</Text>
        <Text style={s.note}>
          Wie schrijft dit partuur in? Deze gegevens zijn voor de inschrijving en hoeven
          niet van een speler te zijn.
        </Text>

        <TextInput
          value={naam}
          onChangeText={setNaam}
          placeholder="Naam aanmelder"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Naam aanmelder"
          style={s.input}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-mailadres"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          accessibilityLabel="E-mailadres"
          style={s.input}
        />
        <TextInput
          value={telefoon}
          onChangeText={setTelefoon}
          placeholder="Telefoonnummer"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          accessibilityLabel="Telefoonnummer"
          style={s.input}
        />
      </Card>

      {inleg !== null && inleg > 0 ? (
        <Card>
          <View style={s.betaalRow}>
            <Text style={t.cardTitle}>Inleggeld</Text>
            <Text style={s.bedrag}>{formatEuro(inleg)}</Text>
          </View>
          <Text style={s.note}>
            Je wordt na het inschrijven doorgestuurd om te betalen.
          </Text>
        </Card>
      ) : null}

      <Pressable
        onPress={() => void submit()}
        disabled={!compleet || busy}
        accessibilityRole="button"
        accessibilityLabel={
          inleg !== null && inleg > 0 ? 'Betalen via Weeztix' : 'Inschrijving versturen'
        }
        accessibilityState={{ disabled: !compleet || busy }}
        style={({ pressed }) => [
          s.submit,
          (!compleet || busy) && s.disabled,
          pressed && s.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <>
            <Ionicons
              name={inleg !== null && inleg > 0 ? 'card-outline' : 'checkmark-circle-outline'}
              size={18}
              color={colors.onPrimary}
            />
            <Text style={s.submitText}>
              {inleg !== null && inleg > 0 ? 'Betalen via Weeztix' : 'Inschrijving versturen'}
            </Text>
          </>
        )}
      </Pressable>

      {!compleet ? (
        <Text style={s.hint}>Vul alle spelers en je eigen gegevens in.</Text>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 640, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 26, lineHeight: 30 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  slot: { marginTop: spacing.sm },
  slotLabel: { ...t.meta, marginBottom: 2 },
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
  note: { ...t.meta, marginTop: spacing.sm, fontStyle: 'italic' },

  betaalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bedrag: { ...t.hero, fontSize: 22, lineHeight: 26, color: colors.text },

  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 10,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  submitText: { ...t.button, color: colors.onPrimary, fontSize: 16 },
  hint: { ...t.meta, textAlign: 'center', marginTop: spacing.sm },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
