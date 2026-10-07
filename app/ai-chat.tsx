import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { aiApi } from '@/api/aiApi';
import { FocusedScreenTransition } from '@/components/screen-transition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getAuthUser } from '@/stores/authSession';
import type { AppTheme } from '@/theme/appTheme';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const suggestedQuestions = [
  'Tình hình tài chính của tôi hiện tại thế nào?',
  'Tháng này tôi nên giảm chi tiêu ở đâu?',
  'Tôi có đang vượt ngân sách nào không?',
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AIChatScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const markdownStyles = useMemo(() => createMarkdownStyles(theme), [theme]);
  const markdownRules = useMemo(() => createMarkdownRules(styles), [styles]);
  const scrollRef = useRef<ScrollView | null>(null);
  const user = getAuthUser();
  const displayName = user?.displayName ?? user?.username ?? 'bạn';
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  async function sendQuestion(nextQuestion = question) {
    const trimmedQuestion = nextQuestion.trim();

    if (!trimmedQuestion || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      text: trimmedQuestion,
    };

    setQuestion('');
    setIsSending(true);
    setMessages((current) => [...current, userMessage]);
    scrollToBottom();

    try {
      const response = await aiApi.chat({ question: trimmedQuestion });
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        text: response.data.answer,
      };

      setMessages((current) => [...current, assistantMessage]);
      scrollToBottom();
    } catch (error) {
      Alert.alert('Không hỏi được AI', error instanceof Error ? error.message : 'Vui lòng thử lại sau.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <FocusedScreenTransition style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AuroraChatBackground theme={theme} />
        <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.chatLayer}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerIconButton}>
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                size={22}
                tintColor={theme.text}
                fallback={<Text style={styles.headerFallbackIcon}>‹</Text>}
              />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Trợ lý tài chính AI</Text>
              <Text style={styles.headerSubtitle}>Hỏi nhanh về dòng tiền của bạn</Text>
            </View>
            <View style={styles.aiMark}>
              <Text style={styles.aiMarkText}>AI</Text>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.messagesContent, messages.length === 0 && !isSending && styles.emptyMessagesContent]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToBottom}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 && !isSending ? (
              <InitialPrompt displayName={displayName} onSelect={sendQuestion} styles={styles} />
            ) : (
              messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  markdownRules={markdownRules}
                  markdownStyles={markdownStyles}
                  message={message}
                  styles={styles}
                />
              ))
            )}

            {isSending ? (
              <View style={[styles.bubbleRow, styles.assistantRow]}>
                <View style={[styles.bubble, styles.assistantBubble, styles.loadingBubble]}>
                  <ActivityIndicator color={theme.primary} />
                  <Text style={styles.loadingText}>AI đang phân tích...</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.inputRow}>
              <TextInput
                multiline
                editable={!isSending}
                placeholder="Hỏi AI về tài chính của bạn..."
                placeholderTextColor={theme.inputPlaceholder}
                style={styles.input}
                value={question}
                onChangeText={setQuestion}
              />
              <Pressable
                style={[styles.sendButton, (!question.trim() || isSending) && styles.sendButtonDisabled]}
                onPress={() => sendQuestion()}
                disabled={!question.trim() || isSending}
              >
                <SymbolView
                  name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
                  size={20}
                  tintColor={theme.textInverse}
                  fallback={<Text style={styles.sendFallbackIcon}>➤</Text>}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FocusedScreenTransition>
  );
}

