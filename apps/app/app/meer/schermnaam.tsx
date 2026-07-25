import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../../src/lib/SessionProvider';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { Card } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/**
 * Anonymous community sign-in: a display name, no email, no password.
 *
 * This is how a club member joins the forum without an account (spec section 5). Their
 * first posts land in the moderation queue, enforced by a database trigger rather than
 * by anything here.
 */
export default function Schermnaam() {
  const router = useRouter();
  const { signInAnonymously } = useSession();
  const { isWide } = useBreakpoint();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 32;

  async function onSubmit() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await signInAnonymously(trimmed);
      router.replace('/community');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <Card>
        <Text style={t.pageTitle}>Kies een schermnaam</Text>
        <Text style={[t.body, s.intro]}>
          Onder deze naam verschijn je op het forum en bij peilingen. Je hoeft geen account
          aan te maken.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="bijv. Kaatsfan88"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={32}
          accessibilityLabel="Schermnaam"
          editable={!busy}
          style={s.input}
          onSubmitEditing={onSubmit}
        />
        <Text style={s.counter}>{trimmed.length}/32 · minimaal 2 tekens</Text>

        {error ? (
          <View style={s.error} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={16} color={colors.loss} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={!valid || busy}
          accessibilityRole="button"
          accessibilityLabel="Doe mee"
          accessibilityState={{ disabled: !valid || busy }}
          style={({ pressed }) => [
            s.submit,
            (!valid || busy) && s.submitDisabled,
            pressed && s.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={s.submitText}>Doe mee</Text>
          )}
        </Pressable>

        <Text style={s.footnote}>
          Nieuwe berichten worden eerst door een moderator bekeken. Lees de huisregels voordat
          je iets plaatst.
        </Text>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 460, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  intro: { color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.md },
  input: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
  },
  counter: { ...t.meta, marginTop: spacing.xs },
  error: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
  submit: {
    minHeight: MIN_TOUCH + 4,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  submitDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  submitText: { ...t.button, color: colors.onPrimary, fontSize: 15 },
  footnote: { ...t.meta, marginTop: spacing.md },
});
