import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { games } from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { Loading, ErrorState } from '../../../src/components/ui';
import { colors, spacing, radii, SCORE_TOUCH, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t, tabular } from '../../../src/theme/typography';

/**
 * Field score entry.
 *
 * This screen is operated one-handed, outdoors, often in poor weather, by a volunteer
 * who is also watching the partij. Everything about it follows from that: 88 pt targets
 * rather than the 44 pt minimum, an 88 pt score, a confirmation step before anything is
 * written, and a local draft so a closed app loses nothing.
 *
 * MAX_EERSTEN is 6 — a partij is won at six eersten.
 */
const MAX_EERSTEN = 6;

type Side = 'red' | 'white';

export default function ScoreEntry() {
  const { matchId, roundId } = useLocalSearchParams<{ matchId: string; roundId?: string }>();
  const router = useRouter();

  const [red, setRed] = useState(0);
  const [white, setWhite] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * One id per entry session, reused on every retry.
   *
   * This is what makes a resend safe after the connection drops at the pitch: the
   * database's unique constraint turns the second write into a no-op returning the
   * first result, instead of a duplicate. Regenerating it per attempt would defeat the
   * whole mechanism.
   */
  const mutationId = useRef(
    globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
  );

  const load = useCallback(async () => {
    if (!roundId) return null;
    const detail = await games.round(roundId);
    return detail.matches.find((m) => m.id === matchId) ?? null;
  }, [roundId, matchId]);
  const state = useAsync(load, [roundId, matchId]);

  const draftKey = `uitslag-concept-${matchId}`;
  // Narrowed once here so the effects below can depend on it directly; referencing
  // state.data inside a deps array does not typecheck against the loading variant.
  const loaded = state.phase === 'ready' ? state.data : null;

  // Restore a draft, or seed from an already-entered result.
  useEffect(() => {
    if (!loaded) return;
    const match = loaded;
    (async () => {
      const raw = await AsyncStorage.getItem(draftKey).catch(() => null);
      if (raw) {
        try {
          const d = JSON.parse(raw) as { red: number; white: number };
          setRed(d.red);
          setWhite(d.white);
          return;
        } catch {
          /* corrupt draft — fall through to the stored result */
        }
      }
      setRed(match.eersten_red ?? 0);
      setWhite(match.eersten_white ?? 0);
    })();
  }, [loaded, draftKey]);

  // Autosave. Cheap insurance against a backgrounded app on a cold evening.
  useEffect(() => {
    if (!loaded) return;
    void AsyncStorage.setItem(draftKey, JSON.stringify({ red, white })).catch(() => undefined);
  }, [red, white, draftKey, loaded]);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const match = loaded;
  if (!match) {
    return <ErrorState message="Partij niet gevonden." onRetry={state.reload} />;
  }

  const winner: Side | null = red >= MAX_EERSTEN ? 'red' : white >= MAX_EERSTEN ? 'white' : null;
  const canSave = winner !== null;

  function adjust(side: Side, delta: number) {
    setError(null);
    const setter = side === 'red' ? setRed : setWhite;
    const current = side === 'red' ? red : white;
    const next = Math.min(MAX_EERSTEN, Math.max(0, current + delta));
    setter(next);
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await games.enterResult(matchId, { eersten_red: red, eersten_white: white }, mutationId.current);
      await AsyncStorage.removeItem(draftKey).catch(() => undefined);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt.');
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  function askConfirm() {
    if (!canSave) return;
    const summary = `Partuur ${match!.red_no} — ${red} · ${white} — Partuur ${match!.white_no}`;
    // Native gets a system dialog; web has no Alert, so an inline confirm bar is shown.
    if (Platform.OS === 'web') {
      setConfirming(true);
      return;
    }
    Alert.alert('Uitslag bevestigen', summary, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Opslaan', onPress: () => void save() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.matchLabel}>Partij {match.match_no}</Text>

      <ScoreSide
        label={`Partuur ${match.red_no}`}
        players={match.red_players}
        value={red}
        side="red"
        isWinner={winner === 'red'}
        serves
        onAdjust={(d) => adjust('red', d)}
      />

      <ScoreSide
        label={`Partuur ${match.white_no}`}
        players={match.white_players}
        value={white}
        side="white"
        isWinner={winner === 'white'}
        onAdjust={(d) => adjust('white', d)}
      />

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {!canSave ? (
        <Text style={s.hint}>
          Een partij is afgelopen bij {MAX_EERSTEN} eersten. Verhoog de stand om op te slaan.
        </Text>
      ) : null}

      {confirming ? (
        <View style={s.confirm}>
          <Text style={s.confirmText}>
            Partuur {match.red_no} — {red} · {white} — Partuur {match.white_no}. Opslaan?
          </Text>
          <View style={s.confirmRow}>
            <Pressable
              onPress={() => setConfirming(false)}
              accessibilityRole="button"
              accessibilityLabel="Annuleren"
              style={[s.confirmBtn, s.confirmCancel]}
            >
              <Text style={s.confirmCancelText}>Annuleren</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              accessibilityRole="button"
              accessibilityLabel="Opslaan bevestigen"
              style={[s.confirmBtn, s.confirmOk]}
            >
              <Text style={s.confirmOkText}>Opslaan</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={askConfirm}
          disabled={!canSave || saving}
          accessibilityRole="button"
          accessibilityLabel="Uitslag opslaan"
          accessibilityState={{ disabled: !canSave || saving }}
          style={({ pressed }) => [s.save, (!canSave || saving) && s.saveDisabled, pressed && s.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={s.saveText}>Uitslag opslaan</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

function ScoreSide({
  label,
  players,
  value,
  side,
  isWinner,
  serves,
  onAdjust,
}: {
  label: string;
  players: string | null;
  value: number;
  side: Side;
  isWinner: boolean;
  serves?: boolean;
  onAdjust: (delta: number) => void;
}) {
  return (
    <View style={[s.side, side === 'red' ? s.sideRed : s.sideWhite, isWinner && s.sideWinner]}>
      <View style={s.sideHeader}>
        <View style={s.flex}>
          <View style={s.labelRow}>
            <Text style={s.sideLabel}>{label}</Text>
            {serves ? (
              <View style={s.serveBadge}>
                <Text style={s.serveText}>Opslag</Text>
              </View>
            ) : null}
          </View>
          {players ? (
            <Text style={s.sidePlayers} numberOfLines={2}>
              {players}
            </Text>
          ) : null}
        </View>
        {isWinner ? <Ionicons name="trophy" size={20} color={colors.accent} /> : null}
      </View>

      <View style={s.scoreRow}>
        <Pressable
          onPress={() => onAdjust(-1)}
          disabled={value === 0}
          accessibilityRole="button"
          accessibilityLabel={`Eersten ${label} verlagen`}
          style={({ pressed }) => [s.stepper, value === 0 && s.stepperDisabled, pressed && s.pressed]}
        >
          <Ionicons name="remove" size={34} color={colors.onSport} />
        </Pressable>

        <Text style={s.score} accessibilityLabel={`${value} eersten`}>
          {value}
        </Text>

        <Pressable
          onPress={() => onAdjust(1)}
          disabled={value >= MAX_EERSTEN}
          accessibilityRole="button"
          accessibilityLabel={`Eersten ${label} verhogen`}
          style={({ pressed }) => [
            s.stepper,
            value >= MAX_EERSTEN && s.stepperDisabled,
            pressed && s.pressed,
          ]}
        >
          <Ionicons name="add" size={34} color={colors.onSport} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, gap: spacing.md },
  flex: { flex: 1 },
  matchLabel: { ...t.sectionLabel, textAlign: 'center' },

  side: { borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  // The red side is the club colour cue for "serves first"; white is the neutral side.
  sideRed: { backgroundColor: colors.sport },
  sideWhite: { backgroundColor: colors.sportRaised },
  sideWinner: { borderWidth: 2, borderColor: colors.accent },

  sideHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sideLabel: { ...t.cardTitle, color: colors.onSport },
  sidePlayers: { ...t.meta, color: colors.onSportMuted, marginTop: 2 },
  serveBadge: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  serveText: { ...t.chip, color: colors.onAccentSoft },

  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: {
    width: SCORE_TOUCH,
    height: SCORE_TOUCH,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: { opacity: 0.3 },
  pressed: { opacity: 0.7 },

  score: {
    ...tabular,
    fontSize: SCORE_TOUCH,
    lineHeight: SCORE_TOUCH + 6,
    fontWeight: '800',
    color: colors.onSport,
    minWidth: 96,
    textAlign: 'center',
  },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
  hint: { ...t.meta, textAlign: 'center' },

  save: {
    minHeight: MIN_TOUCH + 12,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...t.button, color: colors.onPrimary, fontSize: 16 },

  confirm: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmText: { ...t.body, color: colors.onAccentSoft },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmBtn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancel: { backgroundColor: colors.card },
  confirmCancelText: { ...t.button, color: colors.text },
  confirmOk: { backgroundColor: colors.primary },
  confirmOkText: { ...t.button, color: colors.onPrimary },
});