function AuroraChatBackground({ theme }: { theme: AppTheme }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="auroraRose" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#ff7a59" stopOpacity="0.42" />
          <Stop offset="44%" stopColor="#ff4fa3" stopOpacity="0.19" />
          <Stop offset="100%" stopColor={theme.screen} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auroraGold" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#ffd166" stopOpacity="0.38" />
          <Stop offset="42%" stopColor="#ff9f43" stopOpacity="0.17" />
          <Stop offset="100%" stopColor={theme.screen} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auroraGreen" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#31c452" stopOpacity="0.24" />
          <Stop offset="50%" stopColor="#18cdb0" stopOpacity="0.12" />
          <Stop offset="100%" stopColor={theme.screen} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={theme.screen} />
      <Ellipse cx="8%" cy="18%" rx="62%" ry="30%" fill="url(#auroraRose)" transform="rotate(-24 35 120)" />
      <Ellipse cx="86%" cy="22%" rx="58%" ry="28%" fill="url(#auroraGold)" transform="rotate(20 335 145)" />
      <Ellipse cx="22%" cy="58%" rx="55%" ry="22%" fill="url(#auroraGold)" transform="rotate(18 95 390)" />
      <Ellipse cx="86%" cy="68%" rx="62%" ry="27%" fill="url(#auroraRose)" transform="rotate(-20 335 455)" />
      <Ellipse cx="50%" cy="40%" rx="44%" ry="20%" fill="url(#auroraGreen)" transform="rotate(-8 200 270)" />
    </Svg>
  );
}

