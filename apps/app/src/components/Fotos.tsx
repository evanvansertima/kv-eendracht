import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { media, type Photo } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { pickAndUploadPhoto } from '../lib/uploadPhoto';
import { useSession } from '../lib/SessionProvider';
import { useBreakpoint } from '../lib/useBreakpoint';
import { Card, Loading, ErrorState, EmptyState } from './ui';
import { formatRelative } from '../lib/dates';
import { colors, spacing, radii, MIN_TOUCH } from '../theme/tokens';
import { type as t } from '../theme/typography';

/**
 * The Foto's section of Community.
 *
 * New photos from anonymous members land in the moderation queue, so what an uploader
 * sees straight after uploading is their own pending photo — RLS returns approved ones
 * plus your own. Saying so explicitly avoids the obvious "where did my photo go".
 */
export function Fotos() {
  const { user } = useSession();
  const { isWide } = useBreakpoint();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => media.list(), []);
  const state = useAsync(load, []);

  async function upload() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await pickAndUploadPhoto();
      if (!result) return; // Cancelled in the picker.
      setNotice(
        result.moderation_status === 'pending'
          ? 'Bedankt! Je foto staat in de wachtrij en verschijnt na goedkeuring.'
          : 'Je foto is geplaatst.',
      );
      state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uploaden mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: Photo) {
    setError(null);
    try {
      await media.remove(photo.id);
      state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt.');
    }
  }

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  return (
    <>
      {error ? (
        <View style={s.banner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={colors.loss} />
          <Text style={s.bannerError}>{error}</Text>
        </View>
      ) : null}

      {notice ? (
        <View style={s.noticeBox} accessibilityRole="alert">
          <Ionicons name="checkmark-circle" size={16} color={colors.gain} />
          <Text style={s.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {user ? (
        <Pressable
          onPress={() => void upload()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Foto delen"
          style={({ pressed }) => [s.uploadBtn, busy && s.disabled, pressed && s.pressed]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={18} color={colors.onPrimary} />
              <Text style={s.uploadText}>Foto delen</Text>
            </>
          )}
        </Pressable>
      ) : (
        <Card>
          <Text style={t.meta}>Kies een schermnaam om foto&apos;s te delen.</Text>
        </Card>
      )}

      {state.data.length === 0 ? (
        <EmptyState title="Nog geen foto's" hint="Deel de eerste foto van een partij." />
      ) : (
        <View style={isWide ? s.grid : undefined}>
          {state.data.map((photo) => (
            <View key={photo.id} style={isWide ? s.gridItem : undefined}>
              <Card>
                <Image
                  source={{ uri: photo.url }}
                  style={s.photo}
                  contentFit="cover"
                  transition={150}
                  accessibilityLabel={photo.caption ?? 'Clubfoto'}
                />
                <View style={s.metaRow}>
                  <View style={s.flex}>
                    {photo.caption ? <Text style={t.cardTitle}>{photo.caption}</Text> : null}
                    <Text style={t.meta}>
                      {photo.uploader_name ?? 'Kaatsvriend'} · {formatRelative(photo.created_at)}
                    </Text>
                  </View>

                  {photo.moderation_status === 'pending' ? (
                    <View style={s.pendingChip}>
                      <Text style={s.pendingText}>In afwachting</Text>
                    </View>
                  ) : null}

                  {user ? (
                    <Pressable
                      onPress={() => void remove(photo)}
                      accessibilityRole="button"
                      accessibilityLabel="Foto verwijderen"
                      hitSlop={6}
                      style={s.iconBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  bannerError: { ...t.meta, color: colors.loss, flex: 1 },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  noticeText: { ...t.meta, color: colors.text, flex: 1 },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    marginBottom: spacing.md,
  },
  uploadText: { ...t.button, color: colors.onPrimary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { width: '48%' },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.sm,
    backgroundColor: colors.neutralChip,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pendingChip: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  pendingText: { ...t.chip, color: colors.onAccentSoft },
  iconBtn: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
