import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { games } from '../../../src/lib/api';
import { useAsync } from '../../../src/lib/useAsync';
import { useBreakpoint } from '../../../src/lib/useBreakpoint';
import { formatDate } from '../../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../../src/theme/tokens';
import { type as t, tabular } from '../../../src/theme/typography';

const GENDER_LABEL: Record<string, string> = {
  dame: 'Vrouw',
  heer: 'Man',
  anders: 'Anders',
};

export default function SpelerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isWide } = useBreakpoint();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => games.player(id), [id]);
  const state = useAsync(load, [id]);

  async function archive() {
    setBusy(true);
    setError(null);
    try {
      await games.archivePlayer(id);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { player, ranking, matches } = state.data;
  const played = matches.filter((m) => m.has_result);

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>
          {[player.skill_level ? `Niveau ${player.skill_level}` : null, player.club]
            .filter(Boolean)
            .join(' · ') || 'Speler'}
        </Text>
        <Text style={s.heroTitle}>{player.display_name}</Text>
        {player.archived_at ? (
          <Text style={s.archived}>Gearchiveerd op {formatDate(player.archived_at)}</Text>
        ) : null}
      </View>

      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <SectionHeader title="Competitie ranking" />
      {ranking ? (
        <View style={s.rankCard}>
          <View style={s.rankTop}>
            <Text style={s.rankPos}>{ranking.position}</Text>
            <View style={s.flex}>
              <Text style={s.rankOf}>
                van {ranking.group_size} · {ranking.groep === 'dames' ? 'Dames' : 'Heren'}
              </Text>
              <Text style={s.rankComp}>{ranking.competition_name}</Text>
            </View>
          </View>
          <View style={s.statRow}>
            <Stat label="Voor" value={ranking.eersten_voor} />
            <Stat label="Tegen" value={ranking.eersten_tegen} />
            <Stat label="Saldo" value={ranking.saldo} signed />
            <Stat label="Deelnames" value={ranking.deelnames} />
          </View>
          <View style={s.statRow}>
            <Stat label="Gespeeld" value={ranking.gespeeld} />
            <Stat label="Gewonnen" value={ranking.gewonnen} />
            <Stat label="Verloren" value={ranking.verloren} />
          </View>
        </View>
      ) : (
        <EmptyState title="Nog geen competitiestand" hint="Deze speler doet nog niet mee." />
      )}

      <SectionHeader title="Korte gegevens" />
      <Card>
        <Detail label="Naam" value={player.display_name} />
        <Detail label="Niveau" value={player.skill_level ?? '—'} />
        <Detail
          label="Geslacht"
          value={player.gender ? (GENDER_LABEL[player.gender] ?? player.gender) : '—'}
        />
        <Detail label="Vereniging" value={player.club ?? '—'} />
        <Detail
          label="Geboortedatum"
          value={player.birth_date ? formatDate(player.birth_date) : '—'}
        />
        <Detail label="Leeftijdscategorie" value={player.age_category ?? '—'} />
        <Detail label="Telefoon" value={player.phone ?? '—'} />
        <Detail label="E-mail" value={player.email ?? '—'} />
        <Detail label="Status" value={player.is_active ? 'Actief' : 'Inactief'} />
      </Card>

      <SectionHeader title={`Gespeelde wedstrijden · ${played.length}`} />
      {matches.length === 0 ? (
        <EmptyState title="Nog geen wedstrijden" />
      ) : (
        matches.map((m) => (
          <Card key={m.id}>
            <View style={s.matchRow}>
              <View style={s.flex}>
                <Text style={t.cardTitle}>
                  {m.tournament_name ?? `Speelronde ${m.round_no ?? '—'}`}
                </Text>
                <Text style={t.meta}>
                  {m.played_on ? formatDate(m.played_on) : 'Datum onbekend'}
                  {m.own_team_no ? ` · Partuur ${m.own_team_no}` : ''}
                </Text>
              </View>
              {m.has_result ? (
                <View style={s.scoreBox}>
                  <Text style={[s.score, m.won ? s.scoreWin : undefined]}>
                    {m.eersten_voor}–{m.eersten_tegen}
                  </Text>
                  <Text style={m.won ? s.wonTag : s.lostTag}>
                    {m.won ? 'Gewonnen' : 'Verloren'}
                  </Text>
                </View>
              ) : (
                <Text style={t.meta}>Nog geen uitslag</Text>
              )}
            </View>
          </Card>
        ))
      )}

      <SectionHeader title="Speler verwijderen" />
      {confirming ? (
        <Card>
          {/* Archive, not delete: this player appears in historical results, and
              removing the row would rewrite finished seasons. */}
          <Text style={t.body}>
            {player.display_name} wordt gearchiveerd en verdwijnt uit selectielijsten.
            Bestaande uitslagen en standen blijven ongewijzigd.
          </Text>
          <View style={s.actions}>
            <Pressable
              onPress={() => setConfirming(false)}
              accessibilityRole="button"
              accessibilityLabel="Annuleren"
              style={[s.btn, s.btnGhost]}
            >
              <Text style={s.btnGhostText}>Annuleren</Text>
            </Pressable>
            <Pressable
              onPress={() => void archive()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Definitief archiveren"
              style={[s.btn, s.btnDanger]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onLive} />
              ) : (
                <Text style={s.btnDangerText}>Archiveren</Text>
              )}
            </Pressable>
          </View>
        </Card>
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          disabled={!!player.archived_at}
          accessibilityRole="button"
          accessibilityLabel="Speler verwijderen"
          style={({ pressed }) => [
            s.btn,
            s.btnGhost,
            !!player.archived_at && s.btnDisabled,
            pressed && s.pressed,
          ]}
        >
          <Text style={s.btnDangerGhostText}>
            {player.archived_at ? 'Al gearchiveerd' : 'Speler verwijderen'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  const shown = signed && value > 0 ? `+${value}` : signed && value < 0 ? `−${Math.abs(value)}` : value;
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{shown}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
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
  archived: { ...t.meta, color: colors.accent, marginTop: spacing.xs },

  rankCard: { backgroundColor: colors.sportRaised, borderRadius: radii.md, padding: spacing.md },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankPos: { ...t.hero, color: colors.onSport, fontSize: 44, lineHeight: 46, ...tabular },
  rankOf: { ...t.cardTitle, color: colors.onSport },
  rankComp: { ...t.meta, color: colors.onSportMuted },
  statRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  stat: { flex: 1 },
  statValue: { ...t.tableNumLead, fontSize: 17, color: colors.onSport },
  statLabel: { ...t.meta, color: colors.onSportMuted, fontSize: 10 },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: spacing.md,
  },
  detailLabel: { ...t.meta },
  detailValue: { ...t.body, flexShrink: 1, textAlign: 'right' },

  matchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scoreBox: { alignItems: 'flex-end' },
  score: { ...t.tableNumLead, fontSize: 16, color: colors.textMuted },
  scoreWin: { color: colors.text },
  wonTag: { ...t.chip, color: colors.gain },
  lostTag: { ...t.chip, color: colors.textMuted },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  btnGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  btnGhostText: { ...t.button, color: colors.text },
  btnDangerGhostText: { ...t.button, color: colors.loss },
  btnDanger: { backgroundColor: colors.loss },
  btnDangerText: { ...t.button, color: colors.onLive },
  btnDisabled: { opacity: 0.5 },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
