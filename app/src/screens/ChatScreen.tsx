/**
 * Chat tab — the payoff: an offline assistant running the tuned config.
 *
 * This is the one screen a non-technical person will actually use, so the copy
 * here is plain English and the engine internals (thread counts, flash
 * attention, KV cache) stay on the Tune tab. The speed of each reply is still
 * shown — that is the whole point of the app — but as "how fast the reply came
 * out", not as a benchmark readout.
 *
 * Replies render as Markdown, with real code blocks (language label, no wrap,
 * copy button).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { Button, Card, Chip, Divider, Row } from '../components/ui';
import {
  ChipIcon,
  CloseIcon,
  CodeIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
  StopIcon,
  TrashIcon,
} from '../components/icons';
import { Sparkline } from '../components/charts';
import { Markdown } from '../components/markdown';
import { sessionStats, sessionTitle } from '../lib/chats';
import type { ChatMessage, ChatSession } from '../types';

/** Starter prompts shown ChatGPT-style above the input on an empty chat. */
const SUGGESTIONS: { Icon: typeof SparkleIcon; text: string }[] = [
  { Icon: SparkleIcon, text: 'What can you do with no internet?' },
  { Icon: CodeIcon, text: 'Write a Python script that renames my photos by date' },
  { Icon: ChipIcon, text: 'Explain what makes this phone fast, simply' },
];

/** Whether replies are getting slower — the shape of a phone heating up. */
function isSlowing(values: number[]): boolean {
  if (values.length < 3) return false;
  const first = values[0];
  const last = values[values.length - 1];
  return last < first * 0.92;
}

function IconButton({
  theme,
  onPress,
  children,
}: {
  theme: Theme;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: theme.fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      {children}
    </Pressable>
  );
}

/** Compact session speed strip: latest reply speed + the trend behind it. */
function SpeedStrip({ theme, values }: { theme: Theme; values: number[] }) {
  const latest = values[values.length - 1];
  const slowing = isSlowing(values);
  return (
    <Card
      theme={theme}
      style={{ paddingVertical: spacing.m, paddingHorizontal: spacing.l, marginTop: spacing.m }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[type.subhead, { color: theme.inkSecondary }]}>Reply speed</Text>
        <Row style={{ alignItems: 'baseline', gap: 3 }}>
          <Text style={[type.headline, { color: theme.inkPrimary }]}>{latest.toFixed(1)}</Text>
          <Text style={[type.footnote, { color: theme.inkMuted }]}>tokens/sec</Text>
        </Row>
      </Row>
      <View style={{ marginTop: 6 }}>
        <Sparkline theme={theme} values={values} height={30} showValue={false} />
      </View>
      <Text style={[type.footnote, { color: slowing ? theme.warning : theme.inkMuted, marginTop: 4 }]}>
        {slowing
          ? 'Slowing down as the phone warms up.'
          : 'Holding steady across this conversation.'}
      </Text>
    </Card>
  );
}

/** Three staggered pulsing dots — the reply is being generated. */
function ThinkingDots({ theme }: { theme: Theme }) {
  const dots = useRef([new Animated.Value(0.25), new Animated.Value(0.25), new Animated.Value(0.25)]).current;
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 320, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [dots]);
  return (
    <Row style={{ gap: 5, paddingVertical: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.inkMuted,
            opacity: v,
          }}
        />
      ))}
    </Row>
  );
}

/** How often the streaming bubble advances its visible text. */
const CHASE_INTERVAL_MS = 33;

/**
 * Memoized: while a reply is streaming, only that one bubble's `msg` identity
 * changes, so every other bubble skips re-parsing its Markdown.
 */
