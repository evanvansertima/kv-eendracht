import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games, type PreviewRow } from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { useSession } from '../../../src/lib/SessionProvider';
import { formatDate } from '../../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t, tabular } from '../../../src/theme/typography';

/** The finalize preview's categories, in the order a volunteer should read them. */
const STATUS_LABEL: Record<string, string> = {
  present: 'Aanwezig',
  niet_verwerkt: 'Nog niet verwerkt',
  excused: 'Afgemeld',
  injured: 'Geblesseerd',
  guest: 'Gastspeler',
  absent: 'Afwezig',
};
const STATUS_ORDER = ['present', 'niet_verwerkt', 'excused', 'injured', 'guest', 'absent'];

export default function Speelavond() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useBreakpoint();
  const { canEnterResults } = useSession();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, PreviewRow[]> | null>(null);

  const load = useCallback(() => games.round(id), [id]);
  const state = useAsync(load, [id]);

  // Refetch on focus so returning from score entry shows the new result immediately.
  useFocusEffect(
    useCallback(() => {
      state.reload();
      // reload is stable per deps; re-running on every render would loop.
    }, [id]),
  );

  /**
   * Runs a mutating action, then refetches and dismisses the preview.
   *
   * Only for actions that CHANGE the round. Fetching the preview must not go through
   * here: it would clear the preview immediately after setting it.
   */
  async function run(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      state.reload();
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Actie mislukt.');
    } finally {
      setBusy(null);
    }
  }

  async function loadPreview() {
    setBusy('preview');
    setError(null);
    try {
      const p = await games.finalizePreview(id);
      setPreview(p.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kan controle niet ophalen.');
    } finally {
      setBusy(null);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { round, matches } = state.data;
  const entered = matches.filter((m) => m.eersten_red != null).length;
  const isOpen = round.status === 'open';

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>{round.competition_name}</Text>
        <Text style={s.heroTitle}>Speelavond {round.round_no}</Text>
        <Text style={s.heroMeta}>
          {round.played_on ? formatDate(round.played_on) : 'Datum onbekend'} ·{' '}
          {entered}/{matches.length} uitslagen
          {!isOpen ? ' · afgerond' : ''}
        </Text>
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <SectionHeader title="Partijen" />
      {matches.length === 0 ? (
        <EmptyState
          title="Nog geen partijen"
          hint="Loot eerst de parturen voor deze speelavond."
        />
      ) : (
        matches.map((m) => {
          const done = m.eersten_red != null;
          return (
            <Pressable
              key={m.id}
              onPress={() =>
                canEnterResults && isOpen
                  ? router.push(`/admin/uitslag/${m.id}?roundId=${id}`)
                  : undefined
              }
              disabled={!canEnterResults || !isOpen}
              accessibilityRole="button"
              accessibilityLabel={`Partij ${m.match_no}`}
              style={({ pressed }) => [pressed && s.pressed]}
            >
              <Card>
                <View style={s.matchRow}>
                  <Text style={s.matchNo}>{m.match_no}</Text>
                  <View style={s.flex}>
                    <Text style={s.team} numberOfLines={1}>
                      {m.red_players ?? `Partuur ${m.red_no}`}
                    </Text>
                    <Text style={s.team} numberOfLines={1}>
                      {m.white_players ?? `Partuur ${m.white_no}`}
                    </Text>
                  </View>
                  {done ? (
                    <View style={s.scoreBox}>
                      <Text style={[s.scoreNum, m.winner === 'red' && s.scoreWin]}>
                        {m.eersten_red}
                      </Text>
                      <Text style={[s.scoreNum, m.winner === 'white' && s.scoreWin]}>
                        {m.eersten_white}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons
                      name={canEnterResults && isOpen ? 'create-outline' : 'time-outline'}
                      size={20}
                      color={colors.textMuted}
                    />
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}

      {isOpen ? (
        <>
          <SectionHeader title="Afronden" />
          {preview ? (
            <Card>
              <Text style={t.cardTitle}>Controleer voor je afrondt</Text>
              {STATUS_ORDER.filter((k) => preview[k]?.length).map((k) => (
                <View key={k} style={s.previewGroup}>
                  <Text style={s.previewLabel}>
                    {STATUS_LABEL[k] ?? k} · {preview[k]!.length}
                  </Text>
                  <Text style={t.meta}>
                    {preview[k]!.map((p) => p.display_name).join(', ')}
                  </Text>
                </View>
              ))}
              <Text style={s.warn}>
                Iedereen onder &ldquo;nog niet verwerkt&rdquo; wordt afwezig gemeld.
              </Text>
              <View style={s.actionRow}>
                <Pressable
                  onPress={() => setPreview(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Annuleren"
                  style={[s.action, s.actionGhost]}
                >
                  <Text style={s.actionGhostText}>Annuleren</Text>
                </Pressable>
                <Pressable
                  onPress={() => void run('finalize', () => games.finalize(id))}
                  accessibilityRole="button"
                  accessibilityLabel="Speelavond afronden bevestigen"
                  style={[s.action, s.actionPrimary]}
                >
                  {busy === 'finalize' ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={s.actionPrimaryText}>Afronden</Text>
                  )}
                </Pressable>
              </View>
            </Card>
          ) : (
            <Pressable
              onPress={() => void loadPreview()}
              accessibilityRole="button"
              accessibilityLabel="Speelavond afronden"
              style={({ pressed }) => [s.action, s.actionPrimary, pressed && s.pressed]}
            >
              {busy === 'preview' ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={s.actionPrimaryText}>Speelavond afronden</Text>
              )}
            </Pressable>
          )}
        </>
      ) : (
        <>
          <SectionHeader title="Afgerond" />
          <Card>
            <Text style={t.meta}>
              Deze speelavond is afgerond. Heropenen verwijdert alleen automatisch gezette
              afwezigheid; handmatige correcties blijven staan.
            </Text>
            <Pressable
              onPress={() => void run('reopen', () => games.reopen(id))}
              accessibilityRole="button"
              accessibilityLabel="Speelavond heropenen"
              style={({ pressed }) => [s.action, s.actionGhost, pressed && s.pressed]}
            >
              {busy === 'reopen' ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={s.actionGhostText}>Heropenen</Text>
              )}
            </Pressable>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 800, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 30, lineHeight: 34 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  matchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  matchNo: { ...t.tableNum, width: 22, color: colors.textMuted },
  team: { ...t.tableName, color: colors.text },
  scoreBox: { flexDirection: 'row', gap: spacing.sm },
  scoreNum: { ...tabular, ...t.cardTitle, color: colors.textMuted, minWidth: 18, textAlign: 'right' },
  scoreWin: { color: colors.text, fontWeight: '800' },

  previewGroup: { marginTop: spacing.md },
  previewLabel: { ...t.sectionLabel, color: colors.text },
  warn: { ...t.meta, color: colors.onAccentSoft, marginTop: spacing.md },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { ...t.button, color: colors.onPrimary },
  actionGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  actionGhostText: { ...t.button, color: colors.text },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
