/**
 * Chat tab — the payoff: an offline assistant running the tuned config,
 * with per-reply decode speed so the optimization stays visible.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { catalogById } from '../data/catalog';
import { Button, Card, Chip, Row } from '../components/ui';
import { SendIcon, StopIcon } from '../components/icons';
import { configLabel } from '../lib/tuner';
import type { ChatMessage } from '../types';

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
          {msg.prefillTps ? ` · prefill ${msg.prefillTps.toFixed(0)} t/s` : ''}
        </Text>
      )}
    </View>
  );
}

export function ChatScreen({ theme }: { theme: Theme }) {
  const messages = useStore(s => s.chatMessages);
  const generating = useStore(s => s.generating);
  const engineStatus = useStore(s => s.engineStatus);
  const engineError = useStore(s => s.engineError);
  const appliedConfig = useStore(s => s.appliedConfig);
  const appliedModelId = useStore(s => s.appliedModelId);
  const selectedModelId = useStore(s => s.selectedModelId);
  const models = useStore(s => s.models);
  const { sendMessage, stopGeneration, ensureChatEngine, clearChat } = useStore();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const modelId =
    appliedModelId && models[appliedModelId]?.status === 'ready'
      ? appliedModelId
      : selectedModelId;
  const model = catalogById(modelId);
  const modelReady = models[modelId]?.status === 'ready';

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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.s }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[type.largeTitle, { color: theme.inkPrimary }]}>Chat</Text>
          {messages.length > 0 && (
            <Pressable onPress={clearChat} hitSlop={8}>
              <Text style={[type.subhead, { color: theme.accent }]}>Clear</Text>
            </Pressable>
          )}
        </Row>
        <Row style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {model && <Chip theme={theme} label={`${model.name} ${model.quant}`} tone="accent" />}
          {appliedConfig ? (
            <Chip theme={theme} label={`Tuned · ${configLabel(appliedConfig)}`} tone="good" />
          ) : (
            <Chip theme={theme} label="Untuned defaults" tone="off" />
          )}
          {engineStatus === 'loading' && <Chip theme={theme} label="Loading model…" />}
        </Row>
      </View>

      {!modelReady ? (
        <View style={{ flex: 1, padding: spacing.xl, justifyContent: 'center' }}>
          <Card theme={theme}>
            <Text style={[type.headline, { color: theme.inkPrimary }]}>No model yet</Text>
            <Text style={[type.body, { color: theme.inkSecondary, marginTop: 6 }]}>
              Head to the Tune tab, download a model, and run the sweep. Chat runs
              completely offline with whatever config you apply.
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
                <Button theme={theme} label="Retry" kind="secondary" onPress={ensureChatEngine} />
              ) : null}
            </View>
          }
        />
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 10,
          paddingHorizontal: spacing.l,
          paddingTop: spacing.s,
          paddingBottom: spacing.m,
        }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={modelReady ? 'Message' : 'Download a model to chat'}
          placeholderTextColor={theme.inkMuted}
          editable={modelReady && !generating}
          multiline
          style={{
            flex: 1,
            minHeight: 42,
            maxHeight: 120,
            backgroundColor: theme.surface,
            borderColor: theme.hairline,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.control + 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: theme.inkPrimary,
            fontSize: 15,
          }}
        />
        <Pressable
          onPress={generating ? stopGeneration : send}
          disabled={!modelReady || (!generating && !draft.trim())}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor:
              generating || draft.trim() ? theme.accent : theme.fillStrong,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}>
          {generating ? (
            <StopIcon color={theme.onAccent} size={20} />
          ) : (
            <SendIcon
              color={draft.trim() ? theme.onAccent : theme.inkMuted}
              size={20}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
