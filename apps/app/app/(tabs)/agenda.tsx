import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatEventMoment } from '../../src/lib/dates';
import { Card, Loading, ErrorState, EmptyState, Segmented } from '../../src/components/ui';
import { AgendaThumb } from '../../src/components/AgendaThumb';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

/** Free text plus a suggestion list, so a new category needs no migration (spec section 7). */
const TYPES = ['Alles', 'Competitie', 'Wedstrijd', 'Training'] as const;
type TypeFilter = (typeof TYPES)[number];

export default function Agenda() {
  const { isWide } = useBreakpoint();
  const [filter, setFilter] = useState<TypeFilter>('Alles');
  const [query, setQuery] = useState('');

  const load = useCallback(() => api.agenda(), []);
  const state = useAsync(load, []);

  const filtered = useMemo(() => {
    if (state.phase !== 'ready') return [];
    return state.data.filter((e) => {
      const matchesType =
        filter === 'Alles' || (e.event_type ?? '').toLowerCase().includes(filter.toLowerCase());
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q === '' ||
        e.title.toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [state, filter, query]);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Zoek in de agenda…"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Zoek in de agenda"
        style={s.search}
      />
      <Segmented options={TYPES} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <EmptyState
          title="Geen activiteiten gevonden"
          hint="Pas je zoekopdracht of filter aan."
        />
      ) : (
        filtered.map((e) => (
          <Card key={e.id}>
            <View style={s.itemRow}>
              <View style={s.itemText}>
                <Text style={s.title}>{e.title}</Text>
                <Text style={s.muted}>
                  {formatEventMoment(e.starts_at)}
                  {e.location ? ` · ${e.location}` : ''}
                </Text>
                {e.description ? (
                  <Text style={s.body} numberOfLines={3}>
                    {e.description}
                  </Text>
                ) : null}
              </View>
              {/* Right-hand thumbnail: the photo when there is one, otherwise a tile
                  carrying the event type. */}
              <AgendaThumb imageUrl={e.image_url} eventType={e.event_type} />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  search: {
    ...t.body,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    color: colors.text,
  },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemText: { flex: 1 },
  title: t.cardTitle,
  muted: { ...t.meta, marginTop: 2 },
  body: { ...t.body, color: colors.textMuted, marginTop: spacing.sm },
});
