import { Tabs, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t, fonts } from '../../src/theme/typography';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { useSession } from '../../src/lib/SessionProvider';

/**
 * Five bottom tabs plus a profile button in every header.
 *
 * Six primary destinations would crowd a phone, so Login / Profiel / Beheer live behind
 * the profile button (KV-EENDRACHT-APP-SPEC section 6). Its label changes with the
 * session: Login -> Profiel -> Beheer.
 */

/**
 * LIVE sits in the middle, deliberately.
 *
 * It is the one screen used while a partij is actually being played, so it takes the
 * thumb-reachable centre slot rather than a place at the end of the row.
 *
 * Wedstrijden moves off the tab bar to make room; it stays reachable from the Home
 * quick links and from Beheer, which is where it is actually used.
 */
const TABS = [
  { name: 'index', title: 'Home', icon: 'home', activeIcon: 'home' },
  { name: 'agenda', title: 'Agenda', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'scorebord', title: 'LIVE', icon: 'radio-outline', activeIcon: 'radio' },
  { name: 'competitie', title: 'Competitie', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { name: 'community', title: 'Community', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
] as const;

function ProfileButton() {
  const router = useRouter();
  const { user, isStaff } = useSession();

  // Label tracks the session, per spec section 6: Login -> Profiel -> Beheer.
  const label = !user ? 'Login' : isStaff ? 'Beheer' : 'Profiel';
  const icon = !user
    ? 'person-circle-outline'
    : isStaff
      ? 'settings-outline'
      : 'person-circle';

  return (
    <Pressable
      onPress={() => router.push('/meer')}
      accessibilityRole="button"
      accessibilityLabel={`${label}, open menu`}
      style={({ pressed }) => [s.profileButton, pressed && { opacity: 0.7 }]}
      hitSlop={8}
    >
      <Ionicons name={icon} size={18} color={colors.onSport} />
      <Text style={s.profileText}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const { isWide } = useBreakpoint();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.sport },
        headerTintColor: colors.onSport,
        headerTitleStyle: { fontFamily: fonts.headingBold, fontSize: 20 },
        headerShadowVisible: false,
        headerRight: () => <ProfileButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          // Wide screens get a roomier bar rather than phone-sized targets stretched
          // across a monitor. See ADR-0002.
          height: isWide ? 62 : Platform.OS === 'ios' ? 84 : 64,
          paddingTop: spacing.xs,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? tab.activeIcon : tab.icon}
                size={21}
                color={color}
              />
            ),
          }}
        />
      ))}
      {/* Registered but hidden: reachable from Home and Beheer, not a tab. */}
      <Tabs.Screen name="toernooien" options={{ href: null, title: 'Wedstrijden' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  profileButton: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  profileText: { ...t.button, color: colors.onSport },
});
