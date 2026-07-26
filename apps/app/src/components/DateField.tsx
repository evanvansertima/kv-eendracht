import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, radii, MIN_TOUCH } from '../theme/tokens';
import { type as t, tabular } from '../theme/typography';

/**
 * Date entry in dd-mm-jjjj, with a calendar.
 *
 * Both routes are supported deliberately: typing is faster for someone who knows the
 * date, and the calendar is faster for "the second Saturday in September".
 *
 * Built here rather than pulled in: @react-native-community/datetimepicker has no web
 * target, and web is one of the three platforms this codebase ships to
 * (ADR-0002). A month grid is little code and behaves identically everywhere.
 *
 * The value is exchanged as ISO yyyy-mm-dd — what the API expects — while the display
 * is always the Dutch dd-mm-jjjj.
 */

const MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

/** yyyy-mm-dd -> dd-mm-jjjj. Empty in, empty out. */
export function isoToDutch(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** dd-mm-jjjj -> yyyy-mm-dd, or null when it is not a real date. */
export function dutchToIso(text: string): string | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(text.trim());
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);

  // Round-trip through Date so 31-02-2026 is rejected rather than rolling into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function DateField({
  value,
  onChange,
  label,
  accessibilityLabel,
}: {
  /** ISO yyyy-mm-dd, or '' when empty. */
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  accessibilityLabel?: string;
}) {
  const [text, setText] = useState(() => isoToDutch(value));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? new Date(value) : new Date()));

  const invalid = text.trim().length > 0 && dutchToIso(text) === null;

  function commit(next: string) {
    setText(next);
    const iso = dutchToIso(next);
    if (iso) {
      onChange(iso);
      setCursor(new Date(iso));
    } else if (next.trim() === '') {
      onChange('');
    }
  }

  // Monday-first grid, which is how a Dutch calendar reads.
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;

    const cells: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  function pick(day: number) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(day)}`;
    setText(isoToDutch(iso));
    onChange(iso);
    setOpen(false);
  }

  const selected = dutchToIso(text);

  return (
    <View>
      {label ? <Text style={t.sectionLabel}>{label}</Text> : null}

      <View style={s.row}>
        <TextInput
          value={text}
          onChangeText={commit}
          placeholder="dd-mm-jjjj"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={accessibilityLabel ?? label ?? 'Datum'}
          accessibilityHint="Typ de datum als dd-mm-jjjj, of open de kalender"
          style={[s.input, invalid && s.inputInvalid]}
        />
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Kalender openen"
          style={({ pressed }) => [s.calBtn, pressed && s.pressed]}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {invalid ? <Text style={s.error}>Gebruik het formaat dd-mm-jjjj, bijvoorbeeld 12-09-2026.</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={s.backdrop}
          accessibilityRole="button"
          accessibilityLabel="Kalender sluiten"
          onPress={() => setOpen(false)}
        >
          {/* Stops a tap inside the card from closing the modal. */}
          <Pressable style={s.card} onPress={() => undefined}>
            <View style={s.calHead}>
              <Pressable
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Vorige maand"
                style={s.navBtn}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Text style={s.monthLabel}>
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Pressable
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                accessibilityRole="button"
                accessibilityLabel="Volgende maand"
                style={s.navBtn}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>

            <View style={s.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={s.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={s.grid}>
              {grid.map((day, i) => {
                if (day === null) return <View key={i} style={s.cell} />;
                const pad = (n: number) => String(n).padStart(2, '0');
                const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(day)}`;
                const isSelected = iso === selected;
                return (
                  <Pressable
                    key={i}
                    onPress={() => pick(day)}
                    accessibilityRole="button"
                    accessibilityLabel={`${day} ${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [s.cell, isSelected && s.cellOn, pressed && s.pressed]}
                  >
                    <Text style={[s.cellText, isSelected && s.cellTextOn]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    ...t.body,
    ...tabular,
    flex: 1,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    color: colors.text,
  },
  inputInvalid: { borderColor: colors.loss },
  calBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    marginTop: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  error: { ...t.meta, color: colors.loss, marginTop: spacing.xs },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,23,40,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { ...t.cardTitle },

  weekRow: { flexDirection: 'row' },
  weekday: { ...t.chip, color: colors.textMuted, width: `${100 / 7}%`, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  cell: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  cellOn: { backgroundColor: colors.primary },
  cellText: { ...t.body, ...tabular, color: colors.text },
  cellTextOn: { color: colors.onPrimary, fontWeight: '700' },
});
