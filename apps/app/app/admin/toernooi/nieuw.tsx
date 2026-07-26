import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { tournaments, SYSTEM_LABELS, FORMATION_LABELS } from '../../../src/lib/api';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { DateField } from '../../../src/components/DateField';
import { Card, SectionHeader } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t } from '../../../src/theme/typography';

/**
 * Stap 1 and 2 — creating a wedstrijd.
 *
 * Creation stops here on purpose. Between stap 2 and stap 3 sits the registration
 * period: participants sign themselves up, and an admin fills any gaps. Drawing only
 * makes sense once that window has closed, so stap 3 to 5 live on their own screen
 * behind the deadline.
 *
 * The wedstrijd is published and registration opened in the same action — a draft
 * nobody can register for is not a useful state to leave someone in.
 */

const SYSTEMS = ['knockout', 'knockout_consolation', 'poule', 'sneker'] as const;

/** The club's three categories. Older ones still render but are not offered. */
const FORMATIONS = ['vrije_formatie', 'del', 'pearke'] as const;

type Step = 1 | 2;

export default function NieuweWedstrijd() {
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState('');
  const [location, setLocation] = useState('Sportpark De Eendracht');
  const [deadline, setDeadline] = useState('');

  const [system, setSystem] = useState<(typeof SYSTEMS)[number]>('knockout');
  const [formation, setFormation] = useState<(typeof FORMATIONS)[number]>('del');

  const canContinue = name.trim().length >= 3 && playedOn !== '';

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await tournaments.create({
        name: name.trim(),
        played_on: playedOn,
        location: location.trim() || null,
        match_system: system,
        formation_category: formation,
      });

      // Publishing and opening registration together: the deadline defaults to the day
      // before the wedstrijd at 20:00 when none is given, which is the club's habit.
      const iso = deadline
        ? `${deadline}T20:00:00+01:00`
        : `${playedOn}T00:00:00+01:00`;
      await tournaments.openRegistration(created.id, iso);

      router.replace(`/toernooi/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aanmaken mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.steps}>
        {([1, 2] as const).map((n) => (
          <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]}>
            <Text style={[s.stepText, step >= n && s.stepTextActive]}>{n}</Text>
          </View>
        ))}
        <Text style={s.stepsNote}>Loten gebeurt later, na de inschrijving</Text>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {step === 1 ? (
        <>
          <SectionHeader title="Stap 1 · Basisgegevens" />
          <Card>
            <Text style={t.sectionLabel}>Naam</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="bijv. Najaarspartij 2026"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Naam van de wedstrijd"
              style={s.input}
            />

            <View style={s.spaced}>
              <DateField
                label="Datum"
                value={playedOn}
                onChange={setPlayedOn}
                accessibilityLabel="Datum van de wedstrijd"
              />
            </View>

            <Text style={[t.sectionLabel, s.spaced]}>Locatie</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Sportpark De Eendracht"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Locatie"
              style={s.input}
            />

            <View style={s.spaced}>
              <DateField
                label="Inschrijving sluit"
                value={deadline}
                onChange={setDeadline}
                accessibilityLabel="Sluitingsdatum van de inschrijving"
              />
              <Text style={s.note}>
                Om 20:00 uur op die dag. Laat leeg om te sluiten op de wedstrijddag zelf.
              </Text>
            </View>
          </Card>

          <Pressable
            onPress={() => setStep(2)}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityLabel="Volgende"
            accessibilityState={{ disabled: !canContinue }}
            style={({ pressed }) => [
              s.btn,
              s.btnPrimary,
              !canContinue && s.btnDisabled,
              pressed && s.pressed,
            ]}
          >
            <Text style={s.btnPrimaryText}>Volgende</Text>
          </Pressable>
        </>
      ) : (
        <>
          <SectionHeader title="Stap 2 · Wedstrijdvorm" />
          <Card>
            <Text style={t.sectionLabel}>Wedstrijdvorm</Text>
            {SYSTEMS.map((sys) => (
              <Choice
                key={sys}
                label={SYSTEM_LABELS[sys] ?? sys}
                selected={system === sys}
                onPress={() => setSystem(sys)}
              />
            ))}
          </Card>

          <Card>
            <Text style={t.sectionLabel}>Formatiecategorie</Text>
            {FORMATIONS.map((f) => (
              <Choice
                key={f}
                label={FORMATION_LABELS[f] ?? f}
                selected={formation === f}
                onPress={() => setFormation(f)}
              />
            ))}
            <Text style={s.note}>
              {formation === 'del'
                ? 'Deelnemers schrijven zich individueel in en worden later door elkaar geloot.'
                : 'Deelnemers schrijven zich in als compleet partuur.'}
            </Text>
          </Card>

          <View style={s.row}>
            <Pressable
              onPress={() => setStep(1)}
              accessibilityRole="button"
              accessibilityLabel="Vorige"
              style={({ pressed }) => [s.btn, s.btnGhost, pressed && s.pressed]}
            >
              <Text style={s.btnGhostText}>Vorige</Text>
            </Pressable>
            <Pressable
              onPress={() => void create()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Wedstrijd aanmaken en inschrijving openen"
              style={({ pressed }) => [s.btn, s.btnPrimary, busy && s.btnDisabled, pressed && s.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={s.btnPrimaryText}>Aanmaken &amp; openstellen</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [s.choice, pressed && s.pressed]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.primary : colors.textMuted}
      />
      <Text style={[t.body, s.flex]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  steps: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepText: { ...t.tableNumLead, color: colors.textMuted },
  stepTextActive: { color: colors.onPrimary },
  stepsNote: { ...t.meta, marginLeft: spacing.sm },

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
  spaced: { marginTop: spacing.md },
  note: { ...t.meta, marginTop: spacing.sm, fontStyle: 'italic' },

  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },

  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
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
