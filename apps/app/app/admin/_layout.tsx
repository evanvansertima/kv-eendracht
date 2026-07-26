import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useSession } from '../../src/lib/SessionProvider';
import { Loading } from '../../src/components/ui';
import { colors } from '../../src/theme/tokens';
import { fonts } from '../../src/theme/typography';

/**
 * Admin route guard.
 *
 * This is navigation comfort, NOT security. Every endpoint behind these screens is
 * authorised by RLS in Postgres, so a user who forced their way here would simply see
 * empty lists and refusals. Rule 5 of CLAUDE.md: hiding a button is never security.
 */
export default function AdminLayout() {
  const { isStaff, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Wait for the stored session to be checked before redirecting, or a staff member
    // opening /admin directly gets bounced to login during the restore.
    if (!loading && !isStaff) router.replace('/login');
  }, [loading, isStaff, router]);

  if (loading) return <Loading label="Sessie controleren…" />;
  if (!isStaff) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.sport },
        headerTintColor: colors.onSport,
        headerTitleStyle: { fontFamily: fonts.headingBold, fontSize: 20 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Beheer' }} />
      <Stack.Screen name="spelers" options={{ title: 'Spelers' }} />
      <Stack.Screen name="speler/[id]" options={{ title: 'Speler' }} />
      <Stack.Screen name="competitie" options={{ title: 'Competitie' }} />
      <Stack.Screen name="loten" options={{ title: 'Loten' }} />
      <Stack.Screen name="speelronde/[id]" options={{ title: 'Speelronde' }} />
      <Stack.Screen name="uitslag/[matchId]" options={{ title: 'Uitslag invoeren' }} />
      <Stack.Screen name="toernooi/nieuw" options={{ title: 'Nieuw toernooi' }} />
      <Stack.Screen name="agenda" options={{ title: 'Agenda' }} />
      <Stack.Screen name="moderatie" options={{ title: 'Moderatie' }} />
    </Stack>
  );
}
