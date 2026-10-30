import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '@/hooks/use-app-theme';

// The raised button stays inside the tab bar's bounds so its whole surface is tappable.
export const TAB_BAR_RAISE = 36;
export const CURVED_TAB_BAR_HEIGHT = TAB_BAR_RAISE + 60;
export const CREATE_BUTTON_SIZE = 56;
export const CREATE_BUTTON_TOP = 8;

export function getCurvedTabBarPaths(width: number, height: number) {
  const center = width / 2;
  const radius = CREATE_BUTTON_SIZE / 2 + 4;
  const centerY = CREATE_BUTTON_TOP + CREATE_BUTTON_SIZE / 2;
  const entryX = radius * Math.cos(Math.PI / 10);
  const entryY = centerY + radius * Math.sin(Math.PI / 10);
  const tangentX = 8 * Math.sin(Math.PI / 10);
  const tangentY = 8 * Math.cos(Math.PI / 10);
  const halfNotch = radius + 12;
  const edge = [
    `M 0 ${TAB_BAR_RAISE}`,
    `H ${center - halfNotch}`,
    `C ${center - halfNotch + 6} ${TAB_BAR_RAISE} ${center - entryX - tangentX} ${entryY - tangentY} ${center - entryX} ${entryY}`,
    `A ${radius} ${radius} 0 0 0 ${center + entryX} ${entryY}`,
    `C ${center + entryX + tangentX} ${entryY - tangentY} ${center + halfNotch - 6} ${TAB_BAR_RAISE} ${center + halfNotch} ${TAB_BAR_RAISE}`,
    `H ${width}`,
  ].join(' ');

  return { edge, surface: `${edge} L ${width} ${height} L 0 ${height} Z` };
}

export function CurvedTabBarBackground({ height }: { height: number }) {
  const theme = useAppTheme();
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState(dimensions.width);
  const paths = getCurvedTabBarPaths(width, height);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={paths.surface} fill={theme.tabBar} />
        <Path d={paths.edge} fill="none" stroke={theme.primary} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
