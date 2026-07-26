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
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatUitslag, parsePunten, MAX_EERSTEN } from '@kv/domain';
import { games, type RoundMatch } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t, tabular } from '../../src/theme/typography';

/**
 * Competitie section of the dashboard.
 *
 * Holds the speelrondes (moved here from the dashboard root) and lets results be
 * entered per partij without leaving the page. Entry follows the club's notation:
 * eersten for each partuur, plus the punten in the deciding eerst, displayed as
 * "5-5, 6-2" — see packages/domain/src/competitie/uitslag.ts.
 */
export default function AdminCompetitie() {
  const { isWide } = useBreakpoint();
  const router = useRouter();

  const [openRound, setOpenRound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const competitions = await games.competitions();
    const active = competitions[0];
    const rounds = active ? await games.rounds(active.id) : [];
    return { active, rounds };
  }, []);
  const state = useAsync(load, []);

  useFocusEffect(
    useCallback(() => {
      state.reload();
    }, []),
  );

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { active, rounds } = state.data;
  const open = rounds.filter((r) => r.status === 'open');
  const done = rounds.filter((r) => r.status === 'finalized');

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>Competitie</Text>
        <Text style={s.heroTitle}>{active?.name ?? 'Geen competitie'}</Text>
        {active ? (
          <Text style={s.heroMeta}>{active.player_count} deelnemers · {rounds.length} speelrondes</Text>
        ) : null}
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push('/admin/loten')}
        accessibilityRole="button"
        accessibilityLabel="Loten"
        style={({ pressed }) => [pressed && s.pressed]}
      >
        <Card>
          <View style={s.row}>
            <Ionicons name="shuffle-outline" size={20} color={colors.primary} />
            <View style={s.flex}>
              <Text style={t.cardTitle}>Loten</Text>
              <Text style={t.meta}>Parturen samenstellen voor een speelronde</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Card>
      </Pressable>

      <SectionHeader title={`Open speelrondes · ${open.length}`} />
      {open.length === 0 ? (
        <EmptyState title="Geen open speelronde" hint="Alle speelrondes zijn afgerond." />
      ) : (
        open.map((r) => (
          <RoundBlock
            key={r.id}
            roundId={r.id}
            roundNo={r.round_no}
            playedOn={r.played_on}
            resultCount={r.result_count}
            matchCount={r.match_count}
            expanded={openRound === r.id}
            onToggle={() => setOpenRound((cur) => (cur === r.id ? null : r.id))}
            onError={setError}
            onChanged={state.reload}
            onOpenRound={() => router.push(`/admin/speelronde/${r.id}`)}
          />
        ))
      )}

      <SectionHeader title={`Afgeronde speelrondes · ${done.length}`} />
      {done.slice(0, 8).map((r) => (
        <Pressable
          key={r.id}
          onPress={() => router.push(`/admin/speelronde/${r.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Speelronde ${r.round_no}, afgerond`}
          style={({ pressed }) => [pressed && s.pressed]}
        >
          <Card>
            <View style={s.row}>
              <Ionicons name="checkmark-circle" size={20} color={colors.gain} />
              <View style={s.flex}>
                <Text style={t.cardTitle}>Speelronde {r.round_no}</Text>
                <Text style={t.meta}>
                  {r.played_on ? formatDate(r.played_on) : ''} · {r.result_count} uitslagen
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** One speelronde, expandable to show its partijen and enter results inline. */
function RoundBlock({
  roundId,
  roundNo,
  playedOn,
  resultCount,
  matchCount,
  expanded,
  onToggle,
  onError,
  onChanged,
  onOpenRound,
}: {
  roundId: string;
  roundNo: number;
  playedOn: string | null;
  resultCount: number;
  matchCount: number;
  expanded: boolean;
  onToggle: () => void;
  onError: (m: string | null) => void;
  onChanged: () => void;
  onOpenRound: () => void;
}) {
  const load = useCallback(
    () => (expanded ? games.round(roundId) : Promise.resolve(null)),
    [expanded, roundId],
  );
  const detail = useAsync(load, [expanded, roundId]);

  return (
    <Card>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Speelronde ${roundNo} ${expanded ? 'inklappen' : 'uitklappen'}`}
        accessibilityState={{ expanded }}
        style={s.row}
      >
        <View style={s.badge}>
          <Text style={s.badgeText}>{roundNo}</Text>
        </View>
        <View style={s.flex}>
          <Text style={t.cardTitle}>Speelronde {roundNo}</Text>
          <Text style={t.meta}>
            {playedOn ? formatDate(playedOn) : 'Datum onbekend'} · {resultCount}/{matchCount} uitslagen
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        detail.phase === 'loading' ? (
          <ActivityIndicator color={colors.primary} style={s.spinner} />
        ) : detail.phase === 'error' ? (
          <Text style={s.errorText}>{detail.message}</Text>
        ) : detail.data ? (
          <View style={s.matches}>
            {detail.data.matches.length === 0 ? (
              <Text style={t.meta}>
                Nog geen partijen. Loot eerst de parturen voor deze speelronde.
              </Text>
            ) : (
              detail.data.matches.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  onError={onError}
                  onSaved={() => {
                    detail.reload();
                    onChanged();
                  }}
                />
              ))
            )}
            <Pressable
              onPress={onOpenRound}
              accessibilityRole="button"
              accessibilityLabel="Speelronde openen"
              style={({ pressed }) => [s.openBtn, pressed && s.pressed]}
            >
              <Text style={s.openBtnText}>Speelronde openen · afronden</Text>
            </Pressable>
          </View>
        ) : null
      ) : null}
    </Card>
  );
}

/** One partij: shows the uitslag, or the entry fields when there is none yet. */
function MatchRow({
  match,
  onError,
  onSaved,
}: {
  match: RoundMatch;
  onError: (m: string | null) => void;
  onSaved: () => void;
}) {
  const done = match.eersten_red != null;
  const [editing, setEditing] = useState(false);
  const [red, setRed] = useState('');
  const [white, setWhite] = useState('');
  const [punten, setPunten] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const r = Number(red);
    const w = Number(white);
    if (!Number.isInteger(r) || !Number.isInteger(w) || r < 0 || w < 0 || r > MAX_EERSTEN || w > MAX_EERSTEN) {
      onError(`Vul voor beide parturen een aantal eersten in tussen 0 en ${MAX_EERSTEN}.`);
      return;
    }
    if (r === w) {
      onError('Een partij kan niet in gelijkspel eindigen.');
      return;
    }
    if (Math.max(r, w) !== MAX_EERSTEN) {
      onError(`De winnaar moet op ${MAX_EERSTEN} eersten staan.`);
      return;
    }
    // Punten are optional, but if given they must be a valid pair.
    if (punten.trim() && !parsePunten(punten)) {
      onError('Punten moeten 0, 2, 4, 6 of 8 zijn, bijvoorbeeld 6-2.');
      return;
    }

    setBusy(true);
    onError(null);
    try {
      await games.enterResult(
        match.id,
        {
          eersten_red: r,
          eersten_white: w,
          note: punten.trim() ? `Laatste eerst: ${punten.trim()}` : null,
        },
        // One id per entry attempt of THIS partij, so a retry after a dropped
        // connection cannot double-count.
        globalThis.crypto?.randomUUID?.() ?? `${match.id}-${Date.now()}`,
      );
      setEditing(false);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Opslaan mislukt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.matchRow}>
      <View style={s.flex}>
        <Text style={s.matchTitle}>
          Partuur {match.red_no} – Partuur {match.white_no}
        </Text>
        <Text style={t.meta} numberOfLines={1}>
          {match.red_players ?? '—'} / {match.white_players ?? '—'}
        </Text>

        {done ? (
          <Text style={s.uitslag}>
            Uitslag:{' '}
            {formatUitslag({
              eerstenRed: match.eersten_red!,
              eerstenWhite: match.eersten_white!,
              puntenLaatsteEerst: null,
            })}
          </Text>
        ) : editing ? (
          <View style={s.entry}>
            <View style={s.entryRow}>
              <TextInput
                value={red}
                onChangeText={setRed}
                placeholder="6"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                accessibilityLabel={`Eersten partuur ${match.red_no}`}
                style={s.numInput}
              />
              <Text style={s.dash}>–</Text>
              <TextInput
                value={white}
                onChangeText={setWhite}
                placeholder="5"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                accessibilityLabel={`Eersten partuur ${match.white_no}`}
                style={s.numInput}
              />
              <TextInput
                value={punten}
                onChangeText={setPunten}
                placeholder="6-2"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Punten in de laatste eerst"
                style={s.puntenInput}
              />
              <Pressable
                onPress={() => void save()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Uitslag opslaan"
                style={[s.saveBtn, busy && s.disabled]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
                )}
              </Pressable>
            </View>
            <Text style={s.entryHint}>Eersten, en de punten in de laatste eerst.</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={`Uitslag invoeren voor partuur ${match.red_no} tegen ${match.white_no}`}
            style={({ pressed }) => [s.enterBtn, pressed && s.pressed]}
          >
            <Text style={s.enterBtnText}>Uitslag invoeren</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 860, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  spinner: { marginTop: spacing.md },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.sm,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 28, lineHeight: 32 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...t.tableNumLead, color: colors.primary },

  matches: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  matchRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  matchTitle: { ...t.cardTitle, fontSize: 14 },
  uitslag: { ...t.tableNumLead, color: colors.text, marginTop: spacing.xs },

  entry: { marginTop: spacing.sm },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  numInput: {
    ...t.tableNumLead,
    ...tabular,
    width: 46,
    minHeight: MIN_TOUCH,
    textAlign: 'center',
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    color: colors.text,
  },
  dash: { ...t.cardTitle, color: colors.textMuted },
  puntenInput: {
    ...t.body,
    ...tabular,
    width: 74,
    minHeight: MIN_TOUCH,
    textAlign: 'center',
    marginLeft: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    color: colors.text,
  },
  saveBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  entryHint: { ...t.meta, fontSize: 11, marginTop: spacing.xs },

  enterBtn: {
    alignSelf: 'flex-start',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.xs,
  },
  enterBtnText: { ...t.button, fontSize: 13, color: colors.primary },

  openBtn: {
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  openBtnText: { ...t.button, color: colors.text },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
