import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  createScorebord,
  awardPoint,
  placeKaats,
  removeKaats,
  isDecidingPoint,
  elapsedMs,
  formatKlok,
  ALLES_AAN_DE_HANG_PUNTEN,
  type ScorebordState,
  type Side,
} from '@kv/domain';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { scorebord as SB, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t, tabular } from '../../src/theme/typography';

/**
 * LIVE Scorebord.
 *
 * All rules live in packages/domain/src/competitie/scorebord.ts; this screen is the
 * surface. Every action produces a new state, so undo is simply stepping back through
 * a history stack rather than trying to reverse a mutation.
 *
 * Dark throughout, with oker-geel #D9A621 for the timer and logboek.
 */

export default function Scorebord() {
  const { isWide } = useBreakpoint();

  // Full history, so undo restores an exact earlier state.
  const [history, setHistory] = useState<ScorebordState[]>([createScorebord('red')]);
  const state = history[history.length - 1]!;

  const [now, setNow] = useState(() => Date.now());
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [wissel, setWissel] = useState<Side | null>(null);

  const wisselAnim = useRef(new Animated.Value(0)).current;

  // Ticks only while a partij is running.
  useEffect(() => {
    if (state.startedAtMs === null || state.finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.startedAtMs, state.finished]);

  /**
   * Applies an action to the LATEST state.
   *
   * Functional form, deliberately. Reading `state` from the render closure meant four
   * quick taps all applied to the same starting state and collapsed into a single
   * point — exactly what happens when someone taps fast at the side of a pitch.
   */
  const apply = useCallback((fn: (cur: ScorebordState, atMs: number) => ScorebordState) => {
    const atMs = Date.now();
    setHistory((h) => {
      const cur = h[h.length - 1]!;
      const next = fn(cur, atMs);
      // Unchanged (finished partij, illegal kaats) — do not grow the undo stack.
      return next === cur ? h : [...h, next];
    });
  }, []);

  // A wissel is announced by watching opslag change, rather than by firing a state
  // update from inside another state updater.
  const prevOpslag = useRef(state.opslag);
  useEffect(() => {
    if (state.opslag !== prevOpslag.current) {
      prevOpslag.current = state.opslag;
      setWissel(state.opslag);
    }
  }, [state.opslag]);

  // Wissel popup: fade and scale in, hold, fade out.
  useEffect(() => {
    if (!wissel) return;
    wisselAnim.setValue(0);
    Animated.sequence([
      Animated.timing(wisselAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.delay(900),
      Animated.timing(wisselAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setWissel(null);
    });
  }, [wissel, wisselAnim]);

  function point(side: Side) {
    apply((cur, atMs) => awardPoint(cur, side, atMs));
  }

  function undo() {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    setConfirmUndo(false);
  }

  function reset() {
    setHistory([createScorebord('red')]);
    setConfirmUndo(false);
    setShowLog(false);
  }

  const deciding = isDecidingPoint(state);
  const klok = formatKlok(elapsedMs(state, now));

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
        {/* Timer, in oker-geel. */}
        <View style={s.topRow}>
          <View style={s.timerBox}>
            <Ionicons name="time-outline" size={16} color={SB.oker} />
            <Text style={s.timer}>{klok}</Text>
          </View>
          <View style={s.opslagBox}>
            <Text style={s.opslagLabel}>Opslag</Text>
            <View
              style={[s.opslagDot, { backgroundColor: state.opslag === 'red' ? SB.red : SB.white }]}
            />
            <Text style={s.opslagTeam}>{state.opslag === 'red' ? 'Rood' : 'Wit'}</Text>
          </View>
        </View>

        {deciding ? (
          <View style={s.hangBanner}>
            <Text style={s.hangText}>
              Alles aan de hang — het volgende punt beslist ({ALLES_AAN_DE_HANG_PUNTEN} punten)
            </Text>
          </View>
        ) : null}

        {/* Eersten, the score that decides the partij. */}
        <View style={s.eerstenRow}>
          <ScorePanel
            label="Rood · Partuur 1"
            accent={SB.red}
            eersten={state.eerstenRed}
            punten={state.puntenRed}
            deciding={deciding}
          />
          <Text style={s.vs}>VS</Text>
          <ScorePanel
            label="Wit · Partuur 2"
            accent={SB.white}
            eersten={state.eerstenWhite}
            punten={state.puntenWhite}
            deciding={deciding}
          />
        </View>

        {/* Kaatsen: 1e white, 2e red. Placed and removed by hand; no score effect. */}
        <View style={s.kaatsRow}>
          <Text style={s.kaatsLabel}>Kaatsen</Text>
          <View style={s.kaatsBlocks}>
            <View style={[s.kaatsBlock, state.kaats1 ? s.kaats1On : s.kaatsOff]}>
              <Text style={[s.kaatsText, state.kaats1 && { color: SB.onWhite }]}>1e</Text>
            </View>
            <View style={[s.kaatsBlock, state.kaats2 ? s.kaats2On : s.kaatsOff]}>
              <Text style={[s.kaatsText, state.kaats2 && { color: SB.text }]}>2e</Text>
            </View>
          </View>
          <View style={s.kaatsBtns}>
            <Pressable
              onPress={() => apply(placeKaats)}
              disabled={state.finished || (state.kaats1 && state.kaats2)}
              accessibilityRole="button"
              accessibilityLabel="Kaats plaatsen"
              style={({ pressed }) => [
                s.kaatsBtn,
                (state.finished || (state.kaats1 && state.kaats2)) && s.disabled,
                pressed && s.pressed,
              ]}
            >
              <Ionicons name="add" size={18} color={SB.text} />
            </Pressable>
            <Pressable
              onPress={() => apply(removeKaats)}
              disabled={state.finished || (!state.kaats1 && !state.kaats2)}
              accessibilityRole="button"
              accessibilityLabel="Kaats verwijderen"
              style={({ pressed }) => [
                s.kaatsBtn,
                (state.finished || (!state.kaats1 && !state.kaats2)) && s.disabled,
                pressed && s.pressed,
              ]}
            >
              <Ionicons name="remove" size={18} color={SB.text} />
            </Pressable>
          </View>
        </View>

        {/* The two big scoring buttons. Long-press opens the undo confirmation. */}
        <View style={s.buttonRow}>
          <PointButton
            label="Rood"
            bg={SB.red}
            fg={SB.text}
            disabled={state.finished}
            onPress={() => point('red')}
            onLongPress={() => setConfirmUndo(true)}
          />
          <PointButton
            label="Wit"
            bg={SB.white}
            fg={SB.onWhite}
            disabled={state.finished}
            onPress={() => point('white')}
            onLongPress={() => setConfirmUndo(true)}
          />
        </View>

        {state.finished ? (
          <View style={s.wonBanner}>
            <Ionicons name="trophy" size={20} color={SB.oker} />
            <Text style={s.wonText}>
              {state.winner === 'red' ? 'Rood' : 'Wit'} wint de partij
            </Text>
          </View>
        ) : null}

        <View style={s.footerRow}>
          <Pressable
            onPress={() => setShowLog(true)}
            accessibilityRole="button"
            accessibilityLabel="Logboek openen"
            style={({ pressed }) => [s.footerBtn, pressed && s.pressed]}
          >
            <Ionicons name="list-outline" size={16} color={SB.oker} />
            <Text style={s.footerBtnText}>Logboek ({state.log.length})</Text>
          </Pressable>
          <Pressable
            onPress={reset}
            accessibilityRole="button"
            accessibilityLabel="Nieuwe partij starten"
            style={({ pressed }) => [s.footerBtn, pressed && s.pressed]}
          >
            <Ionicons name="refresh-outline" size={16} color={SB.muted} />
            <Text style={[s.footerBtnText, { color: SB.muted }]}>Reset</Text>
          </Pressable>
        </View>

        <Text style={s.hint}>
          Houd een scoreknop ingedrukt om de laatste actie ongedaan te maken.
        </Text>
      </ScrollView>

      {/* Undo confirmation. */}
      <Modal visible={confirmUndo} transparent animationType="fade" onRequestClose={() => setConfirmUndo(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Laatste actie ongedaan maken?</Text>
            <Text style={s.modalBody}>
              {history.length > 1
                ? (state.log[state.log.length - 1]?.text ?? 'De vorige stand wordt hersteld.')
                : 'Er is nog niets om ongedaan te maken.'}
            </Text>
            <View style={s.modalRow}>
              <Pressable
                onPress={() => setConfirmUndo(false)}
                accessibilityRole="button"
                accessibilityLabel="Annuleren"
                style={[s.modalBtn, s.modalGhost]}
              >
                <Text style={s.modalGhostText}>Annuleren</Text>
              </Pressable>
              <Pressable
                onPress={undo}
                disabled={history.length <= 1}
                accessibilityRole="button"
                accessibilityLabel="Ongedaan maken"
                style={[s.modalBtn, s.modalPrimary, history.length <= 1 && s.disabled]}
              >
                <Text style={s.modalPrimaryText}>Ongedaan maken</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logboek. */}
      <Modal visible={showLog} transparent animationType="slide" onRequestClose={() => setShowLog(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, s.logCard]}>
            <View style={s.logHead}>
              <Text style={s.modalTitle}>Logboek</Text>
              <Pressable
                onPress={() => setShowLog(false)}
                accessibilityRole="button"
                accessibilityLabel="Logboek sluiten"
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={SB.muted} />
              </Pressable>
            </View>
            <ScrollView style={s.logScroll}>
              {state.log.length === 0 ? (
                <Text style={s.modalBody}>Nog geen acties.</Text>
              ) : (
                state.log.map((l, i) => (
                  <View key={i} style={s.logRow}>
                    <Text style={s.logTime}>{formatKlok(l.atMs)}</Text>
                    <Text style={s.logText}>{l.text}</Text>
                    <Text style={s.logScore}>
                      {l.eerstenRed}-{l.eerstenWhite} · {l.puntenRed}-{l.puntenWhite}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Wissel announcement. */}
      {wissel ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.wisselOverlay,
            {
              opacity: wisselAnim,
              transform: [
                { scale: wisselAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
              ],
            },
          ]}
        >
          <View style={s.wisselCard}>
            <Ionicons name="swap-horizontal" size={26} color={SB.oker} />
            <Text style={s.wisselTitle}>Wissel</Text>
            <Text style={s.wisselBody}>
              {wissel === 'red' ? 'Rood' : 'Wit'} aan de opslag
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ScorePanel({
  label,
  accent,
  eersten,
  punten,
  deciding,
}: {
  label: string;
  accent: string;
  eersten: number;
  punten: number;
  deciding: boolean;
}) {
  // At alles aan de hang the deciding point is written as 8, so the reader can see at a
  // glance that this point ends the partij.
  const shownPunten = deciding ? ALLES_AAN_DE_HANG_PUNTEN : punten;
  return (
    <View style={s.panel}>
      <View style={[s.panelBar, { backgroundColor: accent }]} />
      <Text style={s.panelLabel}>{label}</Text>
      <Text style={s.eersten}>{eersten}</Text>
      <Text style={s.eerstenLabel}>eersten</Text>
      <Text style={[s.punten, deciding && { color: SB.oker }]}>{shownPunten}</Text>
      <Text style={s.puntenLabel}>punten</Text>
    </View>
  );
}

function PointButton({
  label,
  bg,
  fg,
  disabled,
  onPress,
  onLongPress,
}: {
  label: string;
  bg: string;
  fg: string;
  disabled: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={550}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Punt voor ${label}`}
      accessibilityHint="Ingedrukt houden om de laatste actie ongedaan te maken"
      style={({ pressed }) => [
        s.pointBtn,
        { backgroundColor: bg },
        disabled && s.disabled,
        pressed && s.pressed,
      ]}
    >
      <Text style={[s.pointBtnText, { color: fg }]}>{label}</Text>
      <Text style={[s.pointBtnPlus, { color: fg }]}>+</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SB.background },
  page: { padding: spacing.lg, paddingBottom: spacing.xxl },
  pageWide: { maxWidth: 760, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.35 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timer: { ...tabular, ...t.hero, fontSize: 26, lineHeight: 30, color: SB.oker },
  opslagBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  opslagLabel: { ...t.meta, color: SB.muted },
  opslagDot: { width: 10, height: 10, borderRadius: 5 },
  opslagTeam: { ...t.button, color: SB.text },

  hangBanner: {
    marginTop: spacing.md,
    backgroundColor: SB.okerSoft,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  hangText: { ...t.meta, color: SB.oker, textAlign: 'center' },

  eerstenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  vs: { ...t.sectionLabel, color: SB.muted },
  panel: { flex: 1, backgroundColor: SB.panel, borderRadius: radii.md, padding: spacing.md },
  panelBar: { height: 4, width: 34, borderRadius: 2, marginBottom: spacing.sm },
  panelLabel: { ...t.meta, color: SB.muted },
  eersten: { ...tabular, ...t.hero, fontSize: 60, lineHeight: 64, color: SB.text },
  eerstenLabel: { ...t.meta, color: SB.muted, marginTop: -6 },
  punten: { ...tabular, ...t.hero, fontSize: 30, lineHeight: 34, color: SB.text, marginTop: spacing.sm },
  puntenLabel: { ...t.meta, color: SB.muted, marginTop: -4 },

  kaatsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  kaatsLabel: { ...t.sectionLabel, color: SB.muted },
  kaatsBlocks: { flexDirection: 'row', gap: spacing.xs, flex: 1 },
  kaatsBlock: {
    width: 44,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SB.line,
  },
  kaatsOff: { backgroundColor: 'transparent' },
  kaats1On: { backgroundColor: SB.white, borderColor: SB.white },
  kaats2On: { backgroundColor: SB.red, borderColor: SB.red },
  kaatsText: { ...t.chip, color: SB.muted },
  kaatsBtns: { flexDirection: 'row', gap: spacing.xs },
  kaatsBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radii.sm,
    backgroundColor: SB.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  pointBtn: {
    flex: 1,
    height: 150,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointBtnText: { ...t.hero, fontSize: 26, lineHeight: 30 },
  pointBtnPlus: { ...t.hero, fontSize: 40, lineHeight: 44 },

  wonBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: SB.okerSoft,
    borderRadius: radii.md,
  },
  wonText: { ...t.cardTitle, color: SB.oker },

  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SB.line,
  },
  footerBtnText: { ...t.button, color: SB.oker },
  hint: { ...t.meta, color: SB.muted, textAlign: 'center', marginTop: spacing.md },

  modalBackdrop: {
    flex: 1,
    backgroundColor: SB.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: SB.panel,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  logCard: { maxHeight: '75%' },
  logHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logScroll: { marginTop: spacing.md },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SB.line,
  },
  logTime: { ...tabular, ...t.meta, color: SB.oker, width: 54 },
  logText: { ...t.body, color: SB.text, flex: 1 },
  logScore: { ...tabular, ...t.meta, color: SB.muted },

  modalTitle: { ...t.cardTitle, color: SB.text },
  modalBody: { ...t.meta, color: SB.muted, marginTop: spacing.xs },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBtn: {
    flex: 1,
    minHeight: MIN_TOUCH + 6,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhost: { borderWidth: StyleSheet.hairlineWidth, borderColor: SB.line },
  modalGhostText: { ...t.button, color: SB.text },
  modalPrimary: { backgroundColor: SB.oker },
  modalPrimaryText: { ...t.button, color: SB.onWhite },

  wisselOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wisselCard: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: SB.wisselCard,
    borderWidth: 1,
    borderColor: SB.oker,
  },
  wisselTitle: { ...t.hero, fontSize: 30, lineHeight: 34, color: SB.oker },
  wisselBody: { ...t.body, color: SB.text },
});
