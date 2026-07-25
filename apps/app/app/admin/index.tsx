import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, SectionHeader } from '../../src/components/ui';
import { useSession } from '../../src/lib/SessionProvider';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Beheer dashboard.
 *
 * A shell for now: the sections below arrive with the games, calendar and community
 * write layers. They are listed rather than hidden so the club can see what is coming,
 * and so the navigation shape is settled before the screens fill in.
 */
const SECTIONS = [
  {
    icon: 'calendar-number-outline',
    title: 'Speelavonden',
    subtitle: 'Partijen, uitslagen invoeren en afronden',
    ready: false,
  },
  {
    icon: 'people-outline',
    title: 'Spelers',
    subtitle: 'Toevoegen, bewerken en archiveren',
    ready: false,
  },
  {
    icon: 'trophy-outline',
    title: 'Toernooien',
    subtitle: 'Toernooibuilder met loting',
    ready: false,
  },
  { icon: 'calendar-outline', title: 'Agenda', subtitle: 'Activiteiten beheren', ready: false },
  {
    icon: 'shield-checkmark-outline',
    title: 'Moderatie',
    subtitle: 'Wachtrij, meldingen en blokkades',
    ready: false,
  },
] as const;

export default function AdminDashboard() {
  const { user, canEnterResults } = useSession();
  const { isWide } = useBreakpoint();

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={s.hero}>
        <Text style={s.heroKicker}>Beheer</Text>
        <Text style={s.heroTitle}>{user?.display_name}</Text>
        <Text style={s.heroMeta}>
          {canEnterResults ? 'Mag uitslagen invoeren' : 'Alleen-lezen voor uitslagen'}
        </Text>
      </View>

      <SectionHeader title="Onderdelen" />
      <View style={isWide ? s.grid : undefined}>
        {SECTIONS.map((sec) => (
          <View key={sec.title} style={isWide ? s.gridItem : undefined}>
            <Card>
              <View style={s.row}>
                <Ionicons name={sec.icon} size={20} color={colors.primary} />
                <View style={s.flex}>
                  <Text style={t.cardTitle}>{sec.title}</Text>
                  <Text style={t.meta}>{sec.subtitle}</Text>
                </View>
                {!sec.ready ? <Text style={s.soon}>Binnenkort</Text> : null}
              </View>
            </Card>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 1000, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, fontSize: 30, lineHeight: 34 },
  heroMeta: { ...t.meta, color: colors.onSportMuted, marginTop: spacing.xs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { flexBasis: '48%', flexGrow: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  soon: {
    ...t.chip,
    color: colors.onAccentSoft,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
});
