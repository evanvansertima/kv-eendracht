import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radii, elevation, MIN_TOUCH } from '../theme/tokens';
import { type as t } from '../theme/typography';

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
      <Text style={t.sectionLabel}>{title}</Text>
      {action}
    </View>
  );
}

/** Page-level title, used inside the scroll body rather than the navigation header. */
export function PageTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <View style={s.pageTitle}>
      {kicker ? <Text style={t.sectionLabel}>{kicker}</Text> : null}
      <Text style={t.pageTitle}>{title}</Text>
    </View>
  );
}

export function Card({ children, sport }: { children: ReactNode; sport?: boolean }) {
  return <View style={[s.card, sport ? s.cardSport : s.cardLight]}>{children}</View>;
}

/** Dark panel that sport data sits on, so numerals are the brightest thing on screen. */
export function SportPanel({ children }: { children: ReactNode }) {
  return <View style={s.sportPanel}>{children}</View>;
}

export type Status = 'live' | 'binnenkort' | 'afgelopen' | 'concept';

const STATUS: Record<Status, { bg: string; fg: string; label: string }> = {
  live: { bg: colors.live, fg: colors.onLive, label: 'Live' },
  binnenkort: { bg: colors.accentSoft, fg: colors.onAccentSoft, label: 'Binnenkort' },
  afgelopen: { bg: colors.neutralChip, fg: colors.onNeutralChip, label: 'Afgelopen' },
  concept: { bg: colors.primarySoft, fg: colors.primary, label: 'Concept' },
};

export function StatusLabel({ status }: { status: Status }) {
  const st = STATUS[status];
  return (
    <View style={[s.chip, { backgroundColor: st.bg }]}>
      <Text style={[t.chip, { color: st.fg }]}>{st.label}</Text>
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
      <Text style={t.meta}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={s.centered}>
      <Text style={s.stateTitle}>{title}</Text>
      {hint ? <Text style={[t.meta, s.centerText]}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.centered}>
      <Text style={[s.stateTitle, { color: colors.loss }]}>Kan gegevens niet laden</Text>
      <Text style={[t.meta, s.centerText]}>{message}</Text>
      {onRetry ? <Button label="Opnieuw proberen" onPress={onRetry} /> : null}
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
        pressed && s.pressed,
      ]}
    >
      <Text style={[t.button, variant === 'ghost' ? s.buttonTextGhost : s.buttonText]}>
        {label}
      </Text>
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
    marginTop: spacing.lg,
  },
  pageTitle: { marginBottom: spacing.md, gap: 2 },

  card: { borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  cardLight: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...elevation.card,
  },
  cardSport: { backgroundColor: colors.sportRaised },
  sportPanel: {
    backgroundColor: colors.sport,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },

  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },

  skeleton: { backgroundColor: colors.line, borderRadius: radii.md },

  centered: { alignItems: 'center', padding: spacing.xxl, gap: spacing.xs },
  centerText: { textAlign: 'center' },
  stateTitle: { ...t.cardTitle, color: colors.textMuted },

  button: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
  },
  buttonGhost: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.75 },
  buttonText: { color: colors.onPrimary },
  buttonTextGhost: { color: colors.text },

  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  segment: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.neutralChip,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { ...t.button, fontSize: 13, color: colors.textMuted },
  segmentTextActive: { color: colors.onPrimary },
});
