import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games, type AdminPlayer, type Round } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Loten — building parturen for a speelronde.
 *
 * Five modes, each answering a different question:
 *
 *   Willekeurig  everyone together, regardless of level, gender or ranking
 *   Niveau       one A, one B and one C per partuur
 *   Mannen       only male players take part
 *   Vrouwen      only female players take part
 *   Ranking      players of comparable competition standing face each other
 *
 * Mannen and Vrouwen narrow *who plays*; the pairing within them is still random. The
 * others decide *how* the field is paired.
 *
 * After drawing, the beheerder can always move players between parturen. A moved
 * line-up is published with manual=true, which skips seed verification on the server —
 * the seed no longer reproduces it, and pretending otherwise would make the stored seed
 * a lie.
 */

const MODES = [
  { id: 'willekeurig', label: 'Willekeurig', hint: 'Iedereen door elkaar, ongeacht niveau, geslacht of ranking.' },
  { id: 'niveau', label: 'Niveau', hint: 'Elk partuur krijgt één A-, één B- en één C-speler.' },
  { id: 'mannen', label: 'Mannen', hint: 'Alleen mannen doen mee; vrouwen vallen af.' },
  { id: 'vrouwen', label: 'Vrouwen', hint: 'Alleen vrouwen doen mee; mannen vallen af.' },
  { id: 'ranking', label: 'Ranking', hint: 'Spelers met een vergelijkbare competitiestand tegen elkaar.' },
] as const;

type Mode = (typeof MODES)[number]['id'];
type Partuur = { team_no: number; player_ids: string[] };

