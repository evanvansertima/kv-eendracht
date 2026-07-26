import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, SectionHeader, Button } from '../../src/components/ui';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { useSession } from '../../src/lib/SessionProvider';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const ROLE_LABEL: Record<string, string> = {
  guest: 'Communitylid',
  moderator: 'Moderator',
  admin: 'Beheerder',
  super_admin: 'Hoofdbeheerder',
};

function Row({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={s.flex}>
        <Text style={t.cardTitle}>{title}</Text>
        <Text style={t.meta}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * The menu behind the profile button. Six primary destinations would crowd a phone, so
 * login, profile and admin live here rather than as a sixth tab (spec section 6).
 */
export default function Meer() {
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const { user, isStaff, logout, loading } = useSession();

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {user ? (
        <>
          <SectionHeader title="Ingelogd als" />
          <Card>
            <View style={s.profileRow}>
              <View style={s.avatar}>
                <Ionicons
                  name={user.is_anonymous ? 'person' : 'shield-checkmark'}
                  size={22}
                  color={colors.onSport}
                />
              </View>
              <View style={s.flex}>
                <Text style={t.cardTitle}>{user.display_name}</Text>
                <Text style={t.meta}>
                  {ROLE_LABEL[user.role] ?? user.role}
                  {user.email ? ` · ${user.email}` : ''}
                </Text>
                {user.match_entry_rights && user.role === 'moderator' ? (
                  <Text style={s.badge}>Mag uitslagen invoeren</Text>
                ) : null}
              </View>
            </View>
          </Card>

          {isStaff ? (
            <>
              <SectionHeader title="Beheer" />
              <Card>
                <Row
                  icon="clipboard-outline"
                  title="Beheerdashboard"
                  subtitle="Speelrondes, uitslagen en spelers"
                  onPress={() => router.push('/admin')}
                />
              </Card>
            </>
          ) : null}

          <Button label="Uitloggen" variant="ghost" onPress={() => void logout()} />
        </>
      ) : (
        <>
          <SectionHeader title="Meedoen" />
          <Card>
            <Row
              icon="chatbubbles-outline"
              title="Schermnaam kiezen"
              subtitle="Reageer op het forum, stem en deel foto's"
              onPress={() => router.push('/meer/schermnaam')}
            />
          </Card>

          <SectionHeader title="Beheer" />
          <Card>
            <Row
              icon="log-in-outline"
              title="Inloggen als beheerder"
              subtitle="Uitslagen, spelersbeheer en toernooien"
              onPress={() => router.push('/login')}
            />
          </Card>
        </>
      )}

      <SectionHeader title="Informatie" />
      <Card>
        <Text style={t.cardTitle}>Huisregels</Text>
        <Text style={t.meta}>Afspraken voor het forum en foto&apos;s.</Text>
      </Card>
      <Card>
        <Text style={t.cardTitle}>Privacy</Text>
        <Text style={t.meta}>Hoe KV Eendracht met je gegevens omgaat.</Text>
      </Card>

      <Text style={s.version}>
        KV Eendracht · versie 2.0.0{loading ? ' · sessie laden…' : ''}
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.xs,
  },
  pressed: { opacity: 0.65 },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.sport,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    ...t.meta,
    color: colors.onAccentSoft,
    backgroundColor: colors.accentSoft,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },

  version: { ...t.meta, textAlign: 'center', marginTop: spacing.xl },
});
