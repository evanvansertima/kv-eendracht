import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { inschrijving, formatEuro, type BetaalStatus } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatDate, formatDateTime } from '../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState } from '../../src/components/ui';
import { colors, spacing, radii } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Registratiebevestiging.
 *
 * Reachable without an account: the aanmelder follows a link and has no session. The
 * partuur_group in the URL is an unguessable uuid, which is what protects it.
 *
 * While a payment is pending the screen polls. A user returning from the hosted checkout
 * usually arrives *before* the provider's webhook does, so showing "in behandeling" and
 * leaving it there would look like the payment failed.
 */

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const STATUS_STYLE: Record<BetaalStatus, { icon: IoniconName; colour: string; soft: string }> = {
  paid: { icon: 'checkmark-circle', colour: colors.gain, soft: colors.primarySoft },
  pending: { icon: 'time-outline', colour: colors.onAccentSoft, soft: colors.accentSoft },
  unpaid: { icon: 'alert-circle-outline', colour: colors.onAccentSoft, soft: colors.accentSoft },
  failed: { icon: 'close-circle', colour: colors.loss, soft: colors.accentSoft },
  refunded: { icon: 'arrow-undo-outline', colour: colors.textMuted, soft: colors.neutralChip },
};

export default function Bevestiging() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const { isWide } = useBreakpoint();
  const [polls, setPolls] = useState(0);

  const load = useCallback(() => inschrijving.bevestiging(group), [group]);
  const state = useAsync(load, [group, polls]);

  const status = state.phase === 'ready' ? state.data.betaalstatus : null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Poll only while the outcome is genuinely still open, and give up after a minute
    // rather than hammering the API forever on a payment that was abandoned.
    if (status !== 'pending' || polls >= 20) return;
    timer.current = setTimeout(() => setPolls((n) => n + 1), 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, polls]);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const b = state.data;
  const style = STATUS_STYLE[b.betaalstatus];
  const betaald = b.betaalstatus === 'paid';

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <View style={[s.banner, { backgroundColor: style.soft }]}>
        <Ionicons name={style.icon} size={26} color={style.colour} />
        <View style={s.flex}>
          <Text style={[s.bannerTitle, { color: style.colour }]}>
            {betaald ? 'Inschrijving bevestigd' : b.betaalstatus_label}
          </Text>
          <Text style={s.bannerBody}>
            {betaald
              ? 'Je partuur staat ingeschreven. Tot op het veld!'
              : b.betaalstatus === 'pending'
                ? 'We wachten op de bevestiging van de betaling. Dit venster ververst vanzelf.'
                : b.betaalstatus === 'failed'
                  ? 'De betaling is niet gelukt. Neem contact op met de wedstrijdcommissie.'
                  : 'Je inschrijving is ontvangen.'}
          </Text>
        </View>
      </View>

      <SectionHeader title="Wedstrijd" />
      <Card>
        <Text style={t.cardTitle}>{b.wedstrijd}</Text>
        <Text style={t.meta}>
          {b.played_on ? formatDate(b.played_on) : 'Datum volgt'}
          {b.location ? ` · ${b.location}` : ''}
        </Text>
      </Card>

      <SectionHeader title={`Spelers (${b.spelers.length})`} />
      <Card>
        {b.spelers.map((naam) => (
          <View key={naam} style={s.row}>
            <Ionicons name="person-outline" size={16} color={colors.textMuted} />
            <Text style={t.body}>{naam}</Text>
          </View>
        ))}
      </Card>

      <SectionHeader title="Aanmelder" />
      <Card>
        <Text style={t.cardTitle}>{b.aanmelder_naam}</Text>
        <Text style={t.meta}>{b.aanmelder_email}</Text>
        <Text style={t.meta}>{b.aanmelder_telefoon}</Text>
      </Card>

      <SectionHeader title="Betaling" />
      <Card>
        <View style={s.between}>
          <Text style={t.meta}>Inleggeld</Text>
          <Text style={t.body}>{formatEuro(b.inleggeld_cents)}</Text>
        </View>
        <View style={s.between}>
          <Text style={t.meta}>Betaald bedrag</Text>
          <Text style={s.bedrag}>{formatEuro(b.betaald_cents)}</Text>
        </View>
        <View style={s.between}>
          <Text style={t.meta}>Status</Text>
          <Text style={[t.body, { color: style.colour }]}>{b.betaalstatus_label}</Text>
        </View>
        {b.betaald_op ? (
          <View style={s.between}>
            <Text style={t.meta}>Betaald op</Text>
            <Text style={t.meta}>{formatDateTime(b.betaald_op)}</Text>
          </View>
        ) : null}
      </Card>

      <Text style={s.footer}>
        Ingeschreven op {formatDateTime(b.ingeschreven_op)}
        {b.bevestigd_op ? ` · bevestigd op ${formatDateTime(b.bevestigd_op)}` : ''}
      </Text>
      <Text style={s.footer}>Bewaar deze pagina als bevestiging.</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 640, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  flex: { flex: 1 },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
  },
  bannerTitle: { ...t.cardTitle },
  bannerBody: { ...t.meta, marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  bedrag: { ...t.cardTitle },
  footer: { ...t.meta, textAlign: 'center', marginTop: spacing.md },
});