export default function Loten() {
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('willekeurig');
  const [roundId, setRoundId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [parturen, setParturen] = useState<Partuur[] | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [players, competitions] = await Promise.all([games.players(), games.competitions()]);
    const active = competitions[0];
    const rounds: Round[] = active ? await games.rounds(active.id) : [];
    return { players: players.filter((p) => p.is_active), rounds: rounds.filter((r) => r.status === 'open') };
  }, []);
  const state = useAsync(load, []);

  const byId = useMemo(() => {
    if (state.phase !== 'ready') return new Map<string, AdminPlayer>();
    return new Map(state.data.players.map((p) => [p.id, p]));
  }, [state]);

  function toggle(id: string) {
    setParturen(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function draw(withSeed: number) {
    if (!roundId) {
      setError('Kies eerst een speelronde.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await games.drawRound(roundId, withSeed, [...selected], mode);
      setParturen(res.parturen);
      setMessages(res.messages);
      setSeed(withSeed);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loten mislukt.');
    } finally {
      setBusy(false);
    }
  }

  /** Moves a player into another partuur, keeping every partuur non-empty. */
  function movePlayer(playerId: string, toTeamNo: number) {
    setParturen((cur) => {
      if (!cur) return cur;
      const next = cur.map((p) => ({ ...p, player_ids: p.player_ids.filter((x) => x !== playerId) }));
      const target = next.find((p) => p.team_no === toTeamNo);
      target?.player_ids.push(playerId);
      return next.filter((p) => p.player_ids.length > 0);
    });
    setMoving(null);
    setDirty(true);
  }

  async function publish() {
    if (!roundId || !parturen) return;
    setBusy(true);
    setError(null);
    try {
      await games.publishDraw(roundId, seed, [...selected], parturen, dirty);
      router.replace('/admin/competitie');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publiceren mislukt.');
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { players, rounds } = state.data;
  const active = MODES.find((m) => m.id === mode)!;

  // Mirrors the server's filter, so the count shown matches what will actually be drawn.
  const eligible = players.filter((p) =>
    mode === 'mannen' ? p.gender === 'heer' : mode === 'vrouwen' ? p.gender === 'dame' : true,
  );
  const selectedEligible = [...selected].filter((id) => eligible.some((p) => p.id === id));

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <SectionHeader title="Speelronde" />
      {rounds.length === 0 ? (
        <EmptyState title="Geen open speelronde" hint="Maak eerst een speelronde aan." />
      ) : (
        <View style={s.chips}>
          {rounds.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setRoundId(r.id);
                setParturen(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: roundId === r.id }}
              accessibilityLabel={`Speelronde ${r.round_no}`}
              style={[s.chip, roundId === r.id && s.chipOn]}
            >
              <Text style={[s.chipText, roundId === r.id && s.chipTextOn]}>
                Ronde {r.round_no}
                {r.played_on ? ` · ${formatDate(r.played_on)}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <SectionHeader title="Indeling" />
      <View style={s.chips}>
        {MODES.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => {
              setMode(m.id);
              setParturen(null);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === m.id }}
            accessibilityLabel={m.label}
            style={[s.chip, mode === m.id && s.chipOn]}
          >
            <Text style={[s.chipText, mode === m.id && s.chipTextOn]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={s.hint}>{active.hint}</Text>

      <SectionHeader
        title={`Deelnemers · ${selectedEligible.length} van ${eligible.length}`}
      />
      <Card>
        <View style={s.bulkRow}>
          <Pressable
            onPress={() => {
              setParturen(null);
              setSelected(new Set(eligible.map((p) => p.id)));
            }}
            accessibilityRole="button"
            accessibilityLabel="Alles selecteren"
            style={s.bulkBtn}
          >
            <Text style={s.bulkText}>Alles</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setParturen(null);
              setSelected(new Set());
            }}
            accessibilityRole="button"
            accessibilityLabel="Selectie wissen"
            style={s.bulkBtn}
          >
            <Text style={s.bulkText}>Geen</Text>
          </Pressable>
        </View>

        {eligible.map((p) => {
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

      <Pressable
        onPress={() => void draw(Math.floor(Math.random() * 2 ** 31))}
        disabled={busy || !roundId || selectedEligible.length < 4}
        accessibilityRole="button"
        accessibilityLabel="Loten"
        style={({ pressed }) => [
          s.primaryBtn,
          (busy || !roundId || selectedEligible.length < 4) && s.disabled,
          pressed && s.pressed,
        ]}
      >
        {busy && !parturen ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={s.primaryBtnText}>{parturen ? 'Opnieuw loten' : 'Loten'}</Text>
        )}
      </Pressable>

      {parturen ? (
        <>
          <SectionHeader title={`Parturen · ${parturen.length}`} />
          {messages.map((m) => (
            <Text key={m} style={s.hint}>
              {m}
            </Text>
          ))}
          {dirty ? (
            <Text style={s.dirty}>
              Handmatig aangepast. De loting komt niet meer overeen met de seed; dat wordt
              zo opgeslagen.
            </Text>
          ) : null}

          {parturen.map((pt) => (
            <View key={pt.team_no} style={s.parturCard}>
              <Text style={s.parturNo}>Partuur {pt.team_no}</Text>
              {pt.player_ids.map((pid) => {
                const p = byId.get(pid);
                const isMoving = moving === pid;
                return (
                  <View key={pid}>
                    <Pressable
                      onPress={() => setMoving(isMoving ? null : pid)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p?.display_name ?? pid} verplaatsen`}
                      style={({ pressed }) => [s.parturPlayer, pressed && s.pressed]}
                    >
                      <Text style={s.parturName}>{p?.display_name ?? pid}</Text>
                      <Ionicons
                        name={isMoving ? 'close' : 'swap-horizontal'}
                        size={16}
                        color={colors.onSportMuted}
                      />
                    </Pressable>
                    {isMoving ? (
                      <View style={s.moveTargets}>
                        {parturen
                          .filter((other) => other.team_no !== pt.team_no)
                          .map((other) => (
                            <Pressable
                              key={other.team_no}
                              onPress={() => movePlayer(pid, other.team_no)}
                              accessibilityRole="button"
                              accessibilityLabel={`Verplaats naar partuur ${other.team_no}`}
                              style={s.moveTarget}
                            >
                              <Text style={s.moveTargetText}>naar {other.team_no}</Text>
                            </Pressable>
                          ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}

          <Pressable
            onPress={() => void publish()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Loting opslaan"
            style={({ pressed }) => [s.primaryBtn, busy && s.disabled, pressed && s.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.primaryBtnText}>Loting opslaan</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 820, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...t.button, fontSize: 13, color: colors.textMuted },
  chipTextOn: { color: colors.onPrimary },
  hint: { ...t.meta, marginTop: spacing.xs },
  dirty: { ...t.meta, color: colors.onAccentSoft, marginTop: spacing.xs },

  bulkRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  bulkBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  bulkText: { ...t.button, fontSize: 12, color: colors.textMuted },

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

  parturCard: {
    backgroundColor: colors.sportRaised,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  parturNo: { ...t.sectionLabel, color: colors.onSportMuted },
  parturPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH,
  },
  parturName: { ...t.tableName, color: colors.onSport },
  moveTargets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  moveTarget: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moveTargetText: { ...t.button, fontSize: 12, color: colors.onSport },

  primaryBtn: {
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryBtnText: { ...t.button, color: colors.onPrimary },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