const Bubble = React.memo(function Bubble({ theme, msg }: { theme: Theme; msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const [detail, setDetail] = useState(false);
  const ink = isUser ? theme.onAccent : theme.inkPrimary;

  // ChatGPT-style flow: the store delivers text in ~150ms chunks (see
  // sendMessage), and this bubble smooths them out by advancing a visible
  // length a little every frame, rubber-banding toward whatever has arrived —
  // steady typewriter when the model is the bottleneck, quick catch-up at the
  // end. Only a bubble born empty animates; history renders complete at once.
  const streamedIn = useRef(!isUser && !msg.text);
  const targetLen = msg.text.length;
  const [shownLen, setShownLen] = useState(streamedIn.current ? 0 : targetLen);
  const caughtUp = shownLen >= targetLen;
  useEffect(() => {
    if (isUser || !streamedIn.current || caughtUp) return;
    const id = setInterval(() => {
      setShownLen(l =>
        l >= targetLen ? l : Math.min(targetLen, l + Math.max(2, Math.ceil((targetLen - l) / 12))),
      );
    }, CHASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isUser, targetLen, caughtUp]);

  const done = msg.tps != null && msg.tps > 0 && caughtUp;
  const shown = caughtUp ? msg.text : msg.text.slice(0, shownLen);
  const revealing = !done;

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'stretch',
        // Assistant replies go near-full width so code blocks have room; the
        // user's own turn stays a right-hugging bubble.
        maxWidth: isUser ? '84%' : '100%',
        marginVertical: 4,
      }}>
      <View
        style={{
          backgroundColor: isUser ? theme.accent : theme.surface,
          borderColor: theme.hairline,
          borderWidth: isUser ? 0 : StyleSheet.hairlineWidth,
          borderRadius: 18,
          borderBottomRightRadius: isUser ? 6 : 18,
          borderBottomLeftRadius: isUser ? 18 : 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}>
        {isUser ? (
          <Text style={[type.body, { color: ink }]}>{msg.text}</Text>
        ) : shown ? (
          <Markdown theme={theme} text={shown} color={ink} streaming={revealing} />
        ) : (
          <ThinkingDots theme={theme} />
        )}
      </View>

      {/* Speed + token count land after the reveal finishes — the end of the turn. */}
      {!isUser && !revealing && msg.tps != null && msg.tps > 0 && (
        <Pressable onPress={() => setDetail(d => !d)} hitSlop={6}>
          <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 3, marginLeft: 6 }]}>
            {detail
              ? `${msg.tps.toFixed(1)} tokens/sec · ${msg.tokens ?? 0} tokens in ${(
                  (msg.ms ?? 0) / 1000
                ).toFixed(1)}s${
                  msg.prefillTps ? ` · read your message at ${msg.prefillTps.toFixed(0)}/s` : ''
                }`
              : `${msg.tps.toFixed(1)} tokens/sec · ${msg.tokens ?? 0} tokens`}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

function SessionRow({
  theme,
  session,
  active,
  onOpen,
  onDelete,
}: {
  theme: Theme;
  session: ChatSession;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const stats = sessionStats(session);
  const model = useStore(s => s.modelList.find(m => m.id === session.modelId));
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ paddingVertical: 12, gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.headline, { color: theme.inkPrimary }]} numberOfLines={1}>
            {sessionTitle(session)}
          </Text>
          <Row style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <Chip
              theme={theme}
              label={model ? model.name : session.modelFile}
              tone={active ? 'accent' : 'neutral'}
            />
            <Chip
              theme={theme}
              label={session.tuned ? 'Tuned' : 'Default settings'}
              tone={session.tuned ? 'good' : 'off'}
            />
          </Row>
          <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 6 }]}>
            {new Date(session.updatedAt).toLocaleString()} · {stats.replies}{' '}
            {stats.replies === 1 ? 'reply' : 'replies'}
            {stats.avgTps != null ? ` · ${stats.avgTps.toFixed(1)} tokens/sec` : ''}
          </Text>
        </View>
        <Pressable onPress={onDelete} hitSlop={10} style={{ paddingTop: 2 }}>
          <TrashIcon color={theme.inkMuted} size={19} />
        </Pressable>
      </Row>
    </Pressable>
  );
}

