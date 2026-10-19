import { useId } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeMode } from "@/hooks/use-theme-mode";

const background = require("../../assets/expo.icon/Assets/Serene Blue Abstract Gradient Wallpaper.png");

export function ScreenGradientBackground({ darkOnly = false }: { darkOnly?: boolean }) {
  const theme = useAppTheme();
  const isDark = useThemeMode() === "dark";
  const gradientId = `screenFade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (darkOnly && !isDark) return null;

  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      {!isDark ? <ImageBackground source={background} imageStyle={styles.image} style={StyleSheet.absoluteFill} /> : null}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.screenGradient.top.color} stopOpacity={theme.screenGradient.top.opacity} />
            <Stop offset="0.45" stopColor={theme.screenGradient.middle.color} stopOpacity={theme.screenGradient.middle.opacity} />
            <Stop offset="1" stopColor={theme.screenGradient.bottom.color} stopOpacity={theme.screenGradient.bottom.opacity} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ image: { opacity: 0.11 } });
