import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import type { AIRecommendation } from '@/api/aiApi';
import { AppText as Text } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Typography } from '@/theme/typography';
import { currentRecommendations } from '@/utils/recommendationPresentation';

const priorityLabels: Record<string, string> = { HIGH: 'Ưu tiên cao', MEDIUM: 'Cần chú ý', LOW: 'Tham khảo', INFO: 'Thông tin' };

export function AIRecommendations({ recommendations }: { recommendations: AIRecommendation[] }) {
  const theme = useAppTheme();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
  const activePageSize = pageSizes[activeIndex];
  const activeHeight = activePageSize?.width === width ? activePageSize.height : undefined;
  const items = useMemo(() => currentRecommendations(recommendations), [recommendations]);

  // Keep the visible page aligned after rotation or a container width change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: activeIndexRef.current * width, animated: false });
  }, [width]);

  function showPage(index: number) {
    activeIndexRef.current = index;
    setActiveIndex(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { borderLeftColor: theme.primary }]}>
      <ScrollView
        ref={scrollRef}
        accessibilityLabel="Các khuyến nghị hành động"
        horizontal
        pagingEnabled
        directionalLockEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={items.length > 1 && width > 0}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        onScroll={({ nativeEvent }) => {
          if (width <= 0) return;
          const index = Math.max(0, Math.min(items.length - 1, Math.round(nativeEvent.contentOffset.x / width)));
          activeIndexRef.current = index;
          setActiveIndex(index);
        }}
        scrollEventThrottle={32}
        style={[styles.viewport, activeHeight !== undefined && { height: activeHeight }]}
        contentContainerStyle={styles.track}
      >
        {items.map((recommendation, index) => (
          <View
            key={`${recommendation.code}-${index}`}
            accessibilityElementsHidden={index !== activeIndex}
            importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}
            onLayout={({ nativeEvent }) => {
              const height = Math.ceil(nativeEvent.layout.height);
              setPageSizes((sizes) => sizes[index]?.height === height && sizes[index]?.width === width
                ? sizes : { ...sizes, [index]: { width, height } });
            }}
            style={[styles.page, { width: width || 220 }]}
          >
            <Text style={[styles.message, { color: theme.primary }]}>{priorityLabels[recommendation.priority] ?? recommendation.priority}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{recommendation.title}</Text>
            <Text style={[styles.message, { color: theme.textMuted }]}>{recommendation.message}</Text>
            <Text style={[styles.action, { color: theme.text }]}>{recommendation.action}</Text>
            {recommendation.actionTarget === 'budgets' || recommendation.actionTarget === 'transactions' ? (
              <Pressable accessibilityRole="button" style={styles.actionButton} onPress={() => router.navigate(recommendation.actionTarget === 'budgets' ? '/(tabs)/budgets' : '/(tabs)/transactions')}>
                <Text style={[styles.action, { color: theme.primary }]}>{recommendation.actionTarget === 'budgets' ? 'Xem ngân sách' : 'Xem giao dịch'}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {items.length > 1 ? (
        <View style={styles.pagination}>
          {items.map((recommendation, index) => (
            <Pressable
              key={`${recommendation.code}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Xem khuyến nghị ${index + 1}`}
              accessibilityState={{ selected: index === activeIndex }}
              disabled={width === 0}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              onPress={() => showPage(index)}
              style={[styles.indicatorButton, index === activeIndex && styles.indicatorButtonActive]}
            >
              <View style={[styles.indicator, { backgroundColor: index === activeIndex ? theme.primary : theme.border }]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderLeftWidth: 2, flex: 1, minWidth: 0, paddingLeft: 12 },
  viewport: { flexGrow: 0, minWidth: 0 },
  track: { alignItems: 'flex-start' },
  page: { flexShrink: 0, paddingRight: 4 },
  title: { ...Typography.caption, fontWeight: '600' },
  message: { ...Typography.caption, marginTop: 3 },
  action: { ...Typography.caption, marginTop: 6, fontWeight: '500' },
  actionButton: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 8 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 },
  indicatorButton: { width: 12, height: 14, flexShrink: 1, justifyContent: 'center' },
  indicatorButtonActive: { width: 24 },
  indicator: { height: 3, borderRadius: 2, width: '100%' },
});
