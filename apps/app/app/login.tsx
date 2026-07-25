import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { auth } from '../src/lib/api';
import { useSession } from '../src/lib/SessionProvider';
import { useBreakpoint } from '../src/lib/useBreakpoint';
import { Card, Button } from '../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../src/theme/tokens';
import { type as t } from '../src/theme/typography';

/**
 * Staff login.
 *
 * There is no sign-up: accounts are created by an admin (spec section 5). Community
 * members do not come here at all — they choose a display name in /meer/schermnaam.
 */
export default function Login() {
  const router = useRouter();
  const { login } = useSession();
  const { isWide } = useBreakpoint();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit() {
    if (busy) return;
    setError(null);

    if (!email.trim() || !password) {
      setError('Vul je e-mailadres en wachtwoord in.');
      return;
    }

    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inloggen mislukt.');
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    if (!email.trim()) {
      setError('Vul eerst je e-mailadres in.');
      return;
    }
    setError(null);
    // Always reports success — confirming whether an address exists would leak which
    // addresses are registered.
    await auth.forgotPassword(email.trim()).catch(() => undefined);
    setResetSent(true);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.flex}
    >
      <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
        <View style={s.hero}>
          <Text style={s.heroKicker}>Kaatsvereniging</Text>
          <Text style={s.heroTitle}>Beheer</Text>
          <View style={s.heroRule} />
        </View>

        <Card>
          <Text style={t.sectionLabel}>E-mailadres</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="naam@kveendracht.nl"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            accessibilityLabel="E-mailadres"
            editable={!busy}
            style={s.input}
            onSubmitEditing={onSubmit}
          />

          <Text style={[t.sectionLabel, s.spaced]}>Wachtwoord</Text>
          <View style={s.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              accessibilityLabel="Wachtwoord"
              editable={!busy}
              style={[s.input, s.flex]}
              onSubmitEditing={onSubmit}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              style={s.eye}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {error ? (
            <View style={s.error} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.loss} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {resetSent ? (
            <View style={s.notice} accessibilityRole="alert">
              <Ionicons name="mail-outline" size={16} color={colors.onAccentSoft} />
              <Text style={s.noticeText}>
                Als dit adres bekend is, sturen we een herstellink.
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={onSubmit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Inloggen"
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [s.submit, (pressed || busy) && s.submitPressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={s.submitText}>Inloggen</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onForgot}
            accessibilityRole="button"
            accessibilityLabel="Wachtwoord vergeten"
            style={s.link}
            hitSlop={6}
          >
            <Text style={s.linkText}>Wachtwoord vergeten?</Text>
          </Pressable>
        </Card>

        <Text style={s.footnote}>
          Beheeraccounts worden aangemaakt door de vereniging. Wil je meepraten op het forum?
          Kies dan een schermnaam via Meer.
        </Text>

        <Button
          label="Terug"
          variant="ghost"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  page: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
    justifyContent: 'center',
  },
  pageWide: { maxWidth: 460, width: '100%', alignSelf: 'center' },

  hero: {
    backgroundColor: colors.sport,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroKicker: { ...t.sectionLabel, color: colors.onSportMuted },
  heroTitle: { ...t.hero, color: colors.onSport, marginTop: spacing.xs },
  heroRule: {
    height: 3,
    width: 30,
    borderRadius: 2,
    backgroundColor: colors.primaryOnSport,
    marginTop: spacing.md,
  },

  input: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    color: colors.text,
  },
  spaced: { marginTop: spacing.md },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eye: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },

  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  errorText: { ...t.meta, color: colors.loss, flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    backgroundColor: colors.accentSoft,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  noticeText: { ...t.meta, color: colors.onAccentSoft, flex: 1 },

  submit: {
    minHeight: MIN_TOUCH + 4,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  submitPressed: { opacity: 0.8 },
  submitText: { ...t.button, color: colors.onPrimary, fontSize: 15 },

  link: { alignSelf: 'center', minHeight: MIN_TOUCH, justifyContent: 'center' },
  linkText: { ...t.meta, color: colors.primary },

  footnote: {
    ...t.meta,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