function InitialPrompt({
  displayName,
  onSelect,
  styles,
}: {
  displayName: string;
  onSelect: (question: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.initialPrompt}>
      <Text style={styles.initialEyebrow}>SFM AI</Text>
      <Text style={styles.initialTitle}>Xin chào, {displayName}</Text>
      <Text style={styles.initialSubtitle}>Bạn muốn xem nhanh điều gì hôm nay?</Text>
      <View style={styles.quickOptions}>
        {suggestedQuestions.map((item) => (
          <Pressable key={item} style={styles.quickOption} onPress={() => onSelect(item)}>
            <Text style={styles.quickOptionText}>{item}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChatBubble({
  markdownRules,
  markdownStyles,
  message,
  styles,
}: {
  markdownRules: ReturnType<typeof createMarkdownRules>;
  markdownStyles: ReturnType<typeof createMarkdownStyles>;
  message: ChatMessage;
  styles: ReturnType<typeof createStyles>;
}) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {isUser ? (
          <Text style={styles.userMessageText}>{message.text}</Text>
        ) : (
          <AIAnswer markdownRules={markdownRules} markdownStyles={markdownStyles} text={message.text} />
        )}
      </View>
    </View>
  );
}

function AIAnswer({
  markdownRules,
  markdownStyles,
  text,
}: {
  markdownRules: ReturnType<typeof createMarkdownRules>;
  markdownStyles: ReturnType<typeof createMarkdownStyles>;
  text: string;
}) {
  return (
    <Markdown mergeStyle={false} rules={markdownRules} style={markdownStyles}>
      {text}
    </Markdown>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { backgroundColor: theme.screen, flex: 1 },
    chatLayer: { flex: 1 },
    header: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      flexDirection: 'row',
      gap: 12,
      minHeight: 70,
      paddingHorizontal: 14,
    },
    headerIconButton: {
      alignItems: 'center',
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 20,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    headerFallbackIcon: { color: theme.text, fontSize: 30, lineHeight: 32 },
    headerTitleWrap: { flex: 1 },
    headerTitle: { color: theme.text, fontSize: 18, fontWeight: '900' },
    headerSubtitle: { color: theme.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
    aiMark: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 18,
      height: 36,
      justifyContent: 'center',
      width: 36,
    },
    aiMarkText: { color: theme.textInverse, fontSize: 13, fontWeight: '900' },
    messagesContent: { flexGrow: 1, gap: 14, padding: 14, paddingBottom: 18 },
    emptyMessagesContent: { justifyContent: 'center' },
    initialPrompt: {
      alignItems: 'center',
      alignSelf: 'center',
      maxWidth: 430,
      paddingHorizontal: 10,
      width: '100%',
    },
    initialEyebrow: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    initialTitle: {
      color: theme.text,
      fontSize: 29,
      fontWeight: '900',
      lineHeight: 35,
      textAlign: 'center',
    },
    initialSubtitle: {
      color: theme.textMuted,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 22,
      marginTop: 8,
      textAlign: 'center',
    },
    quickOptions: {
      gap: 10,
      marginTop: 24,
      width: '100%',
    },
    quickOption: {
      backgroundColor: `${theme.card}e8`,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      minHeight: 50,
      justifyContent: 'center',
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    quickOptionText: { color: theme.text, fontSize: 14, fontWeight: '800', lineHeight: 20, textAlign: 'center' },
    bubbleRow: { flexDirection: 'row' },
    assistantRow: { justifyContent: 'flex-start' },
    userRow: { justifyContent: 'flex-end' },
    bubble: { borderRadius: 8, maxWidth: '88%', padding: 13 },
    assistantBubble: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, width: '88%' },
    userBubble: { backgroundColor: theme.primary },
    userMessageText: { color: theme.textInverse, fontSize: 15, fontWeight: '700', lineHeight: 21 },
    markdownTableScroll: { marginVertical: 8, maxWidth: '100%' },
    markdownTable: { minWidth: 460 },
    loadingBubble: { alignItems: 'center', flexDirection: 'row', gap: 10 },
    loadingText: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
    footer: {
      backgroundColor: `${theme.screen}e8`,
      borderTopColor: `${theme.border}b3`,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 10,
      padding: 12,
      paddingBottom: Platform.select({ ios: 18, default: 12 }),
    },
    inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
    input: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      flex: 1,
      fontSize: 15,
      maxHeight: 120,
      minHeight: 48,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    sendButton: {
      alignItems: 'center',
      backgroundColor: theme.primary,
      borderRadius: 8,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    sendButtonDisabled: { opacity: 0.45 },
    sendFallbackIcon: { color: theme.textInverse, fontSize: 20, fontWeight: '900' },
  });
}

function createMarkdownRules(styles: ReturnType<typeof createStyles>) {
  return {
    table: (node: { key: string }, children: ReactNode, _parent: unknown, markdownStyles: ReturnType<typeof createMarkdownStyles>) => (
      <ScrollView
        key={node.key}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        style={styles.markdownTableScroll}
      >
        <View style={[markdownStyles.table, styles.markdownTable]}>{children}</View>
      </ScrollView>
    ),
  };
}

function createMarkdownStyles(theme: AppTheme) {
  return StyleSheet.create({
    body: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 21 },
    bullet_list: { marginVertical: 4 },
    code_inline: {
      backgroundColor: theme.cardAlt,
      borderRadius: 4,
      color: theme.text,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      paddingHorizontal: 4,
    },
    fence: {
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontSize: 12,
      padding: 10,
    },
    heading1: { color: theme.text, fontSize: 20, fontWeight: '900', lineHeight: 27, marginBottom: 8, marginTop: 8 },
    heading2: { color: theme.text, fontSize: 18, fontWeight: '900', lineHeight: 25, marginBottom: 7, marginTop: 8 },
    heading3: { color: theme.text, fontSize: 16, fontWeight: '900', lineHeight: 22, marginBottom: 6, marginTop: 7 },
    hr: { backgroundColor: theme.border, height: 1, marginVertical: 10 },
    list_item: { color: theme.text, marginVertical: 2 },
    ordered_list: { marginVertical: 4 },
    paragraph: { color: theme.text, fontSize: 14, fontWeight: '600', lineHeight: 21, marginBottom: 7, marginTop: 0 },
    strong: { color: theme.text, fontWeight: '900' },
    table: { borderColor: theme.border, borderRadius: 8, borderWidth: 1, marginVertical: 8 },
    td: { borderColor: theme.border, color: theme.text, fontSize: 12, lineHeight: 17, padding: 6 },
    th: {
      backgroundColor: theme.cardAlt,
      borderColor: theme.border,
      color: theme.text,
      fontSize: 12,
      fontWeight: '900',
      padding: 6,
    },
  });
}
