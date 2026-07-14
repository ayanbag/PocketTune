/**
 * Chat tab — the payoff: an offline assistant running the tuned config,
 * with per-reply decode speed so the optimization stays visible.
 *
 * Every conversation persists as a session with its metadata (model, applied
 * config, per-reply tok/s and token counts); the history sheet lets you reopen
 * or delete them, and a sparkline tracks decode speed across the session —
 * thermal droop shows up as a downward drift.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
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
  BoltIcon,
  ChipIcon,
  CloseIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  SparkleIcon,
  StopIcon,
  TrashIcon,
} from '../components/icons';
import { Sparkline } from '../components/charts';
import { configLabel } from '../lib/tuner';
import { sessionStats, sessionTitle } from '../lib/chats';
import type { ChatMessage, ChatSession } from '../types';

/** Starter prompts shown ChatGPT-style above the input on an empty chat. */
const SUGGESTIONS: { Icon: typeof SparkleIcon; text: string }[] = [
  { Icon: SparkleIcon, text: 'What can you do running fully offline?' },
  { Icon: ChipIcon, text: "Explain this phone's AI hardware simply" },
  { Icon: BoltIcon, text: 'Write a haiku about saving battery' },
];

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

function Bubble({ theme, msg }: { theme: Theme; msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '84%',
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
          paddingVertical: 9,
        }}>
        <Text
          style={[
            type.body,
            { color: isUser ? theme.onAccent : theme.inkPrimary },
          ]}>
          {msg.text || '…'}
        </Text>
      </View>
      {msg.tps != null && msg.tps > 0 && (
        <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 3, marginLeft: 6 }]}>
          {msg.tps.toFixed(1)} tok/s
          {msg.tokens ? ` · ${msg.tokens} tok` : ''}
          {msg.prefillTps ? ` · prefill ${msg.prefillTps.toFixed(0)} t/s` : ''}
        </Text>
      )}
    </View>
  );
}

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
              label={model ? `${model.name} ${model.quant}` : session.modelFile}
              tone={active ? 'accent' : 'neutral'}
            />
            <Chip
              theme={theme}
              label={session.config ? configLabel(session.config) : 'untuned'}
              tone={session.tuned ? 'good' : 'off'}
            />
          </Row>
          <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 6 }]}>
            {new Date(session.updatedAt).toLocaleString()} · {stats.replies}{' '}
            {stats.replies === 1 ? 'reply' : 'replies'}
            {stats.avgTps != null ? ` · ${stats.avgTps.toFixed(1)} tok/s avg` : ''}
            {stats.totalTokens ? ` · ${stats.totalTokens} tok` : ''}
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
            <Text style={[type.title2, { color: theme.inkPrimary }]}>Chat history</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <CloseIcon color={theme.inkMuted} size={20} />
            </Pressable>
          </Row>
          {sessions.length === 0 ? (
            <Card theme={theme}>
              <Text style={[type.body, { color: theme.inkSecondary }]}>
                No conversations yet. Every chat is saved on-device with the
                model and config it ran under.
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
  const { sendMessage, stopGeneration, ensureChatEngine, newChat } = useStore();
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const modelId = selectedModelId;
  const model = useStore(s => s.modelList.find(m => m.id === modelId));
  const modelReady = models[modelId]?.status === 'ready';
  // Only this model's own applied config counts — an untuned model runs on
  // defaults, so don't badge it with a config measured on a different one.
  const tunedConfig = applied[modelId]?.config ?? null;

  const tpsSeries = messages
    .filter(m => m.role === 'assistant' && m.tps != null && m.tps > 0)
    .map(m => m.tps as number);

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
            {model && <Chip theme={theme} label={`${model.name} ${model.quant}`} tone="accent" />}
            {tunedConfig ? (
              <Chip theme={theme} label={`Tuned · ${configLabel(tunedConfig)}`} tone="good" />
            ) : (
              <Chip theme={theme} label="Untuned defaults" tone="off" />
            )}
            {engineStatus === 'loading' && <Chip theme={theme} label="Loading model…" />}
          </Row>
        )}
        {tpsSeries.length >= 2 && (
          <View style={{ marginTop: spacing.s }}>
            <Sparkline theme={theme} values={tpsSeries} unit="t/s" />
            <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
              Decode speed per reply this session — a downward drift means the
              phone is heating up.
            </Text>
          </View>
        )}
      </View>

      {!modelReady ? (
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <Card theme={theme}>
            <Text style={[type.headline, { color: theme.inkPrimary }]}>No model yet</Text>
            <Text style={[type.body, { color: theme.inkSecondary, marginTop: 6 }]}>
              Grab a model from the Models tab, then run the sweep on the Tune
              tab. Chat runs completely offline with whatever config you apply.
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <Bubble theme={theme} msg={item} />}
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
                    ? `Engine failed to load: ${engineError}`
                    : 'Everything below runs on this phone’s Arm CPU. Airplane mode welcome.'}
                </Text>
                {engineError ? (
                  <Button
                    theme={theme}
                    label="Retry"
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

      {/* ChatGPT-style pill: input and send button share one rounded field. */}
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
          placeholder={modelReady ? 'Ask anything — offline' : 'Download a model to chat'}
          placeholderTextColor={theme.inkMuted}
          editable={modelReady && !generating}
          multiline
          style={{
            flex: 1,
            maxHeight: 120,
            paddingVertical: 8,
            paddingRight: 8,
            color: theme.inkPrimary,
            fontSize: 15,
          }}
        />
        <Pressable
          onPress={generating ? stopGeneration : send}
          disabled={!modelReady || (!generating && !draft.trim())}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor:
              generating || draft.trim() ? theme.accent : theme.fillStrong,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}>
          {generating ? (
            <StopIcon color={theme.onAccent} size={19} />
          ) : (
            <SendIcon
              color={draft.trim() ? theme.onAccent : theme.inkMuted}
              size={19}
            />
          )}
        </Pressable>
      </View>

      <HistorySheet theme={theme} visible={historyOpen} onClose={() => setHistoryOpen(false)} />
    </View>
  );
}
