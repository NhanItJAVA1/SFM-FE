import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  useWindowDimensions,
  type ModalProps,
  type PressableProps,
  type ViewProps,
} from "react-native";

const PopupProgress = createContext<Animated.Value | null>(null);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BottomPopup({
  visible = false,
  children,
  onShow,
  animationType: _animationType,
  transparent: _transparent,
  ...props
}: ModalProps) {
  const [progress] = useState(() => new Animated.Value(0));
  const [isPresented, setIsPresented] = useState(visible);
  const isShown = useRef(false);
  const wantsVisible = useRef(visible);

  const animate = useCallback((toValue: number) => {
    Animated.timing(progress, {
      toValue,
      duration: toValue ? 260 : 190,
      easing: toValue ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !wantsVisible.current) {
        isShown.current = false;
        setIsPresented(false);
      }
    });
  }, [progress]);

  useEffect(() => {
    wantsVisible.current = visible;
    progress.stopAnimation();
    if (visible) {
      if (isShown.current) animate(1);
    } else if (isShown.current) {
      animate(0);
    }
    return () => progress.stopAnimation();
  }, [animate, visible, progress]);

  return (
    <Modal
      {...props}
      transparent
      animationType="none"
      visible={visible || isPresented}
      onShow={(event) => {
        isShown.current = true;
        setIsPresented(true);
        animate(wantsVisible.current ? 1 : 0);
        onShow?.(event);
      }}
    >
      <PopupProgress.Provider value={progress}>
        <Animated.View style={{ flex: 1, opacity: progress }}>
          {children}
        </Animated.View>
      </PopupProgress.Provider>
    </Modal>
  );
}

function useSheetMotion() {
  const progress = useContext(PopupProgress);
  const { height } = useWindowDimensions();
  return progress ? {
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
  } : undefined;
}

export function BottomPopupSheet({ style, ...props }: ViewProps) {
  const motion = useSheetMotion();
  return <Animated.View {...props} style={[style, motion]} />;
}

export function BottomPopupPressable({ style, ...props }: PressableProps) {
  const motion = useSheetMotion();
  return <AnimatedPressable {...props} style={(state) => [typeof style === "function" ? style(state) : style, motion]} />;
}
