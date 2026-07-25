import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, ApiError, type StandingRow, type AgendaEvent } from '../src/lib/api';
import { useBreakpoint } from '../src/lib/useBreakpoint';
import { colors, spacing, radii, MIN_TOUCH } from '../src/theme/tokens';
import { formatEventMoment } from '../src/lib/dates';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; standings: StandingRow[]; agenda: AgendaEvent[] };

export default function Home() {
  const { isWide } = useBreakpoint();
  const [state, setState] = useState<State>({ phase: 'loading' });

  async function load() {
    setState({ phase: 'loading' });
    try {
      const [standings, agenda] = await Promise.all([api.standings(), api.agenda()]);
      setState({ phase: 'ready', standings, agenda });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof ApiError ? err.message : 'Onbekende fout.',
      });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.page, isWide && styles.pageWide]}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>KAATSVERENIGING</Text>
        <Text style={styles.heroTitle}>KV EENDRACHT</Text>
        <View style={styles.accentBar} />
      </View>

      {state.phase === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Laden…</Text>
        </View>
      )}

      {state.phase === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Kan gegevens niet laden</Text>
          <Text style={styles.muted}>{state.message}</Text>
          <Pressable style={styles.button} onPress={load} accessibilityRole="button">
            <Text style={styles.buttonText}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      )}

      {state.phase === 'ready' && (
        <View style={isWide ? styles.columns : undefined}>
          <View style={isWide ? styles.column : undefined}>
            <Text style={styles.sectionTitle}>COMPETITIESTAND</Text>
            <View style={styles.card}>
              <View style={[styles.row, styles.headRow]}>
                <Text style={[styles.cellPos, styles.headText]}>#</Text>
                <Text style={[styles.cellName, styles.headText]}>Speler</Text>
                <Text style={[styles.cellNum, styles.headText]}>V</Text>
                <Text style={[styles.cellNum, styles.headText]}>T</Text>
                <Text style={[styles.cellNum, styles.headText]}>S</Text>
                <Text style={[styles.cellNum, styles.headText]}>D</Text>
              </View>
              {state.standings.slice(0, 10).map((r) => (
                <View key={r.player_id} style={styles.row}>
                  <Text style={styles.cellPos}>{r.position ?? '–'}</Text>
                  <Text style={styles.cellName} numberOfLines={1}>
                    {r.display_name}
                  </Text>
                  <Text style={styles.cellNum}>{r.eersten_voor}</Text>
                  <Text style={styles.cellNum}>{r.eersten_tegen}</Text>
                  <Text style={styles.cellNum}>{r.saldo}</Text>
                  <Text style={styles.cellNum}>{r.deelnames}</Text>
                </View>
              ))}
              <Text style={styles.legend}>
                V = eersten voor · T = eersten tegen · S = saldo · D = deelnames
              </Text>
            </View>
          </View>

          <View style={isWide ? styles.column : undefined}>
            <Text style={styles.sectionTitle}>AGENDA</Text>
            {state.agenda.map((e) => (
              <View key={e.id} style={styles.card}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.muted}>
                  {formatEventMoment(e.starts_at)}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 1100, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  columns: { flexDirection: 'row', gap: spacing.xl },
  column: { flex: 1 },

  hero: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },
  heroKicker: { color: colors.accent, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  heroTitle: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  accentBar: {
    height: 5,
    width: 90,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
    transform: [{ skewX: '-8deg' }],
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    color: colors.black,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray300,
  },
  headRow: { borderBottomWidth: 2, borderBottomColor: colors.black },
  headText: { fontWeight: '800', fontSize: 12, color: colors.gray700 },
  cellPos: { width: 28, fontVariant: ['tabular-nums'], color: colors.gray700 },
  cellName: { flex: 1, fontWeight: '600', color: colors.black },
  cellNum: { width: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  legend: { marginTop: spacing.sm, fontSize: 11, color: colors.gray500 },

  eventTitle: { fontWeight: '700', fontSize: 15, color: colors.black },
  muted: { color: colors.gray500, marginTop: 2 },

  centered: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  errorTitle: { fontWeight: '800', fontSize: 16, color: colors.danger },
  button: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.white, fontWeight: '700' },
});
