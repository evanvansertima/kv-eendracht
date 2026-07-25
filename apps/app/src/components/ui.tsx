import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radii, MIN_TOUCH } from '../theme/tokens';

/**
 * Shared primitives.
 *
 * Every data screen implements the same four states in this order:
 * skeleton -> content -> empty -> error, plus an offline notice. Blank white areas are
 * never acceptable (KV-EENDRACHT-APP-SPEC section 6).
 */

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      {action}
    </View>
  );
}

export function Card({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return <View style={[s.card, dark && s.cardDark]}>{children}</View>;
}

export type Status = 'live' | 'binnenkort' | 'afgelopen' | 'concept';

const STATUS_STYLE: Record<Status, { bg: string; fg: string; label: string }> = {
  live: { bg: colors.live, fg: colors.white, label: 'LIVE' },
  binnenkort: { bg: colors.accent, fg: colors.black, label: 'BINNENKORT' },
  afgelopen: { bg: colors.gray300, fg: colors.gray700, label: 'AFGELOPEN' },
  concept: { bg: colors.warning, fg: colors.white, label: 'CONCEPT' },
};

export function StatusLabel({ status }: { status: Status }) {
  const st = STATUS_STYLE[status];
  return (
    <View style={[s.chip, { backgroundColor: st.bg }]}>
      <Text style={[s.chipText, { color: st.fg }]}>{st.label}</Text>
    </View>
  );
}

export function Skeleton({ height = 64 }: { height?: number }) {
  return <View style={[s.skeleton, { height }]} />;
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </View>
  );
}

export function Loading({ label = 'Laden…' }: { label?: string }) {
  return (
    <View style={s.centered}>
      <ActivityIndicator color={colors.primary} />
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.centered}>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.muted}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.centered}>
      <Text style={s.errorTitle}>Kan gegevens niet laden</Text>
      <Text style={s.muted}>{message}</Text>
      {onRetry ? (
        <Button label="Opnieuw proberen" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.button,
        variant === 'ghost' && s.buttonGhost,
        pressed && s.buttonPressed,
      ]}
    >
      <Text style={[s.buttonText, variant === 'ghost' && s.buttonTextGhost]}>{label}</Text>
    </Pressable>
  );
}

/** Horizontal filter chips, used by Agenda and Community. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o}
            style={[s.segment, active && s.segmentActive]}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    color: colors.black,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardDark: { backgroundColor: colors.surfaceDark },

  chip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.sm },
  chipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  skeleton: {
    backgroundColor: colors.gray300,
    borderRadius: radii.md,
    opacity: 0.55,
  },

  centered: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: colors.gray700 },
  errorTitle: { fontWeight: '800', fontSize: 16, color: colors.danger },
  muted: { color: colors.gray500, textAlign: 'center' },

  button: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.gray300 },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: colors.white, fontWeight: '700' },
  buttonTextGhost: { color: colors.black },

  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  segment: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.gray100,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontWeight: '600', color: colors.gray700, fontSize: 13 },
  segmentTextActive: { color: colors.white },
});
