import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, SectionHeader } from '../../src/components/ui';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { colors, spacing } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * The menu behind the profile button. Six primary destinations would crowd a phone, so
 * login, profile and admin live here rather than as a sixth tab (spec section 6).
 *
 * Every action below is disabled until the auth module lands: there is no session yet.
 * Showing them greyed out is deliberate — it tells the club what is coming rather than
 * hiding it, and the buttons wire up without moving anything.
 */
export default function Meer() {
  const { isWide } = useBreakpoint();

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <SectionHeader title="Meedoen" />
      <Card>
        <Text style={s.title}>Schermnaam kiezen</Text>
        <Text style={s.muted}>
          Kies een schermnaam om te reageren op het forum, te stemmen en foto&apos;s te delen.
        </Text>
        <Text style={s.soon}>Beschikbaar zodra inloggen werkt.</Text>
      </Card>

      <SectionHeader title="Beheer" />
      <Card>
        <Text style={s.title}>Inloggen als beheerder</Text>
        <Text style={s.muted}>
          Voor het invoeren van uitslagen, spelersbeheer en de toernooibuilder.
        </Text>
        <Text style={s.soon}>Beschikbaar zodra inloggen werkt.</Text>
      </Card>

      <SectionHeader title="Informatie" />
      <Card>
        <View style={s.linkRow}>
          <Text style={s.title}>Huisregels</Text>
        </View>
        <Text style={s.muted}>Afspraken voor het forum en foto&apos;s.</Text>
      </Card>
      <Card>
        <View style={s.linkRow}>
          <Text style={s.title}>Privacy</Text>
        </View>
        <Text style={s.muted}>Hoe KV Eendracht met je gegevens omgaat.</Text>
      </Card>

      <Text style={s.version}>KV Eendracht · versie 2.0.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  title: t.cardTitle,
  muted: { ...t.meta, marginTop: 2 },
  soon: { ...t.meta, color: colors.onAccentSoft, marginTop: spacing.sm },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  version: { ...t.meta, textAlign: 'center', marginTop: spacing.xl },
});
