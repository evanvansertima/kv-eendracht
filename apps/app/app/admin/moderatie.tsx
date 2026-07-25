import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { moderation } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatRelative } from '../../src/lib/dates';
import { Card, SectionHeader, Loading, ErrorState, EmptyState } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/** v_moderation_queue reports subject_type as forum_topic / forum_reply / media_upload. */
const TYPE_LABEL: Record<string, string> = {
  forum_topic: 'Forumbericht',
  forum_reply: 'Reactie',
  media_upload: "Foto",
};

// No mapping needed: the API speaks the same subject_type vocabulary as the database,
// so the value from v_moderation_queue goes straight into the endpoint path.

export default function Moderatie() {
  const { isWide } = useBreakpoint();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => moderation.queue(), []);
  const state = useAsync(load, []);

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Actie mislukt.');
    } finally {
      setBusy(null);
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const { queue, reports } = state.data;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      {error ? (
        <View style={s.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <SectionHeader title={`Wachtrij · ${queue.length}`} />
      {queue.length === 0 ? (
        <EmptyState title="Niets te beoordelen" hint="Alle inzendingen zijn afgehandeld." />
      ) : (
        queue.map((item) => {
          const endpointType = item.subject_type;
          const key = `${item.subject_type}:${item.subject_id}`;
          return (
            <Card key={key}>
              <View style={s.head}>
                <Text style={s.badge}>{TYPE_LABEL[item.subject_type] ?? item.subject_type}</Text>
                <Text style={t.meta}>{formatRelative(item.created_at)}</Text>
              </View>
              <Text style={[t.body, s.preview]}>{item.preview}</Text>
              <View style={s.actions}>
                <Pressable
                  onPress={() =>
                    void act(key, () => moderation.act(endpointType, item.subject_id, 'reject'))
                  }
                  disabled={busy === key}
                  accessibilityRole="button"
                  accessibilityLabel="Afwijzen"
                  style={[s.btn, s.btnGhost]}
                >
                  <Text style={s.btnGhostText}>Afwijzen</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    void act(key, () => moderation.act(endpointType, item.subject_id, 'approve'))
                  }
                  disabled={busy === key}
                  accessibilityRole="button"
                  accessibilityLabel="Goedkeuren"
                  style={[s.btn, s.btnPrimary]}
                >
                  {busy === key ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={s.btnPrimaryText}>Goedkeuren</Text>
                  )}
                </Pressable>
              </View>
            </Card>
          );
        })
      )}

      <SectionHeader title={`Meldingen · ${reports.length}`} />
      {reports.length === 0 ? (
        <EmptyState title="Geen open meldingen" />
      ) : (
        reports.map((r) => (
          <Card key={r.id}>
            <View style={s.head}>
              <Text style={s.badgeWarn}>Melding</Text>
              <Text style={t.meta}>{formatRelative(r.created_at)}</Text>
            </View>
            <Text style={[t.body, s.preview]}>{r.reason}</Text>
            <View style={s.actions}>
              <Pressable
                onPress={() => void act(r.id, () => moderation.resolveReport(r.id, 'dismissed'))}
                accessibilityRole="button"
                accessibilityLabel="Melding afwijzen"
                style={[s.btn, s.btnGhost]}
              >
                <Text style={s.btnGhostText}>Afwijzen</Text>
              </Pressable>
              <Pressable
                onPress={() => void act(r.id, () => moderation.resolveReport(r.id, 'resolved'))}
                accessibilityRole="button"
                accessibilityLabel="Melding afgehandeld"
                style={[s.btn, s.btnPrimary]}
              >
                <Text style={s.btnPrimaryText}>Afgehandeld</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 800, width: '100%', alignSelf: 'center', padding: spacing.xxl },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    ...t.chip,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  badgeWarn: {
    ...t.chip,
    color: colors.onAccentSoft,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  preview: { marginTop: spacing.sm },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...t.button, color: colors.onPrimary },
  btnGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  btnGhostText: { ...t.button, color: colors.text },

  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
});
