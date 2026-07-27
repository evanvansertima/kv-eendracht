import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  inschrijving,
  tournaments,
  formatEuro,
  type BetaalStatus,
  type DeelnemerPartuur,
} from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { formatDateTime } from '../../../src/lib/dates';
import { Card, Loading, ErrorState, EmptyState } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t } from '../../../src/theme/typography';

/**
 * Deelnemerslijst — what a beheerder works with before the loting.
 *
 * Grouped by partuur rather than by speler, because a partuur is the unit that enters,
 * pays and plays. Every action here operates on that unit, except moving a single speler
 * between parturen, which is the one case that does not.
 */

const STATUSSEN: { value: BetaalStatus; label: string }[] = [
  { value: 'unpaid', label: 'Nog niet betaald' },
  { value: 'pending', label: 'In behandeling' },
  { value: 'paid', label: 'Betaald' },
  { value: 'failed', label: 'Mislukt' },
  { value: 'refunded', label: 'Terugbetaald' },
];

const STATUS_COLOUR: Record<BetaalStatus, string> = {
  paid: colors.gain,
  pending: colors.onAccentSoft,
  unpaid: colors.textMuted,
  failed: colors.loss,
  refunded: colors.textMuted,
};

export default function Deelnemerslijst() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useBreakpoint();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ registrationId: string; naam: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(
    async () => ({
      detail: await tournaments.detail(id),
      lijst: await inschrijving.deelnemers(id),
    }),
    [id],
  );
  const state = useAsync(load, [id]);

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

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { parturen } = state.data.lijst;
  const w = state.data.detail.tournament;

  const betaald = parturen.filter((p) => p.betaalstatus === 'paid').length;
  const bevestigd = parturen.filter((p) => p.bevestigd).length;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>{w.name}</Text>
        <Text style={s.heroTitle}>{parturen.length} parturen</Text>
        <Text style={s.heroMeta}>
          {betaald} betaald · {bevestigd} bevestigd · inleggeld {formatEuro(w.inleggeld_cents)}
        </Text>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {moving ? (
        <View style={s.movingBar}>
          <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
          <Text style={s.movingText}>
            {moving.naam} verplaatsen — kies een partuur, of maak een nieuw partuur.
          </Text>
          <Pressable
            onPress={() => setMoving(null)}
            accessibilityRole="button"
            accessibilityLabel="Verplaatsen annuleren"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {parturen.length === 0 ? (
        <EmptyState
          title="Nog geen inschrijvingen"
          hint="Zodra een partuur zich inschrijft, verschijnt het hier."
        />
      ) : (
        parturen.map((p, index) => (
          <PartuurKaart
            key={p.partuur_group}
            partuur={p}
            index={index}
            busy={busy}
            moving={moving}
            confirmDelete={confirmDelete === p.partuur_group}
            onStartMove={(registrationId, naam) => setMoving({ registrationId, naam })}
            onDropHere={() =>
              moving &&
              act(`move-${moving.registrationId}`, async () => {
                await inschrijving.moveSpeler(moving.registrationId, p.partuur_group);
                setMoving(null);
              })
            }
            onStatus={(status) =>
              act(`status-${p.partuur_group}`, () =>
                inschrijving.update(p.partuur_group, { betaalstatus: status }),
              )
            }
            onToggleBevestigd={() =>
              act(`bev-${p.partuur_group}`, () =>
                inschrijving.update(p.partuur_group, { bevestigd: !p.bevestigd }),
              )
            }
            onAskDelete={() => setConfirmDelete(p.partuur_group)}
            onCancelDelete={() => setConfirmDelete(null)}
            onDelete={() =>
              act(`del-${p.partuur_group}`, async () => {
                await inschrijving.remove(p.partuur_group);
                setConfirmDelete(null);
              })
            }
          />
        ))
      )}

      {moving ? (
        <Pressable
          onPress={() =>
            act(`new-${moving.registrationId}`, async () => {
              await inschrijving.moveSpeler(moving.registrationId, null);
              setMoving(null);
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Naar een nieuw partuur verplaatsen"
          style={({ pressed }) => [s.newPartuur, pressed && s.pressed]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={s.newPartuurText}>Naar een nieuw partuur</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PartuurKaart({
  partuur,
  index,
  busy,
  moving,
  confirmDelete,
  onStartMove,
  onDropHere,
  onStatus,
  onToggleBevestigd,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  partuur: DeelnemerPartuur;
  index: number;
  busy: string | null;
  moving: { registrationId: string; naam: string } | null;
  confirmDelete: boolean;
  onStartMove: (registrationId: string, naam: string) => void;
  onDropHere: () => void;
  onStatus: (s: BetaalStatus) => void;
  onToggleBevestigd: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const isTarget =
    moving !== null && !partuur.spelers.some((x) => x.registration_id === moving.registrationId);

  return (
    <Pressable
      onPress={() => (isTarget ? onDropHere() : undefined)}
      disabled={!isTarget}
      accessibilityRole={isTarget ? 'button' : undefined}
      accessibilityLabel={isTarget ? `Verplaats naar partuur ${index + 1}` : undefined}
      style={({ pressed }) => [isTarget && s.target, pressed && isTarget && s.pressed]}
    >
      <Card>
        <View style={s.cardHead}>
          <Text style={t.sectionLabel}>Partuur {index + 1}</Text>
          <View style={[s.chip, { backgroundColor: colors.neutralChip }]}>
            <Text style={[s.chipText, { color: STATUS_COLOUR[partuur.betaalstatus] }]}>
              {partuur.betaalstatus_label}
            </Text>
          </View>
        </View>

        {partuur.spelers.map((sp) => (
          <Pressable
            key={sp.registration_id}
            onPress={() => onStartMove(sp.registration_id, sp.naam)}
            accessibilityRole="button"
            accessibilityLabel={`${sp.naam} verplaatsen`}
            style={({ pressed }) => [s.spelerRow, pressed && s.pressed]}
          >
            <Ionicons name="reorder-three-outline" size={16} color={colors.textMuted} />
            <Text style={[t.body, s.flex]}>{sp.naam}</Text>
            {sp.niveau ? <Text style={s.niveau}>{sp.niveau}</Text> : null}
          </Pressable>
        ))}

        <View style={s.meta}>
          <Text style={t.meta}>
            Aanmelder: {partuur.aanmelder_naam ?? '—'}
            {partuur.aanmelder_telefoon ? ` · ${partuur.aanmelder_telefoon}` : ''}
          </Text>
          {partuur.aanmelder_email ? (
            <Text style={t.meta}>{partuur.aanmelder_email}</Text>
          ) : null}
          <Text style={t.meta}>
            Ingeschreven {formatDateTime(partuur.ingeschreven_op)}
            {partuur.betaald_cents ? ` · ${formatEuro(partuur.betaald_cents)}` : ''}
          </Text>
        </View>

        <Text style={[t.sectionLabel, s.spaced]}>Betaalstatus</Text>
        <View style={s.statusRow}>
          {STATUSSEN.map((st) => {
            const on = partuur.betaalstatus === st.value;
            return (
              <Pressable
                key={st.value}
                onPress={() => onStatus(st.value)}
                disabled={busy === `status-${partuur.partuur_group}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={st.label}
                style={[s.statusChip, on && s.statusChipOn]}
              >
                <Text style={[s.statusChipText, on && s.statusChipTextOn]}>{st.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.actions}>
          <Pressable
            onPress={onToggleBevestigd}
            disabled={busy === `bev-${partuur.partuur_group}`}
            accessibilityRole="button"
            accessibilityLabel={partuur.bevestigd ? 'Bevestiging intrekken' : 'Goedkeuren'}
            style={({ pressed }) => [
              s.action,
              partuur.bevestigd ? s.actionGhost : s.actionPrimary,
              pressed && s.pressed,
            ]}
          >
            {busy === `bev-${partuur.partuur_group}` ? (
              <ActivityIndicator color={partuur.bevestigd ? colors.text : colors.onPrimary} />
            ) : (
              <Text style={partuur.bevestigd ? s.actionGhostText : s.actionPrimaryText}>
                {partuur.bevestigd ? 'Bevestiging intrekken' : 'Goedkeuren'}
              </Text>
            )}
          </Pressable>

          {confirmDelete ? (
            <>
              <Pressable
                onPress={onCancelDelete}
                accessibilityRole="button"
                accessibilityLabel="Annuleren"
                style={[s.action, s.actionGhost]}
              >
                <Text style={s.actionGhostText}>Annuleren</Text>
              </Pressable>
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel="Definitief verwijderen"
                style={[s.action, s.actionDanger]}
              >
                <Text style={s.actionDangerText}>Verwijderen</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={onAskDelete}
              accessibilityRole="button"
              accessibilityLabel="Inschrijving verwijderen"
              style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.loss} />
            </Pressable>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 820, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 28, lineHeight: 32 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  movingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm,
  },
  movingText: { ...t.meta, color: colors.text, flex: 1 },

  target: { borderRadius: radii.md, borderWidth: 2, borderColor: colors.primary },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.full },
  chipText: { ...t.chip },

  spelerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH - 8,
  },
  niveau: {
    ...t.chip,
    color: colors.onNeutralChip,
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    overflow: 'hidden',
  },

  meta: { marginTop: spacing.sm, gap: 2 },
  spaced: { marginTop: spacing.md },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  statusChip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  statusChipOn: { backgroundColor: colors.primary },
  statusChipText: { ...t.chip, color: colors.onNeutralChip },
  statusChipTextOn: { color: colors.onPrimary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { ...t.button, color: colors.onPrimary },
  actionGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  actionGhostText: { ...t.button, color: colors.text },
  actionDanger: { backgroundColor: colors.loss },
  actionDangerText: { ...t.button, color: colors.onPrimary },
  iconBtn: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },

  newPartuur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    marginTop: spacing.sm,
  },
  newPartuurText: { ...t.button, color: colors.primary },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
