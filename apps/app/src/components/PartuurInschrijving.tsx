import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games, tournaments, type RegisteredPartuur } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Card, SectionHeader, EmptyState } from './ui';
import { colors, spacing, radii, MIN_TOUCH } from '../theme/tokens';
import { type as t } from '../theme/typography';

/**
 * Signing up as a complete partuur, for Vrije Formatie and Pearke.
 *
 * Those categories are not drawn, so the whole point of registration is *which* parturen
 * turn up. Individual sign-up would throw that away and leave the club pairing people
 * up afterwards — exactly what these categories exist to avoid.
 *
 * A partuur is 2 or 3 spelers, matching the sport and the API's own bounds.
 */
export function PartuurInschrijving({
  tournamentId,
  parturen,
  registrationOpen,
  onRegistered,
}: {
  tournamentId: string;
  parturen: RegisteredPartuur[];
  registrationOpen: boolean;
  onRegistered: () => void;
}) {
  const [building, setBuilding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => games.players(), []);
  const players = useAsync(load, []);

  // Anyone already in a partuur cannot be picked again — the API refuses it, but
  // offering the option and then failing is worse than not offering it.
  const taken = new Set(parturen.flatMap((p) => p.players.map((x) => x.player_id)));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await tournaments.registerPartuur(tournamentId, picked);
      setPicked([]);
      setBuilding(false);
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inschrijven mislukt.');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  }

  const available =
    players.phase === 'ready'
      ? players.data.filter(
          (p) =>
            p.is_active &&
            !taken.has(p.id) &&
            (search.trim() === '' ||
              p.display_name.toLowerCase().includes(search.trim().toLowerCase())),
        )
      : [];

  return (
    <>
      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {registrationOpen ? (
        building ? (
          <Card>
            <Text style={t.cardTitle}>Partuur samenstellen</Text>
            <Text style={t.meta}>
              Kies 2 of 3 spelers. Gekozen: {picked.length}.
            </Text>

            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Zoek op naam…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Zoek speler"
              style={s.search}
            />

            <View style={s.list}>
              {available.length === 0 ? (
                <Text style={t.meta}>Geen spelers gevonden.</Text>
              ) : (
                available.slice(0, 40).map((p) => {
                  const on = picked.includes(p.id);
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
                        size={20}
                        color={on ? colors.primary : colors.textMuted}
                      />
                      <Text style={[t.body, s.flex]}>{p.display_name}</Text>
                      {p.skill_level ? <Text style={s.level}>{p.skill_level}</Text> : null}
                    </Pressable>
                  );
                })
              )}
            </View>

            <View style={s.row}>
              <Pressable
                onPress={() => {
                  setBuilding(false);
                  setPicked([]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Annuleren"
                style={[s.btn, s.btnGhost]}
              >
                <Text style={s.btnGhostText}>Annuleren</Text>
              </Pressable>
              <Pressable
                onPress={() => void submit()}
                disabled={picked.length < 2 || busy}
                accessibilityRole="button"
                accessibilityLabel="Partuur inschrijven"
                accessibilityState={{ disabled: picked.length < 2 || busy }}
                style={[s.btn, s.btnPrimary, (picked.length < 2 || busy) && s.btnDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={s.btnPrimaryText}>
                    {picked.length < 2 ? 'Kies minimaal 2' : 'Inschrijven'}
                  </Text>
                )}
              </Pressable>
            </View>
          </Card>
        ) : (
          <Pressable
            onPress={() => setBuilding(true)}
            accessibilityRole="button"
            accessibilityLabel="Partuur inschrijven"
            style={({ pressed }) => [s.btn, s.btnPrimary, s.fullBtn, pressed && s.pressed]}
          >
            <Ionicons name="people-outline" size={18} color={colors.onPrimary} />
            <Text style={s.btnPrimaryText}>Partuur inschrijven</Text>
          </Pressable>
        )
      ) : (
        <Card>
          <Text style={t.meta}>De inschrijving is gesloten.</Text>
        </Card>
      )}

      <SectionHeader title={`Ingeschreven parturen (${parturen.length})`} />
      {parturen.length === 0 ? (
        <EmptyState
          title="Nog geen parturen"
          hint="Schrijf het eerste partuur in."
        />
      ) : (
        parturen.map((p, i) => (
          <Card key={p.group}>
            <Text style={t.sectionLabel}>Partuur {i + 1}</Text>
            {p.players.map((pl) => (
              <Text key={pl.id} style={s.member}>
                {pl.display_name}
                {pl.skill_level ? ` · ${pl.skill_level}` : ''}
              </Text>
            ))}
          </Card>
        ))
      )}
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  search: {
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
  list: { marginTop: spacing.sm },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
  },
  level: {
    ...t.chip,
    color: colors.onNeutralChip,
    backgroundColor: colors.neutralChip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  member: { ...t.body, paddingVertical: 2 },

  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  fullBtn: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
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
