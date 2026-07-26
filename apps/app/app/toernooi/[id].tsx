import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  generateOmloopSchema,
  advanceOmloop,
  countOmlopen,
  defaultPouleLayout,
  type Omloop,
} from '@kv/domain';
import { tournaments, SYSTEM_LABELS, FORMATION_LABELS } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate } from '../../src/lib/dates';
import { Bracket, type BracketResult } from '../../src/components/Bracket';
import { Card, SectionHeader, Loading, ErrorState, EmptyState, Segmented } from '../../src/components/ui';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const TABS = ['Schema', 'Parturen'] as const;
type Tab = (typeof TABS)[number];

export default function TournamentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isWide } = useBreakpoint();
  const [tab, setTab] = useState<Tab>('Schema');

  const load = useCallback(() => tournaments.detail(id), [id]);
  const state = useAsync(load, [id]);

  /**
   * Rebuilds the omlopen from the stored partijen and their results.
   *
   * The schema is derived rather than stored: omloop 1 comes from the parturen, and each
   * later omloop from the winners of the one before. That way a corrected result
   * reshapes everything after it, instead of leaving a stale bracket behind.
   */
  const { omlopen, results } = useMemo(() => {
    if (state.phase !== 'ready') return { omlopen: [] as Omloop[], results: {} as BracketResult };

    const { teams, matches } = state.data;
    const teamNos = teams.map((x) => x.team_no).sort((a, b) => a - b);
    if (teamNos.length < 2) return { omlopen: [], results: {} };

    // Results keyed the way the bracket looks them up.
    const byKey: BracketResult = {};
    for (const m of matches) {
      if (m.eersten_red == null || m.eersten_white == null) continue;
      byKey[`${m.round_no}-${m.match_no}`] = { red: m.eersten_red, white: m.eersten_white };
    }

    const total = countOmlopen(teamNos.length);
    const schema = generateOmloopSchema(teamNos);
    const built: Omloop[] = [...schema.omlopen];

    // Walk forward as far as results allow.
    let current = built[0];
    while (current) {
      const winners: number[] = [];
      for (const p of current.partijen) {
        const r = byKey[`${current.roundNo}-${p.matchNo}`];
        if (!r) break; // Omloop incomplete: stop building here.
        winners.push(r.red > r.white ? p.redTeamNo : p.whiteTeamNo);
      }
      if (winners.length !== current.partijen.length) break;

      const next = advanceOmloop(current, winners, total);
      if (!next) break;
      built.push(next);
      current = next;
    }

    return { omlopen: built, results: byKey };
  }, [state]);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { tournament, teams } = state.data;
  const nameFor = (teamNo: number) =>
    teams.find((x) => x.team_no === teamNo)?.players ?? `Partuur ${teamNo}`;

  const isPoule = tournament.match_system === 'poule';
  const layout = isPoule ? defaultPouleLayout(teams.length) : null;

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
        {tournament.draw_seed != null ? (
          <Text style={s.heroSeed}>Loting-seed {tournament.draw_seed}</Text>
        ) : null}
      </View>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'Schema' ? (
        teams.length < 2 ? (
          <EmptyState title="Nog niet geloot" hint="Het schema verschijnt zodra er geloot is." />
        ) : isPoule ? (
          <>
            <SectionHeader title="Poule-indeling" />
            <Card>
              <Text style={t.body}>
                {teams.length} parturen ·{' '}
                {layout!.perPoule.map((n, i) => `poule ${i + 1} met ${n}`).join(', ')}
              </Text>
              <Text style={s.note}>
                In een poulesysteem speelt iedereen binnen de poule tegen elkaar. Winnaar 7
                punten, verliezer de eigen eersten.
              </Text>
            </Card>
          </>
        ) : (
          <>
            <SectionHeader title="Schema" />
            <Bracket omlopen={omlopen} results={results} teamName={nameFor} />
            <Text style={s.note}>
              Bij een oneven aantal parturen schuift het onderste partuur zonder tegenstander
              door en staat het in de volgende omloop bovenaan.
            </Text>
          </>
        )
      ) : (
        <>
          <SectionHeader title={`Parturen (${teams.length})`} />
          {teams.length === 0 ? (
            <EmptyState title="Nog geen parturen" />
          ) : (
            teams.map((team) => (
              <Card key={team.id}>
                <Text style={t.sectionLabel}>Partuur {team.team_no}</Text>
                <Text style={t.body}>{team.players ?? '—'}</Text>
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 1000, width: '100%', alignSelf: 'center', padding: spacing.xxl },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 30, lineHeight: 34 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },
  heroSeed: { ...t.meta, color: colors.primaryOnSport, marginTop: 2 },

  note: { ...t.meta, marginTop: spacing.md, fontStyle: 'italic' },
});
