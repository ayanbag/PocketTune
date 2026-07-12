/**
 * Tune tab — the product's core loop: pick a model, sweep configs on this
 * phone, see the measured winner, apply it.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { CATALOG, catalogById } from '../data/catalog';
import {
  Button,
  Card,
  Chip,
  Divider,
  ProgressBar,
  Row,
  SectionHeader,
  Segmented,
} from '../components/ui';
import { HBars, RingGauge } from '../components/charts';
import { CheckIcon, DownloadIcon, SparkleIcon, TrashIcon } from '../components/icons';
import { configLabel } from '../lib/tuner';

function bytesGb(n: number): string {
  return `${(n / 1e9).toFixed(2)} GB`;
}

function ModelRow({ theme, id }: { theme: Theme; id: string }) {
  const model = catalogById(id)!;
  const state = useStore(s => s.models[id]);
  const selected = useStore(s => s.selectedModelId === id);
  const { selectModel, startDownload, cancelDownload, removeModel } = useStore();

  return (
    <Pressable
      onPress={() => state.status === 'ready' && selectModel(id)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ paddingVertical: 12, gap: 12 }}>
        <View
          style={{
            width: 22,
            alignItems: 'center',
          }}>
          {selected && state.status === 'ready' ? (
            <CheckIcon color={theme.accent} size={20} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Row style={{ gap: 8 }}>
            <Text style={[type.headline, { color: theme.inkPrimary }]}>{model.name}</Text>
            <Chip theme={theme} label={model.quant} tone={selected ? 'accent' : 'neutral'} />
          </Row>
          <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
            {model.params} · {bytesGb(model.sizeBytes)}
          </Text>
          {state.status === 'downloading' && (
            <View style={{ marginTop: 8, marginRight: 8 }}>
              <ProgressBar theme={theme} fraction={state.progress} />
              <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 4 }]}>
                {Math.round(state.progress * 100)}% · {bytesGb(state.bytesWritten)}
              </Text>
            </View>
          )}
          {state.error ? (
            <Text style={[type.footnote, { color: theme.critical, marginTop: 4 }]}>
              {state.error}
            </Text>
          ) : null}
        </View>
        {state.status === 'none' && (
          <Pressable onPress={() => startDownload(id)} hitSlop={10}>
            <DownloadIcon color={theme.accent} size={22} />
          </Pressable>
        )}
        {state.status === 'downloading' && (
          <Pressable onPress={() => cancelDownload(id)} hitSlop={10}>
            <Text style={[type.subhead, { color: theme.critical }]}>Cancel</Text>
          </Pressable>
        )}
        {state.status === 'ready' && (
          <Pressable
            onPress={() =>
              Alert.alert('Delete model?', `${model.file} will be removed from this device.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeModel(id) },
              ])
            }
            hitSlop={10}>
            <TrashIcon color={theme.inkMuted} size={20} />
          </Pressable>
        )}
      </Row>
    </Pressable>
  );
}

export function TuneScreen({ theme }: { theme: Theme }) {
  const tune = useStore(s => s.tune);
  const selectedModelId = useStore(s => s.selectedModelId);
  const models = useStore(s => s.models);
  const appliedConfig = useStore(s => s.appliedConfig);
  const battery = useStore(s => s.battery);
  const { startTune, applyBest } = useStore();
  const [mode, setMode] = useState<'quick' | 'full'>('quick');

  const modelReady = models[selectedModelId]?.status === 'ready';
  const run = tune.lastRun;
  const lowBattery = battery?.levelPct != null && battery.levelPct < 20;

  const applied =
    run != null &&
    appliedConfig != null &&
    JSON.stringify(appliedConfig) === JSON.stringify(run.best.config);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <Text style={[type.largeTitle, { color: theme.inkPrimary, marginTop: spacing.s }]}>
        Tune
      </Text>

      <View>
        <SectionHeader theme={theme} title="Model" />
        <Card theme={theme} style={{ paddingVertical: spacing.xs }}>
          {CATALOG.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <Divider theme={theme} inset={34} />}
              <ModelRow theme={theme} id={m.id} />
            </View>
          ))}
        </Card>
        <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 6, marginLeft: 4 }]}>
          Downloads go to this app's files dir — you can also `adb push` a .gguf
          into models/ there.
        </Text>
      </View>

      <View>
        <SectionHeader theme={theme} title="Benchmark sweep" />
        <Card theme={theme} style={{ gap: spacing.l }}>
          {!tune.running && (
            <>
              <Segmented
                theme={theme}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'quick', label: 'Quick · ~2 min' },
                  { value: 'full', label: 'Full · ~6 min' },
                ]}
              />
              <Text style={[type.subhead, { color: theme.inkSecondary }]}>
                {mode === 'quick'
                  ? 'Sweeps thread counts against the llama.cpp default config.'
                  : 'Sweeps threads × flash attention × quantized KV cache. Runs hotter and longer — plug out and let the phone rest first.'}
              </Text>
              {lowBattery && (
                <Text style={[type.subhead, { color: theme.warning }]}>
                  Battery under 20% — numbers may be throttled. Charge first for
                  trustworthy results.
                </Text>
              )}
              <Button
                theme={theme}
                label={modelReady ? 'Run tuning sweep' : 'Download a model first'}
                onPress={() => startTune(mode)}
                disabled={!modelReady}
                icon={<SparkleIcon color={theme.onAccent} size={18} />}
              />
            </>
          )}

          {tune.running && (
            <View style={{ alignItems: 'center', gap: spacing.l }}>
              <RingGauge
                theme={theme}
                fraction={tune.progress}
                label={`${Math.round(tune.progress * 100)}%`}
                sublabel={tune.currentLabel ?? 'preparing'}
              />
              <Text style={[type.subhead, { color: theme.inkSecondary, textAlign: 'center' }]}>
                Benchmarking each configuration with fixed prompt and generation
                lengths — same methodology as the published harness numbers.
              </Text>
            </View>
          )}

          {tune.livePoints.length > 0 && (
            <View>
              <Text style={[type.headline, { color: theme.inkPrimary, marginBottom: spacing.m }]}>
                Decode speed by config
              </Text>
              <HBars
                theme={theme}
                unit="t/s"
                data={tune.livePoints.map(p => ({
                  label: p.label + (p.isBaseline ? '  (llama.cpp default)' : ''),
                  value: p.decodeTps,
                  emphasized: run != null && !tune.running && p.label === run.best.label,
                }))}
              />
            </View>
          )}

          {tune.error ? (
            <Text style={[type.subhead, { color: theme.critical }]}>{tune.error}</Text>
          ) : null}
        </Card>
      </View>

      {run && !tune.running && (
        <View>
          <SectionHeader theme={theme} title="Recommendation" />
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
                  {configLabel(run.best.config)}
                </Text>
                <Text style={[type.footnote, { color: theme.inkMuted }]}>
                  best of {run.points.length} measured configs · {run.modelFile}
                </Text>
              </View>
            </Row>

            <Row style={{ gap: spacing.m }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Decode</Text>
                <Text style={[type.statValue, { color: theme.inkPrimary }]}>
                  {run.best.decodeTps.toFixed(1)}
                  <Text style={[type.subhead, { color: theme.inkMuted }]}> t/s</Text>
                </Text>
                <Text style={[type.footnote, { color: theme.goodText, fontWeight: '600' }]}>
                  {run.decodeGain >= 1.005
                    ? `${((run.decodeGain - 1) * 100).toFixed(0)}% vs default`
                    : 'matches default'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Prefill</Text>
                <Text style={[type.statValue, { color: theme.inkPrimary }]}>
                  {run.best.prefillTps.toFixed(0)}
                  <Text style={[type.subhead, { color: theme.inkMuted }]}> t/s</Text>
                </Text>
                <Text style={[type.footnote, { color: theme.goodText, fontWeight: '600' }]}>
                  {run.prefillGain >= 1.005
                    ? `${((run.prefillGain - 1) * 100).toFixed(0)}% vs default`
                    : 'matches default'}
                </Text>
              </View>
              {run.best.tokensPerJoule != null && (
                <View style={{ flex: 1 }}>
                  <Text style={[type.subhead, { color: theme.inkSecondary }]}>Efficiency</Text>
                  <Text style={[type.statValue, { color: theme.inkPrimary }]}>
                    {run.best.tokensPerJoule.toFixed(1)}
                  </Text>
                  <Text style={[type.footnote, { color: theme.inkMuted }]}>tokens / joule</Text>
                </View>
              )}
            </Row>

            <Button
              theme={theme}
              label={applied ? 'Applied — open Chat' : 'Apply this config'}
              kind={applied ? 'secondary' : 'primary'}
              onPress={applyBest}
              icon={
                applied ? <CheckIcon color={theme.inkPrimary} size={18} /> : undefined
              }
            />
          </Card>
        </View>
      )}
    </ScrollView>
  );
}
