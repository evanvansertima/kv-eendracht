import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../../src/lib/api';
import { useAsync } from '../../src/lib/useAsync';
import { useBreakpoint } from '../../src/lib/useBreakpoint';
import { formatRelative } from '../../src/lib/dates';
import { Card, Loading, ErrorState, EmptyState, Segmented } from '../../src/components/ui';
import { Fotos } from '../../src/components/Fotos';
import { colors, spacing } from '../../src/theme/tokens';
import { type as t } from '../../src/theme/typography';

const SECTIONS = ['Nieuws', 'Forum', "Foto's", 'Peilingen'] as const;
type Section = (typeof SECTIONS)[number];

export default function Community() {
  const { isWide } = useBreakpoint();
  const [section, setSection] = useState<Section>('Nieuws');

  const load = useCallback(
    () => Promise.all([api.news(), api.forumTopics(), api.activePoll()]),
    [],
  );
  const state = useAsync(load, []);

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'error')
    return <ErrorState message={state.message} onRetry={state.reload} />;

  const [news, topics, poll] = state.data;

  return (
    <ScrollView contentContainerStyle={[s.page, isWide && s.pageWide]}>
      <Segmented options={SECTIONS} value={section} onChange={setSection} />

      {section === 'Nieuws' &&
        (news.length === 0 ? (
          <EmptyState title="Nog geen nieuws" />
        ) : (
          news.map((n) => (
            <Card key={n.id}>
              <Text style={s.title}>{n.title}</Text>
              <Text style={s.meta}>
                {n.category ?? 'Nieuws'}
                {n.author_name ? ` · ${n.author_name}` : ''}
                {n.published_at ? ` · ${formatRelative(n.published_at)}` : ''}
              </Text>
              {n.intro ? <Text style={s.body}>{n.intro}</Text> : null}
            </Card>
          ))
        ))}

      {section === 'Forum' &&
        (topics.length === 0 ? (
          <EmptyState title="Nog geen berichten" hint="Start het eerste gesprek." />
        ) : (
          topics.map((t) => (
            <Card key={t.id}>
              <View style={s.rowBetween}>
                <Text style={s.title}>
                  {t.is_pinned ? '📌 ' : ''}
                  {t.title}
                </Text>
              </View>
              <Text style={s.meta}>
                {t.category_name ?? 'Algemeen'} · {t.author_name ?? 'Kaatsvriend'} ·{' '}
                {formatRelative(t.created_at)}
              </Text>
              <Text style={s.body} numberOfLines={2}>
                {t.body}
              </Text>
              <Text style={s.meta}>
                {t.reply_count} reacties · {t.like_count} likes
              </Text>
            </Card>
          ))
        ))}

      {section === "Foto's" && <Fotos />}

      {section === 'Peilingen' &&
        (poll ? (
          <Card>
            <Text style={s.title}>{poll.question}</Text>
            {poll.options.map((o) => (
              <View key={o.option_id} style={s.optionRow}>
                <Text style={s.optionLabel}>{o.label}</Text>
                <Text style={s.optionVotes}>{o.votes}</Text>
              </View>
            ))}
            <Text style={s.hint}>Stemmen kan zodra je bent ingelogd.</Text>
          </Card>
        ) : (
          <EmptyState title="Geen actieve peiling" />
        ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: spacing.lg, backgroundColor: colors.background },
  pageWide: { maxWidth: 900, width: '100%', alignSelf: 'center', padding: spacing.xxl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...t.cardTitle, flex: 1 },
  meta: { ...t.meta, marginTop: 2 },
  body: { ...t.body, color: colors.textMuted, marginTop: spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  optionLabel: { ...t.body, flex: 1 },
  optionVotes: { ...t.tableNumLead, color: colors.text },
  hint: { ...t.meta, marginTop: spacing.sm, fontStyle: 'italic' },
});