function HistorySheet({
  theme,
  visible,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
}) {
  const sessions = useStore(s => s.chatSessions);
  const activeChatId = useStore(s => s.activeChatId);
  const { openChat, deleteChat } = useStore();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View
          style={{
            maxHeight: '78%',
            backgroundColor: theme.page,
            borderTopLeftRadius: radius.card + 4,
            borderTopRightRadius: radius.card + 4,
            paddingTop: spacing.l,
            paddingHorizontal: spacing.xl,
            paddingBottom: spacing.xxl,
          }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: spacing.m }}>
            <Text style={[type.title2, { color: theme.inkPrimary }]}>Your chats</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <CloseIcon color={theme.inkMuted} size={20} />
            </Pressable>
          </Row>
          {sessions.length === 0 ? (
            <Card theme={theme}>
              <Text style={[type.body, { color: theme.inkSecondary }]}>
                No conversations yet. Everything you say here is saved on this
                phone only — never uploaded.
              </Text>
            </Card>
          ) : (
            <Card theme={theme} style={{ paddingVertical: spacing.xs, flexShrink: 1 }}>
              <FlatList
                data={sessions}
                keyExtractor={s => s.id}
                ItemSeparatorComponent={() => <Divider theme={theme} />}
                renderItem={({ item }) => (
                  <SessionRow
                    theme={theme}
                    session={item}
                    active={item.id === activeChatId}
                    onOpen={() => {
                      openChat(item.id);
                      onClose();
                    }}
                    onDelete={() => deleteChat(item.id)}
                  />
                )}
              />
            </Card>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function ChatScreen({ theme }: { theme: Theme }) {
  const messages = useStore(s => s.chatMessages);
  const generating = useStore(s => s.generating);
  const engineStatus = useStore(s => s.engineStatus);
  const engineError = useStore(s => s.engineError);
  const applied = useStore(s => s.applied);
  const selectedModelId = useStore(s => s.selectedModelId);
  const models = useStore(s => s.models);
  const sessionCount = useStore(s => s.chatSessions.length);
  const { sendMessage, stopGeneration, ensureChatEngine, newChat, setTab } = useStore();
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  // Follow the reveal as it grows the content — but stop the moment the user
  // scrolls up to read something, and resume once they return to the bottom.
  const stickToEnd = useRef(true);

  const modelId = selectedModelId;
  const model = useStore(s => s.modelList.find(m => m.id === modelId));
  const modelReady = models[modelId]?.status === 'ready';
  // Only this model's own applied config counts — an untuned model runs on
  // defaults, so don't badge it with a config measured on a different one.
  const tuned = applied[modelId] != null;

  const tpsSeries = useMemo(
    () =>
      messages
        .filter(m => m.role === 'assistant' && m.tps != null && m.tps > 0)
        .map(m => m.tps as number),
    [messages],
  );

  useEffect(() => {
    if (modelReady && engineStatus === 'idle') {
      ensureChatEngine();
    }
  }, [modelReady, engineStatus, ensureChatEngine]);

  useEffect(() => {
    if (messages.length) {
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [messages]);

  const send = () => {
    const text = draft;
    setDraft('');
    sendMessage(text);
  };

  return (
    // Keyboard avoidance is handled by the app container (App.tsx pads by
    // the measured keyboard height) — no KeyboardAvoidingView here.
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.s }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[type.largeTitle, { color: theme.inkPrimary }]}>Chat</Text>
          <Row style={{ gap: 10 }}>
            {sessionCount > 0 && (
              <IconButton theme={theme} onPress={() => setHistoryOpen(true)}>
                <HistoryIcon color={theme.inkPrimary} size={20} />
              </IconButton>
            )}
            {messages.length > 0 && (
              <IconButton theme={theme} onPress={newChat}>
                <PlusIcon color={theme.inkPrimary} size={20} />
              </IconButton>
            )}
          </Row>
        </Row>
        {modelReady && (
          <Row style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {model && <Chip theme={theme} label={model.name} tone="accent" />}
            <Pressable onPress={() => setTab('tune')} hitSlop={6}>
              <Chip
                theme={theme}
                label={tuned ? 'Tuned for this phone' : 'Not tuned yet — tap to speed up'}
                tone={tuned ? 'good' : 'off'}
              />
            </Pressable>
            {engineStatus === 'loading' && <Chip theme={theme} label="Waking the model up…" />}
          </Row>
        )}
        {tpsSeries.length >= 2 && <SpeedStrip theme={theme} values={tpsSeries} />}
      </View>

      {!modelReady ? (
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <Card theme={theme} style={{ gap: spacing.m }}>
            <Text style={[type.headline, { color: theme.inkPrimary }]}>
              Nothing to chat with yet
            </Text>
            <Text style={[type.body, { color: theme.inkSecondary }]}>
              Pick a model from the Models tab and it downloads onto your
              phone. After that it works with no internet at all.
            </Text>
            <Button
              theme={theme}
              label="Choose a model"
              onPress={() => setTab('models')}
            />
          </Card>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <Bubble theme={theme} msg={item} />}
          onScroll={e => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            stickToEnd.current =
              contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
          }}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (stickToEnd.current && messages.length) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.l,
            paddingBottom: spacing.l,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <View style={{ flex: 1 }}>
              <View style={{ flex: 1, justifyContent: 'center', gap: spacing.m }}>
                <Text
                  style={[
                    type.body,
                    { color: theme.inkMuted, textAlign: 'center', paddingHorizontal: 30 },
                  ]}>
                  {engineError
                    ? "The model couldn't start. Try again, or pick a smaller one on the Models tab."
                    : 'This model runs on your phone. It works in airplane mode, and nothing you type is sent anywhere.'}
                </Text>
                {engineError ? (
                  <Button
                    theme={theme}
                    label="Try again"
                    kind="secondary"
                    onPress={ensureChatEngine}
                  />
                ) : null}
              </View>
              {!engineError && (
                <View style={{ paddingBottom: spacing.s }}>
                  {SUGGESTIONS.map(({ Icon, text }) => (
                    <Pressable
                      key={text}
                      onPress={() => sendMessage(text)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                      <Row style={{ gap: 14, paddingVertical: 12 }}>
                        <Icon color={theme.inkMuted} size={20} />
                        <Text style={[type.body, { color: theme.inkSecondary, flex: 1 }]}>
                          {text}
                        </Text>
                      </Row>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
        />
      )}

     
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          marginHorizontal: spacing.l,
          marginTop: spacing.s,
          marginBottom: spacing.m,
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 26,
          paddingLeft: 18,
          paddingRight: 6,
          paddingVertical: 6,
        }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={modelReady ? 'Ask anything' : 'Get a model first'}
          placeholderTextColor={theme.inkMuted}
          editable={modelReady && !generating}
          multiline
          style={{
            flex: 1,
            maxHeight: 120,
            paddingVertical: 8,
            paddingRight: 8,
            color: theme.inkPrimary,
            fontSize: 16,
          }}
        />
        <Pressable
          onPress={generating ? stopGeneration : send}
          disabled={!modelReady || (!generating && !draft.trim())}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: generating || draft.trim() ? theme.accent : theme.fillStrong,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}>
          {generating ? (
            <StopIcon color={theme.onAccent} size={19} />
          ) : (
            <SendIcon color={draft.trim() ? theme.onAccent : theme.inkMuted} size={19} />
          )}
        </Pressable>
      </View>

      <HistorySheet theme={theme} visible={historyOpen} onClose={() => setHistoryOpen(false)} />
    </View>
  );
}
