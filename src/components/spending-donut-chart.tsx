import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

export type SpendingDonutSegment = {
  key: string;
  label: string;
  amount: number;
  percentage: number;
  color: string;
};

type SpendingDonutChartProps = {
  data: SpendingDonutSegment[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

const size = 174;
const center = size / 2;
const outerRadius = 82;
const innerRadius = 42;
const gapAngle = 3.2;
const cornerRadius = 7;
const selectedRadiusOffset = 3.6;

function polarToCartesian(angle: number, radius: number) {
  const angleInRadians = ((angle - 90) * Math.PI) / 180;

  return {
    x: center + radius * Math.cos(angleInRadians),
    y: center + radius * Math.sin(angleInRadians),
  };
}

function describeDonutSlice(startAngle: number, endAngle: number, radiusOffset = 0) {
  const resolvedOuterRadius = outerRadius + radiusOffset;
  const resolvedInnerRadius = Math.max(1, innerRadius - radiusOffset);
  const sweep = endAngle - startAngle;
  const innerArcLength = (sweep * Math.PI * resolvedInnerRadius) / 180;
  const resolvedCornerRadius = Math.min(
    cornerRadius,
    (resolvedOuterRadius - resolvedInnerRadius) / 2 - 1,
    innerArcLength / 2,
  );
  const outerCornerAngle = (resolvedCornerRadius / resolvedOuterRadius) * (180 / Math.PI);
  const innerCornerAngle = (resolvedCornerRadius / resolvedInnerRadius) * (180 / Math.PI);
  const outerStart = polarToCartesian(startAngle + outerCornerAngle, resolvedOuterRadius);
  const outerEnd = polarToCartesian(endAngle - outerCornerAngle, resolvedOuterRadius);
  const outerEndCorner = polarToCartesian(endAngle, resolvedOuterRadius);
  const outerEndSide = polarToCartesian(endAngle, resolvedOuterRadius - resolvedCornerRadius);
  const innerEndSide = polarToCartesian(endAngle, resolvedInnerRadius + resolvedCornerRadius);
  const innerEndCorner = polarToCartesian(endAngle, resolvedInnerRadius);
  const innerEnd = polarToCartesian(endAngle - innerCornerAngle, resolvedInnerRadius);
  const innerStart = polarToCartesian(startAngle + innerCornerAngle, resolvedInnerRadius);
  const innerStartCorner = polarToCartesian(startAngle, resolvedInnerRadius);
  const innerStartSide = polarToCartesian(startAngle, resolvedInnerRadius + resolvedCornerRadius);
  const outerStartSide = polarToCartesian(startAngle, resolvedOuterRadius - resolvedCornerRadius);
  const outerStartCorner = polarToCartesian(startAngle, resolvedOuterRadius);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${resolvedOuterRadius} ${resolvedOuterRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `Q ${outerEndCorner.x} ${outerEndCorner.y} ${outerEndSide.x} ${outerEndSide.y}`,
    `L ${innerEndSide.x} ${innerEndSide.y}`,
    `Q ${innerEndCorner.x} ${innerEndCorner.y} ${innerEnd.x} ${innerEnd.y}`,
    `A ${resolvedInnerRadius} ${resolvedInnerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    `Q ${innerStartCorner.x} ${innerStartCorner.y} ${innerStartSide.x} ${innerStartSide.y}`,
    `L ${outerStartSide.x} ${outerStartSide.y}`,
    `Q ${outerStartCorner.x} ${outerStartCorner.y} ${outerStart.x} ${outerStart.y}`,
    'Z',
  ].join(' ');
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function LegendItem({
  item,
  isSelected,
  onSelect,
}: {
  item: SpendingDonutSegment;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable style={[styles.legendItem, isSelected && styles.legendItemSelected]} onPress={onSelect}>
      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
      <View style={styles.legendTextGroup}>
        <Text style={styles.legendPercent}>{formatPercent(item.percentage)}</Text>
        <Text style={styles.legendLabel} numberOfLines={1}>
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

export function SpendingDonutChart({ data, selectedKey, onSelect }: SpendingDonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const leftItems = data.slice(2, 6);
  const rightItems = data.slice(0, 2);
  const segments = useMemo(() => {
    return data.reduce<{
      currentAngle: number;
      items: (SpendingDonutSegment & { startAngle: number; endAngle: number })[];
    }>(
      (accumulator, item) => {
        const sweep = total > 0 ? (item.amount / total) * 360 : 0;
        const angleGap = sweep > 2 ? Math.min(gapAngle, sweep * 0.35) : sweep * 0.2;
        const startAngle = accumulator.currentAngle + angleGap / 2;
        const endAngle = Math.max(startAngle + 0.1, accumulator.currentAngle + sweep - angleGap / 2);
        const segment = {
          ...item,
          endAngle,
          startAngle,
        };

        return {
          currentAngle: accumulator.currentAngle + sweep,
          items: [...accumulator.items, segment],
        };
      },
      { currentAngle: 0, items: [] }
    ).items;
  }, [data, total]);
  const renderedSegments = useMemo(() => {
    if (!selectedKey) {
      return segments;
    }

    return [
      ...segments.filter((item) => item.key !== selectedKey),
      ...segments.filter((item) => item.key === selectedKey),
    ];
  }, [segments, selectedKey]);

  return (
    <View style={styles.container}>
      <View style={styles.legendColumn}>
        {leftItems.map((item) => (
          <LegendItem
            key={item.key}
            item={item}
            isSelected={selectedKey === item.key}
            onSelect={() => onSelect(item.key)}
          />
        ))}
      </View>

      <View style={styles.chartWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G>
            <Path
              d={describeDonutSlice(0, 359.99)}
              fill="#25262d"
            />
            <Circle
              cx={center}
              cy={center}
              fill="transparent"
              r={outerRadius}
              stroke="#3a3b43"
              strokeWidth={3}
            />
            <Circle
              cx={center}
              cy={center}
              fill="transparent"
              r={innerRadius}
              stroke="#3a3b43"
              strokeWidth={3}
            />
            {renderedSegments.map((item) => {
              const isSelected = selectedKey === item.key;

              return (
                <Path
                  key={item.key}
                  d={describeDonutSlice(
                    item.startAngle,
                    item.endAngle,
                    isSelected ? selectedRadiusOffset : 0,
                  )}
                  fill={item.color}
                  onPress={() => onSelect(item.key)}
                  opacity={isSelected ? 1 : 0.92}
                />
              );
            })}
            <Circle
              cx={center}
              cy={center}
              fill="transparent"
              pointerEvents="none"
              r={outerRadius}
              stroke="#eceff5"
              strokeOpacity={0.3}
              strokeWidth={3.2}
            />
            <Circle
              cx={center}
              cy={center}
              fill="transparent"
              pointerEvents="none"
              r={innerRadius}
              stroke="#eceff5"
              strokeOpacity={0.3}
              strokeWidth={3.2}
            />
          </G>
        </Svg>
      </View>

      <View style={styles.legendColumn}>
        {rightItems.map((item) => (
          <LegendItem
            key={item.key}
            item={item}
            isSelected={selectedKey === item.key}
            onSelect={() => onSelect(item.key)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    elevation: 30,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    position: 'relative',
    zIndex: 30,
  },
  chartWrap: {
    alignItems: 'center',
    elevation: 31,
    height: size,
    justifyContent: 'center',
    position: 'relative',
    width: size,
    zIndex: 31,
  },
  legendColumn: {
    flex: 1,
    gap: 8,
    minWidth: 76,
  },
  legendItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  legendItemSelected: {
    backgroundColor: '#26262b',
    borderColor: '#ff4fa3',
  },
  legendDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 6,
    width: 8,
  },
  legendTextGroup: {
    flex: 1,
  },
  legendPercent: {
    color: '#f4f6f8',
    fontSize: 12,
    fontWeight: '800',
  },
  legendLabel: {
    color: '#9698a1',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
});
