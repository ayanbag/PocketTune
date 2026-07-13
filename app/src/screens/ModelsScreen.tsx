/**
 * Models tab — the marketplace. Three ways in, all first-class:
 *  1. curated catalog (verified Hugging Face GGUF links),
 *  2. any direct .gguf URL the user pastes,
 *  3. files adb-pushed into the models/ dir (auto-detected).
 * Every entry gets a device-fit assessment; the top pick is called out.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { Button, Card, Chip, Divider, ProgressBar, Row, SectionHeader } from '../components/ui';
import {
  CheckIcon,
  DownloadIcon,
  RefreshIcon,
  SparkleIcon,
  TrashIcon,
} from '../components/icons';
import { assessFit, pickRecommended, type ModelFit } from '../lib/recommend';
import type { ModelInfo } from '../types';

function bytesGb(n: number): string {
  return n > 0 ? `${(n / 1e9).toFixed(2)} GB` : 'size unknown';
}

function fitColor(theme: Theme, fit: ModelFit): string {
  switch (fit.level) {
    case 'great':
      return theme.goodText;
    case 'tight':
      return theme.warning;
    case 'too-big':
      return theme.critical;
    default:
      return theme.inkMuted;
  }
}

function ModelRow({
  theme,
  model,
  recommended,
}: {
  theme: Theme;
  model: ModelInfo;
  recommended: boolean;
}) {
  const state = useStore(s => s.models[model.id]);
  const selected = useStore(s => s.selectedModelId === model.id);
  const profile = useStore(s => s.profile);
  const { selectModel, startDownload, cancelDownload, removeModel } = useStore();
  const fit = assessFit(model, profile);
  const status = state?.status ?? 'none';

  return (
    <Pressable
      onPress={() => status === 'ready' && selectModel(model.id)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ paddingVertical: 12, gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 22, alignItems: 'center', paddingTop: 2 }}>
          {selected && status === 'ready' ? (
            <CheckIcon color={theme.accent} size={20} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <Text style={[type.headline, { color: theme.inkPrimary }]}>{model.name}</Text>
            <Chip theme={theme} label={model.quant} tone={selected ? 'accent' : 'neutral'} />
            {recommended && <Chip theme={theme} label="Recommended" tone="good" />}
            {model.source === 'custom' && <Chip theme={theme} label="Your URL" tone="off" />}
            {model.source === 'sideloaded' && <Chip theme={theme} label="Sideloaded" tone="off" />}
          </Row>
          <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
            {model.params} · {bytesGb(model.sizeBytes)}
          </Text>
          <Text style={[type.footnote, { color: fitColor(theme, fit), marginTop: 2 }]}>
            {fit.reason}
          </Text>
          {status === 'downloading' && state && (
            <View style={{ marginTop: 8, marginRight: 8 }}>
              <ProgressBar theme={theme} fraction={state.progress} />
              <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 4 }]}>
                {Math.round(state.progress * 100)}% · {(state.bytesWritten / 1e9).toFixed(2)} GB
              </Text>
            </View>
          )}
          {state?.error ? (
            <Text style={[type.footnote, { color: theme.critical, marginTop: 4 }]}>
              {state.error}
            </Text>
          ) : null}
        </View>
        {status === 'none' && model.url && (
          <Pressable onPress={() => startDownload(model.id)} hitSlop={10} style={{ paddingTop: 2 }}>
            <DownloadIcon color={fit.level === 'too-big' ? theme.inkMuted : theme.accent} size={22} />
          </Pressable>
        )}
        {status === 'downloading' && (
          <Pressable onPress={() => cancelDownload(model.id)} hitSlop={10} style={{ paddingTop: 2 }}>
            <Text style={[type.subhead, { color: theme.critical }]}>Cancel</Text>
          </Pressable>
        )}
        {status === 'ready' && (
          <Pressable
            onPress={() =>
              Alert.alert('Delete model?', `${model.file} will be removed from this device.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeModel(model.id) },
              ])
            }
            hitSlop={10}
            style={{ paddingTop: 2 }}>
            <TrashIcon color={theme.inkMuted} size={20} />
          </Pressable>
        )}
      </Row>
    </Pressable>
  );
}

export function ModelsScreen({ theme }: { theme: Theme }) {
  const modelList = useStore(s => s.modelList);
  const models = useStore(s => s.models);
  const profile = useStore(s => s.profile);
  const { addCustomModel, rescanModels, startDownload, selectModel, setTab } = useStore();
  const [url, setUrl] = useState('');
  const [urlNote, setUrlNote] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const recommended = pickRecommended(modelList, profile);
  const recommendedState = recommended ? models[recommended.id]?.status : undefined;
  const recommendedFit = recommended ? assessFit(recommended, profile) : null;

  // Ready models first, then by how well they suit this phone.
  const sorted = [...modelList].sort((a, b) => {
    const ra = models[a.id]?.status === 'ready' ? 1 : 0;
    const rb = models[b.id]?.status === 'ready' ? 1 : 0;
    if (ra !== rb) return rb - ra;
    return assessFit(b, profile).score - assessFit(a, profile).score;
  });

  const submitUrl = async () => {
    if (!url.trim() || adding) return;
    setAdding(true);
    setUrlNote(null);
    const err = await addCustomModel(url);
    setAdding(false);
    if (err) {
      setUrlNote(err);
    } else {
      setUrl('');
      setUrlNote('Added — downloading now.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <Row style={{ justifyContent: 'space-between', marginTop: spacing.s }}>
        <Text style={[type.largeTitle, { color: theme.inkPrimary }]}>Models</Text>
        <Pressable onPress={rescanModels} hitSlop={8}>
          <RefreshIcon color={theme.accent} size={22} />
        </Pressable>
      </Row>

      {recommended && (
        <View>
          <SectionHeader theme={theme} title="Recommended for this phone" />
          <Card theme={theme} style={{ gap: spacing.m }}>
            <Row style={{ gap: 10 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.control,
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <SparkleIcon color={theme.accent} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.headline, { color: theme.inkPrimary }]}>
                  {recommended.name} · {recommended.quant}
                </Text>
                <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 1 }]}>
                  {recommended.params} · {bytesGb(recommended.sizeBytes)}
                </Text>
              </View>
            </Row>
            {recommendedFit && (
              <Text style={[type.subhead, { color: theme.inkSecondary }]}>
                {recommendedFit.reason}. The Tune sweep verifies this with real
                measurements — heuristics pick the starting point, numbers pick
                the winner.
              </Text>
            )}
            {recommendedState === 'ready' ? (
              <Button
                theme={theme}
                label="Select and tune"
                kind="secondary"
                onPress={() => {
                  selectModel(recommended.id);
                  setTab('tune');
                }}
                icon={<CheckIcon color={theme.inkPrimary} size={18} />}
              />
            ) : recommendedState === 'downloading' ? null : (
              <Button
                theme={theme}
                label="Download"
                onPress={() => startDownload(recommended.id)}
                icon={<DownloadIcon color={theme.onAccent} size={18} />}
              />
            )}
          </Card>
        </View>
      )}

      <View>
        <SectionHeader theme={theme} title="Library" />
        <Card theme={theme} style={{ paddingVertical: spacing.xs }}>
          {sorted.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <Divider theme={theme} inset={34} />}
              <ModelRow theme={theme} model={m} recommended={m.id === recommended?.id} />
            </View>
          ))}
        </Card>
        <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 6, marginLeft: 4 }]}>
          Tap a downloaded model to select it for tuning and chat.
        </Text>
      </View>

      <View>
        <SectionHeader theme={theme} title="Bring your own" />
        <Card theme={theme} style={{ gap: spacing.m }}>
          <Text style={[type.subhead, { color: theme.inkSecondary }]}>
            Paste a direct link to any GGUF — every model here goes through the
            same detect → tune → chat pipeline.
          </Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://huggingface.co/…/resolve/main/model.gguf"
            placeholderTextColor={theme.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={{
              backgroundColor: theme.fill,
              borderColor: theme.hairline,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.control,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: theme.inkPrimary,
              fontSize: 13,
            }}
          />
          {urlNote ? (
            <Text style={[type.footnote, { color: theme.inkSecondary }]}>{urlNote}</Text>
          ) : null}
          <Button
            theme={theme}
            label="Add model"
            kind="secondary"
            onPress={submitUrl}
            disabled={!url.trim()}
            loading={adding}
            icon={<DownloadIcon color={theme.inkPrimary} size={18} />}
          />
          <Divider theme={theme} />
          <Text style={[type.footnote, { color: theme.inkMuted }]}>
            Developer path: `adb push model.gguf` into this app's files/models
            dir, then tap refresh above — sideloaded files are detected and
            registered automatically.
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}
