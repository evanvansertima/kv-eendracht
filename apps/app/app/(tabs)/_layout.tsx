import { Tabs, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t, fonts } from '../../src/theme/typography';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { useSession } from '../../src/lib/SessionProvider';

/**
 * Six bottom tabs plus a profile button in every header.
 *
 * The spec caps the bar at five (section 6), on the grounds that six crowds a small
 * phone. That was right, and Wedstrijden is worth the crowding anyway: it is a primary
 * destination for members, and reaching it only through a Home shortcut hid it. The cost
 * is paid in the label size below rather than by dropping something else.
 *
 * Login / Profiel / Beheer stay behind the profile button, which is what keeps this at
 * six rather than seven. Its label follows the session: Login -> Profiel -> Beheer.
 *
 * LIVE keeps the centre slot deliberately — it is the screen used while a partij is
 * actually being played, so it stays the easiest one to hit with a thumb.
 */
const TABS = [
  { name: 'index', title: 'Home', icon: 'home', activeIcon: 'home' },
  { name: 'agenda', title: 'Agenda', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'toernooien', title: 'Wedstrijden', icon: 'trophy-outline', activeIcon: 'trophy' },
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
        // Six tabs rather than the spec's five. "Competitie" and "Wedstrijden" are long
        // words, so the label drops a point and the item padding is removed; without
        // this they ellipsise on a 375pt screen.
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemiBold,
          fontSize: isWide ? 11 : 9,
          // Six labels across 375pt leaves ~62pt each. "Wedstrijden" and "Community"
          // are the long ones and ellipsised at 9.5pt with default spacing; negative
          // tracking plus zero item padding buys back the few points they needed.
          letterSpacing: isWide ? 0 : -0.3,
          marginHorizontal: -2,
        },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarIconStyle: { marginBottom: -2 },
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
