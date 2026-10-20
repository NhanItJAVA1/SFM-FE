import { useId, useState } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";

const background = require("../../assets/expo.icon/Assets/Serene Blue Abstract Gradient Wallpaper.png");

export function ScreenGradientBackground({ darkOnly = false }: { darkOnly?: boolean }) {
  const theme = useAppTheme();
  const isDark = useThemeMode() === "dark";
  const gradientId = `screenFade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  if (darkOnly && !isDark) return null;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((current) => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
      }}
    >
      {!isDark ? <ImageBackground source={background} imageStyle={styles.image} style={StyleSheet.absoluteFill} /> : null}
      {size.width > 0 && size.height > 0 ? <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Use full layout bounds even when iOS redraws only a visible scroll region. */}
          <LinearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={size.height}>
            <Stop offset="0" stopColor={theme.screenGradient.top.color} stopOpacity={theme.screenGradient.top.opacity} />
            <Stop offset="0.45" stopColor={theme.screenGradient.middle.color} stopOpacity={theme.screenGradient.middle.opacity} />
            <Stop offset="1" stopColor={theme.screenGradient.bottom.color} stopOpacity={theme.screenGradient.bottom.opacity} />
          </LinearGradient>
        </Defs>
        <Rect width={size.width} height={size.height} fill={`url(#${gradientId})`} />
      </Svg> : null}
    </View>
  );
}

const styles = StyleSheet.create({ image: { opacity: 0.11 } });
