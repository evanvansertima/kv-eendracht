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
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games, tournaments, SYSTEM_LABELS, FORMATION_LABELS, type DrawPreview } from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { Card, SectionHeader, Loading, ErrorState } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t } from '../../../src/theme/typography';

/**
 * Tournament builder.
 *
 * Four steps, per KV-EENDRACHT-APP-SPEC section 6: basics, format, participants, draw.
 *
 * The draw runs on the server via draw-preview so the wizard shows exactly what publish
 * will persist — same function, same seed. "Opnieuw loten" mints a new seed rather than
 * reshuffling, which is what keeps the published draw reproducible afterwards.
 */

const SYSTEMS = ['knockout', 'knockout_consolation', 'poule', 'sneker'] as const;
const DRAWABLE = ['del', 'del_abc', 'twee_tegen_twee', 'pearke'] as const;

type Step = 1 | 2 | 3 | 4;

export default function TournamentWizard() {
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState('');
  const [playedOn, setPlayedOn] = useState('');
  const [location, setLocation] = useState('');
  // Step 2
  const [system, setSystem] = useState<(typeof SYSTEMS)[number]>('knockout');
  const [formation, setFormation] = useState<(typeof DRAWABLE)[number]>('del');
  // Step 3
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Step 4
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 2 ** 31));
  const [preview, setPreview] = useState<DrawPreview | null>(null);

  const loadPlayers = useCallback(() => games.players(), []);
  const playersState = useAsync(loadPlayers, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Creates the draft if needed, then draws. Both steps are needed before a preview. */
  async function runDraw(withSeed: number) {
    setBusy(true);
    setError(null);
    try {
      let id = tournamentId;
      if (!id) {
        const created = await tournaments.create({
          name: name.trim(),
          played_on: playedOn.trim(),
          location: location.trim() || null,
          match_system: system,
          formation_category: formation,
        });
        id = created.id;
        setTournamentId(id);
      }
      const p = await tournaments.preview(id, withSeed, [...selected]);
      setPreview(p);
      setSeed(withSeed);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loten mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!tournamentId || !preview) return;
    setBusy(true);
    setError(null);
    try {
      await tournaments.publish(
        tournamentId,
        seed,
        [...selected],
        preview.teams.map((x) => ({ team_no: x.team_no, player_ids: x.players.map((p) => p.id) })),
      );
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publiceren mislukt.');
    } finally {
      setBusy(false);
    }
  }

  if (playersState.phase === 'loading') return <Loading />;
  if (playersState.phase === 'error')
    return <ErrorState message={playersState.message} onRetry={playersState.reload} />;

  const players = playersState.data.filter((p) => p.is_active);
  const canStep2 = name.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(playedOn.trim());
  const canStep4 = selected.size >= 4;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.steps}>
        {([1, 2, 3, 4] as const).map((n) => (
          <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]}>
            <Text style={[s.stepText, step >= n && s.stepTextActive]}>{n}</Text>
          </View>
        ))}
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
              accessibilityLabel="Naam van het toernooi"
              style={s.input}
            />
            <Text style={[t.sectionLabel, s.spaced]}>Datum</Text>
            <TextInput
              value={playedOn}
              onChangeText={setPlayedOn}
              placeholder="2026-09-12"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Datum, jaar maand dag"
              style={s.input}
            />
            <Text style={[t.sectionLabel, s.spaced]}>Locatie</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Sportpark De Eendracht"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Locatie"
              style={s.input}
            />
          </Card>
          <Next label="Volgende" disabled={!canStep2} onPress={() => setStep(2)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <SectionHeader title="Stap 2 · Wedstrijdvorm" />
          <Card>
            <Text style={t.sectionLabel}>Wedstrijdsysteem</Text>
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
            {DRAWABLE.map((f) => (
              <Choice
                key={f}
                label={FORMATION_LABELS[f] ?? f}
                selected={formation === f}
                onPress={() => setFormation(f)}
              />
            ))}
            <Text style={s.note}>
              Vrije formatie wordt handmatig samengesteld en staat daarom niet in deze lijst.
            </Text>
          </Card>
          <Row>
            <Back onPress={() => setStep(1)} />
            <Next label="Volgende" onPress={() => setStep(3)} />
          </Row>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <SectionHeader title={`Stap 3 · Deelnemers (${selected.size})`} />
          <Card>
            {players.map((p) => {
              const on = selected.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={p.display_name}
                  style={({ pressed }) => [s.playerRow, pressed && s.pressed]}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.primary : colors.textMuted}
                  />
                  <Text style={[t.body, s.flex]}>{p.display_name}</Text>
                  {p.skill_level ? <Text style={s.level}>{p.skill_level}</Text> : null}
                </Pressable>
              );
            })}
          </Card>
          <Row>
            <Back onPress={() => setStep(2)} />
            <Next
              label={busy ? 'Loten…' : 'Loten'}
              disabled={!canStep4 || busy}
              onPress={() => void runDraw(seed)}
            />
          </Row>
        </>
      ) : null}

      {step === 4 && preview ? (
        <>
          <SectionHeader title="Stap 4 · Loting" />
          <Card>
            <Text style={t.meta}>Seed {preview.seed}</Text>
            {preview.messages.map((m) => (
              <Text key={m} style={t.meta}>
                {m}
              </Text>
            ))}
          </Card>

          {preview.teams.map((team) => (
            <View key={team.team_no} style={s.teamCard}>
              <Text style={s.teamNo}>Partuur {team.team_no}</Text>
              {team.players.map((p) => (
                <Text key={p.id} style={s.teamPlayer}>
                  {p.display_name}
                </Text>
              ))}
            </View>
          ))}

          {preview.reserves.length > 0 ? (
            <>
              <SectionHeader title="Reserve" />
              <Card>
                {preview.reserves.map((r) => (
                  <View key={r.id} style={s.reserveRow}>
                    <Text style={t.cardTitle}>{r.display_name}</Text>
                    <Text style={t.meta}>{r.reason}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Row>
            <Pressable
              onPress={() => void runDraw(Math.floor(Math.random() * 2 ** 31))}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Opnieuw loten"
              style={({ pressed }) => [s.btn, s.btnGhost, pressed && s.pressed]}
            >
              <Text style={s.btnGhostText}>Opnieuw loten</Text>
            </Pressable>
            <Pressable
              onPress={() => void publish()}
              disabled={busy || !preview.ok}
              accessibilityRole="button"
              accessibilityLabel="Publiceren"
              style={({ pressed }) => [
                s.btn,
                s.btnPrimary,
                (busy || !preview.ok) && s.btnDisabled,
                pressed && s.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={s.btnPrimaryText}>Publiceren</Text>
              )}
            </Pressable>
          </Row>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

function Next({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.btn, s.btnPrimary, disabled && s.btnDisabled, pressed && s.pressed]}
    >
      <Text style={s.btnPrimaryText}>{label}</Text>
    </Pressable>
  );
}

function Back({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Vorige"
      style={({ pressed }) => [s.btn, s.btnGhost, pressed && s.pressed]}
    >
      <Text style={s.btnGhostText}>Vorige</Text>
    </Pressable>
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
  pageWide: { maxWidth: 760, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  steps: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginBottom: spacing.md },
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
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH },
  level: {
    ...t.chip,
    color: colors.onNeutralChip,
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    overflow: 'hidden',
  },

  teamCard: {
    backgroundColor: colors.sportRaised,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  teamNo: { ...t.sectionLabel, color: colors.onSportMuted },
  teamPlayer: { ...t.tableName, color: colors.onSport, marginTop: 2 },
  reserveRow: { marginBottom: spacing.sm },

  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
