import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatEventMoment } from '../../src/lib/dates';
import { Card, Loading, ErrorState, EmptyState, Segmented } from '../../src/components/ui';
import { colors, spacing, radii, MIN_TOUCH } from '../../src/theme/tokens';

/** Free text plus a suggestion list, so a new category needs no migration (spec section 7). */
const TYPES = ['Alles', 'Competitie', 'Toernooi', 'Training', 'Vergadering', 'Overig'] as const;
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
        placeholderTextColor={colors.gray500}
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
    minHeight: MIN_TOUCH,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    color: colors.black,
  },
  title: { fontWeight: '700', fontSize: 15, color: colors.black },
  muted: { color: colors.gray500, marginTop: 2 },
  body: { color: colors.gray700, marginTop: spacing.sm },
});
