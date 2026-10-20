import { useEffect, useState } from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/hooks/use-app-theme";
import { getAmountSuggestions } from "@/utils/amountSuggestions";

type Props = {
  nativeID: string;
  input: string;
  selectedAmount: string;
  focused: boolean;
  onSelect: (amount: number) => void;
};

export function AmountSuggestions({ nativeID, input, selectedAmount, focused, onSelect }: Props) {
  const theme = useAppTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const suggestions = getAmountSuggestions(input);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const toolbar = suggestions.length && focused ? (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={[styles.toolbar, { backgroundColor: theme.sheet, borderTopColor: theme.border }]} contentContainerStyle={styles.toolbarContent}>
      {suggestions.map((amount, index) => (
        <Pressable
          key={amount}
          accessibilityRole="button"
          accessibilityLabel={`Điền ${new Intl.NumberFormat("vi-VN").format(amount)} đồng`}
          accessibilityState={{ selected: Number(selectedAmount) === amount }}
          onPress={() => onSelect(amount)}
          style={({ pressed }) => [styles.option, { borderLeftWidth: index ? StyleSheet.hairlineWidth : 0, borderLeftColor: theme.border, backgroundColor: pressed ? theme.primaryPressed : "transparent" }]}
        >
          <Text numberOfLines={1} style={[styles.amount, { color: Number(selectedAmount) === amount ? theme.primary : theme.text }]}>
            {new Intl.NumberFormat("vi-VN").format(amount)} đ
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  ) : null;

  if (Platform.OS === "ios") {
    // Keep the native accessory registered before the amount field gains focus.
    return <InputAccessoryView nativeID={nativeID} backgroundColor={theme.sheet}><View>{toolbar}</View></InputAccessoryView>;
  }
  // The existing KeyboardAvoidingView owns keyboard displacement on Android.
  return Platform.OS === "android" && keyboardVisible ? toolbar : null;
}

const styles = StyleSheet.create({
  toolbar: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth },
  toolbarContent: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8 },
  option: { flexShrink: 0, height: 45, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  amount: { fontSize: 25, lineHeight: 45, fontWeight: "600" },
});
