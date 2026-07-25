import { Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, MIN_TOUCH } from '../../src/theme/tokens';
import { useBreakpoint } from '../../src/lib/useBreakpoint';

/**
 * Five bottom tabs plus a profile button in every header.
 *
 * Six primary destinations would crowd a phone, so Login / Profiel / Beheer live behind
 * the profile button (KV-EENDRACHT-APP-SPEC section 6). Its label changes with the
 * session: Login -> Profiel -> Beheer.
 */

const TABS = [
  { name: 'index', title: 'Home', icon: '⌂' },
  { name: 'agenda', title: 'Agenda', icon: '▤' },
  { name: 'toernooien', title: 'Toernooien', icon: '▲' },
  { name: 'competitie', title: 'Competitie', icon: '≡' },
  { name: 'community', title: 'Community', icon: '◍' },
] as const;

function ProfileButton() {
  const router = useRouter();
  // No session yet — the auth module lands with the login flow, and this label
  // becomes Profiel / Beheer once a role is known.
  const label = 'Login';
  return (
    <Pressable
      onPress={() => router.push('/meer')}
      accessibilityRole="button"
      accessibilityLabel={`${label}, open menu`}
      style={s.profileButton}
      hitSlop={8}
    >
      <Text style={s.profileText}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { isWide } = useBreakpoint();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
        headerRight: () => <ProfileButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray500,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.gray300,
          // Wide screens get a taller, roomier bar rather than phone-sized targets
          // stretched across a monitor. See ADR-0002.
          height: isWide ? 64 : Platform.OS === 'ios' ? 84 : 64,
          paddingTop: spacing.xs,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => (
              <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{t.icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  profileButton: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  profileText: { color: colors.white, fontWeight: '700' },
});
