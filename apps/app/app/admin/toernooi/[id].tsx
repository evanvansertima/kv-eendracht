import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { tournaments, SYSTEM_LABELS, FORMATION_LABELS, type DrawPreview } from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { formatDate, formatEventMoment } from '../../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t } from '../../../src/theme/typography';

/**
 * Stap 3 to 5 — drawing a wedstrijd that already exists.
 *
 * Deliberately separate from creation. Between the two sits the registration period,
 * and drawing before it closes would draw an incomplete field.
 *
 * The gate is soft on purpose: an admin can draw early, but has to pass a warning to do
 * it. Registration deadlines slip, someone always signs up late by phone, and a system
 * that flatly refuses gets worked around rather than obeyed.
 */
export default function LotenScherm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DrawPreview | null>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [confirmEarly, setConfirmEarly] = useState(false);

  const load = useCallback(
    async () => ({
      detail: await tournaments.detail(id),
      regs: await tournaments.registrations(id),
    }),
    [id],
  );
  const state = useAsync(load, [id]);

  async function draw(withSeed: number) {
    setBusy(true);
    setError(null);
    try {
      const ids =
        state.phase === 'ready' ? state.data.regs.items.map((r) => r.player_id) : [];
      const p = await tournaments.preview(id, withSeed, ids);
      setPreview(p);
      setSeed(withSeed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loten mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const ids = state.phase === 'ready' ? state.data.regs.items.map((r) => r.player_id) : [];
      await tournaments.publish(
        id,
        seed,
        ids,
        preview.teams.map((x) => ({ team_no: x.team_no, player_ids: x.players.map((p) => p.id) })),
      );
      router.replace(`/toernooi/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publiceren mislukt.');
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { detail, regs } = state.data;
  const { tournament } = detail;
  const registrationStillOpen = regs.registration_open;
  const alreadyDrawn = tournament.draw_published_at !== null;
  const count = regs.items.length;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>
          {tournament.played_on ? formatDate(tournament.played_on) : 'Datum volgt'}
        </Text>
        <Text style={s.heroTitle}>{tournament.name}</Text>
        <Text style={s.heroMeta}>
          {SYSTEM_LABELS[tournament.match_system] ?? tournament.match_system}
          {' · '}
          {FORMATION_LABELS[tournament.formation_category] ?? tournament.formation_category}
        </Text>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {alreadyDrawn ? (
        <Card>
          <Text style={t.cardTitle}>Deze wedstrijd is al geloot</Text>
          <Text style={t.meta}>
            Seed {tournament.draw_seed}. Opnieuw loten zou het schema en alle ingevoerde
            uitslagen ongeldig maken.
          </Text>
          <Pressable
            onPress={() => router.replace(`/toernooi/${id}`)}
            accessibilityRole="button"
            accessibilityLabel="Naar het schema"
            style={({ pressed }) => [s.btn, s.btnGhost, pressed && s.pressed]}
          >
            <Text style={s.btnGhostText}>Naar het schema</Text>
          </Pressable>
        </Card>
      ) : (
        <>
          <SectionHeader title={`Stap 3 · Deelnemers (${count})`} />
          <Card>
            {registrationStillOpen ? (
              <>
                <View style={s.openRow}>
                  <Ionicons name="time-outline" size={16} color={colors.onAccentSoft} />
                  <Text style={s.openText}>
                    De inschrijving loopt nog
                    {tournament.registration_deadline
                      ? ` tot ${formatEventMoment(tournament.registration_deadline)}`
                      : ''}
                    .
                  </Text>
                </View>
                <Text style={s.note}>
                  Je kunt al loten, maar wie zich daarna nog inschrijft doet niet mee.
                </Text>
              </>
            ) : (
              <Text style={t.meta}>
                De inschrijving is gesloten. {count} deelnemer{count === 1 ? '' : 's'} doen mee.
              </Text>
            )}
          </Card>

          <SectionHeader title="Stap 4 · Loting" />
          {preview ? (
            <>
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

              <View style={s.row}>
                <Pressable
                  onPress={() => void draw(Math.floor(Math.random() * 2 ** 31))}
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
              </View>
            </>
          ) : confirmEarly ? (
            <Card>
              <Text style={t.cardTitle}>Nu al loten?</Text>
              <Text style={t.meta}>
                De inschrijving loopt nog. Wie zich hierna inschrijft, staat niet in de loting.
              </Text>
              <View style={s.row}>
                <Pressable
                  onPress={() => setConfirmEarly(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Annuleren"
                  style={[s.btn, s.btnGhost]}
                >
                  <Text style={s.btnGhostText}>Annuleren</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmEarly(false);
                    void draw(seed);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Toch loten"
                  style={[s.btn, s.btnPrimary]}
                >
                  <Text style={s.btnPrimaryText}>Toch loten</Text>
                </Pressable>
              </View>
            </Card>
          ) : (
            <Pressable
              onPress={() => (registrationStillOpen ? setConfirmEarly(true) : void draw(seed))}
              disabled={busy || count < 2}
              accessibilityRole="button"
              accessibilityLabel="Loten"
              accessibilityState={{ disabled: busy || count < 2 }}
              style={({ pressed }) => [
                s.btn,
                s.btnPrimary,
                (busy || count < 2) && s.btnDisabled,
                pressed && s.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={s.btnPrimaryText}>
                  {count < 2 ? 'Te weinig deelnemers' : 'Loten'}
                </Text>
              )}
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 760, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  pressed: { opacity: 0.7 },

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

  openRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  openText: { ...t.meta, color: colors.onAccentSoft, flex: 1 },
  note: { ...t.meta, marginTop: spacing.sm, fontStyle: 'italic' },

  teamCard: {
    backgroundColor: colors.sportRaised,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  teamNo: { ...t.sectionLabel, color: colors.onSportMuted },
  teamPlayer: { ...t.tableName, color: colors.onSport, marginTop: 2 },
  reserveRow: { marginBottom: spacing.sm },

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
