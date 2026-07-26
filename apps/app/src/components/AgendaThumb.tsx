import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radii } from '../theme/tokens';

/**
 * Thumbnail on the right of an agenda item.
 *
 * Most events have no photo — the club is not going to source one for every training —
 * so the fallback is the normal case, not the exception. An empty grey box on every row
 * would read as broken; a tile carrying the event type reads as designed and tells the
 * reader something the title already implies but the eye picks up faster.
 *
 * Event type is free text with a suggestion list (spec section 7), so matching is on a
 * lowercase prefix and anything unrecognised gets the neutral tile rather than nothing.
 */

type TileStyle = { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string };

/**
 * Matched on a substring, in this order — the same `includes` rule the agenda filter
 * uses, so a tile and the filter never disagree about what an event is.
 *
 * Order matters: "kaatswedstrijd" contains both "wedstrijd" and (loosely) nothing else,
 * but a future "competitiewedstrijd" should read as competitie, so the more specific
 * term comes first.
 */
const TYPE_STYLES: [match: string, style: TileStyle][] = [
  ['competitie', { icon: 'stats-chart', bg: colors.primarySoft, fg: colors.primary }],
  ['wedstrijd', { icon: 'trophy', bg: colors.accentSoft, fg: colors.onAccentSoft }],
  ['training', { icon: 'fitness', bg: colors.primarySoft, fg: colors.primary }],
  ['vergadering', { icon: 'people', bg: colors.neutralChip, fg: colors.onNeutralChip }],
  ['feest', { icon: 'wine', bg: colors.accentSoft, fg: colors.onAccentSoft }],
];

const FALLBACK: TileStyle = {
  icon: 'calendar',
  bg: colors.neutralChip,
  fg: colors.onNeutralChip,
};

function styleFor(eventType: string | null): TileStyle {
  const key = (eventType ?? '').trim().toLowerCase();
  for (const [match, style] of TYPE_STYLES) {
    if (key.includes(match)) return style;
  }
  return FALLBACK;
}

export function AgendaThumb({
  imageUrl,
  eventType,
  size = 64,
}: {
  imageUrl: string | null;
  eventType: string | null;
  size?: number;
}) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[s.image, { width: size, height: size }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={eventType ? `Afbeelding bij ${eventType}` : 'Afbeelding'}
      />
    );
  }

  const style = styleFor(eventType);
  return (
    <View
      style={[s.tile, { width: size, height: size, backgroundColor: style.bg }]}
      // Decorative: the title and type are already read out beside it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Icon only. A label under it truncated to "KAATSWED…" at this size, which read
          as a rendering fault rather than as a category. The type is already visible in
          the filter chips and the event text beside it. */}
      <Ionicons name={style.icon} size={size * 0.44} color={style.fg} />
    </View>
  );
}

const s = StyleSheet.create({
  image: { borderRadius: radii.sm, backgroundColor: colors.neutralChip },
  tile: {
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
