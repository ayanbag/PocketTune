/**
 * Tune tab — the product's core loop: sweep configs on this phone, see the
 * measured winner, apply it. Model management lives on the Models tab.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { radius, spacing, Theme, type } from '../theme';
import { runForModel, useStore } from '../store';
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
import { CoreMeters, HBars } from '../components/charts';
import { CheckIcon, SparkleIcon } from '../components/icons';
import { configLabel } from '../lib/tuner';
import { BUSY, formatCpuRanges, useCoreLoad } from '../lib/coreload';
import type { DeviceProfile } from '../types';

function bytesGb(n: number): string {
  return `${(n / 1e9).toFixed(2)} GB`;
}

/** A reply length people actually feel — a short paragraph. */
const REPLY_TOKENS = 100;

/** Seconds to decode a REPLY_TOKENS reply, rounded so the bar reads cleanly. */
function replySeconds(decodeTps: number): number {
  return decodeTps > 0 ? Math.round((REPLY_TOKENS / decodeTps) * 10) / 10 : 0;
}

function LiveDot({ theme }: { theme: Theme }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Row style={{ gap: 5 }}>
      <Animated.View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.accent,
          opacity,
        }}
      />
      <Text style={[type.caption, { color: theme.inkMuted }]}>LIVE</Text>
    </Row>
  );
}

/**
 * Owns the 2.5 Hz sampler so only the meters repaint at that rate, not the
 * whole screen. Rendered only while a sweep runs — the cores are the subject
 * of the Tune tab, and nowhere else.
 */
function CoreLoadPanel({ theme, profile }: { theme: Theme; profile: DeviceProfile }) {
  const { load, supported } = useCoreLoad(profile.totalCores);
  const busyCpus = load
    .map((l, cpu) => ({ l, cpu }))
    .filter(x => x.l >= BUSY)
    .map(x => x.cpu);
  const busyClusters = [
    ...new Set(
      busyCpus
        .map(cpu => profile.clusters.find(c => c.cpuIds.includes(cpu))?.name)
        .filter((n): n is string => n != null),
    ),
  ];

  if (!supported) {
    return (
      <View>
        <Text style={[type.caption, { color: theme.inkMuted, textTransform: 'uppercase' }]}>
          Inference load · per core
        </Text>
        <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.s }]}>
          This phone doesn't expose per-thread CPU stats to apps, so live core
          load can't be shown here. Speed results are unaffected.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.m }}>
        <Text style={[type.caption, { color: theme.inkMuted, textTransform: 'uppercase' }]}>
          Inference load · per core
        </Text>
        <LiveDot theme={theme} />
      </Row>
      <CoreMeters
        theme={theme}
        clusters={profile.clusters}
        bigCoreIds={profile.bigCoreIds}
        load={load}
      />
      <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.m }]}>
        Load from PocketTune's own inference threads, not system-wide CPU use.
        {busyCpus.length > 0
          ? ` Running on ${formatCpuRanges(busyCpus)} · ${busyClusters.join(' + ')}.`
          : ''}
      </Text>
    </View>
  );
}

export function TuneScreen({ theme }: { theme: Theme }) {
  const tune = useStore(s => s.tune);
  const selectedModelId = useStore(s => s.selectedModelId);
  const models = useStore(s => s.models);
  const modelList = useStore(s => s.modelList);
  const applied = useStore(s => s.applied);
  const history = useStore(s => s.history);
  const battery = useStore(s => s.battery);
  const profile = useStore(s => s.profile);
  const { startTune, applyBest, setTab } = useStore();
  const [mode, setMode] = useState<'quick' | 'full'>('quick');

  const model = modelList.find(m => m.id === selectedModelId);
  const modelReady = models[selectedModelId]?.status === 'ready';
  // A sweep describes exactly one model. Show the selected model's own newest
  // run — never another model's, and never one whose file is gone.
  const run = modelReady ? runForModel(history, selectedModelId) : null;
  const lowBattery = battery?.levelPct != null && battery.levelPct < 20;

  // "Applied" is about *this* run, not a config that happens to match one
  // applied earlier — a fresh sweep always has to be applied deliberately.
  const isApplied = run != null && applied[selectedModelId]?.runId === run.id;

  // Live points belong to the model that was swept; don't show them under another.
  const livePoints = tune.liveModelId === selectedModelId ? tune.livePoints : [];

  // Throughput restated as the wait a user actually feels.
  const baselineSecs = run ? replySeconds(run.baseline.decodeTps) : 0;
  const tunedSecs = run ? replySeconds(run.best.decodeTps) : 0;
  const secsSaved = baselineSecs - tunedSecs;

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <Text style={[type.largeTitle, { color: theme.inkPrimary, marginTop: spacing.s }]}>
        Tune
      </Text>

      <View>
        <SectionHeader theme={theme} title="Model" />
        <Card theme={theme}>
          <Row style={{ gap: 12 }}>
            <View style={{ flex: 1 }}>
              {model && modelReady ? (
                <>
                  <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Text style={[type.headline, { color: theme.inkPrimary }]}>
                      {model.name}
                    </Text>
                    <Chip theme={theme} label={model.quant} tone="accent" />
                  </Row>
                  <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
                    {model.params} · {bytesGb(model.sizeBytes)}
                  </Text>
                </>
              ) : (
                <Text style={[type.body, { color: theme.inkSecondary }]}>
                  No model on this device yet — grab one from the Models tab.
                </Text>
              )}
            </View>
            <Pressable onPress={() => setTab('models')} hitSlop={8}>
              <Text style={[type.subhead, { color: theme.accent, fontWeight: '600' }]}>
                {modelReady ? 'Change' : 'Get one'}
              </Text>
            </Pressable>
          </Row>
        </Card>
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
            <View style={{ gap: spacing.l }}>
              <View>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={[type.headline, { color: theme.inkPrimary }]}>
                    {tune.currentLabel ?? 'Preparing'}
                  </Text>
                  {tune.totalConfigs > 0 && tune.currentIndex > 0 && (
                    <Text style={[type.footnote, { color: theme.inkMuted }]}>
                      config {tune.currentIndex} of {tune.totalConfigs}
                    </Text>
                  )}
                </Row>
                <View style={{ marginTop: 10 }}>
                  <ProgressBar theme={theme} fraction={tune.progress} />
                </View>
              </View>

              {profile && <CoreLoadPanel theme={theme} profile={profile} />}

              <Text style={[type.footnote, { color: theme.inkMuted }]}>
                Benchmarking each configuration with fixed prompt and generation
                lengths — same methodology as the published harness numbers.
              </Text>
            </View>
          )}

          {livePoints.length > 0 && (
            <View>
              <Text style={[type.headline, { color: theme.inkPrimary, marginBottom: spacing.m }]}>
                Decode speed by config
              </Text>
              <HBars
                theme={theme}
                unit="t/s"
                data={livePoints.map(p => ({
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

            {run.decodeGain >= 1.05 ? (
              <Row style={{ alignItems: 'center', gap: 12 }}>
                <Text style={[type.largeTitle, { color: theme.inkPrimary }]}>
                  {run.decodeGain.toFixed(2)}×
                </Text>
                <Text style={[type.subhead, { color: theme.inkSecondary, flex: 1 }]}>
                  faster replies than the llama.cpp default
                </Text>
              </Row>
            ) : (
              <Text style={[type.subhead, { color: theme.inkSecondary }]}>
                Default config already near-optimal on this phone
              </Text>
            )}

            <Divider theme={theme} />

            <Row style={{ gap: spacing.xl }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Decode</Text>
                <Text style={[type.statValue, { color: theme.inkPrimary, marginTop: 2 }]}>
                  {run.best.decodeTps.toFixed(1)}
                  <Text style={[type.subhead, { color: theme.inkMuted }]}> t/s</Text>
                </Text>
                <Text
                  style={[
                    type.footnote,
                    { color: theme.goodText, fontWeight: '600', marginTop: 2 },
                  ]}>
                  {run.decodeGain >= 1.005
                    ? `+${((run.decodeGain - 1) * 100).toFixed(0)}% vs default`
                    : 'matches default'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Prefill</Text>
                <Text style={[type.statValue, { color: theme.inkPrimary, marginTop: 2 }]}>
                  {run.best.prefillTps.toFixed(0)}
                  <Text style={[type.subhead, { color: theme.inkMuted }]}> t/s</Text>
                </Text>
                <Text
                  style={[
                    type.footnote,
                    { color: theme.goodText, fontWeight: '600', marginTop: 2 },
                  ]}>
                  {run.prefillGain >= 1.005
                    ? `+${((run.prefillGain - 1) * 100).toFixed(0)}% vs default`
                    : 'matches default'}
                </Text>
              </View>
            </Row>

            <Row style={{ gap: spacing.xl }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Efficiency</Text>
                <Text
                  style={[
                    type.statValue,
                    {
                      color:
                        run.best.tokensPerJoule != null ? theme.inkPrimary : theme.inkMuted,
                      marginTop: 2,
                    },
                  ]}>
                  {run.best.tokensPerJoule != null ? (
                    <>
                      {run.best.tokensPerJoule.toFixed(1)}
                      <Text style={[type.subhead, { color: theme.inkMuted }]}> tok/J</Text>
                    </>
                  ) : (
                    '—'
                  )}
                </Text>
                <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
                  {run.best.tokensPerJoule != null ? 'tokens per joule' : 'not measurable'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>Power</Text>
                <Text
                  style={[
                    type.statValue,
                    {
                      color: run.best.watts != null ? theme.inkPrimary : theme.inkMuted,
                      marginTop: 2,
                    },
                  ]}>
                  {run.best.watts != null ? (
                    <>
                      {run.best.watts.toFixed(1)}
                      <Text style={[type.subhead, { color: theme.inkMuted }]}> W</Text>
                    </>
                  ) : (
                    '—'
                  )}
                </Text>
                <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
                  {run.best.watts != null ? 'draw during decode' : 'not measurable'}
                </Text>
              </View>
            </Row>

            {run.best.tokensPerJoule == null && (
              <Text style={[type.footnote, { color: theme.inkMuted }]}>
                Android hides this phone's battery current sensor from apps, so
                tokens per joule can't be measured here. Speed results are
                unaffected — the Device tab shows what this phone exposes.
              </Text>
            )}

            <Button
              theme={theme}
              label={isApplied ? 'Applied — open Chat' : 'Apply this config'}
              kind={isApplied ? 'secondary' : 'primary'}
              onPress={isApplied ? () => setTab('chat') : applyBest}
              icon={
                isApplied ? <CheckIcon color={theme.inkPrimary} size={18} /> : undefined
              }
            />
          </Card>
        </View>
      )}

      {run && !tune.running && (
        <View>
          <SectionHeader theme={theme} title="Baseline vs tuned" />
          <Card theme={theme} style={{ gap: spacing.m }}>
            <Text style={[type.subhead, { color: theme.inkSecondary }]}>Decode — what chat feels like</Text>
            <HBars
              theme={theme}
              unit="t/s"
              data={[
                { label: 'llama.cpp default', value: run.baseline.decodeTps },
                { label: `Tuned · ${run.best.label}`, value: run.best.decodeTps, emphasized: true,
                  note: run.decodeGain >= 1.005 ? `${run.decodeGain.toFixed(2)}×` : undefined },
              ]}
            />
            <Text style={[type.subhead, { color: theme.inkSecondary }]}>Prefill — time to first token</Text>
            <HBars
              theme={theme}
              unit="t/s"
              data={[
                { label: 'llama.cpp default', value: run.baseline.prefillTps },
                { label: `Tuned · ${run.best.label}`, value: run.best.prefillTps, emphasized: true,
                  note: run.prefillGain >= 1.005 ? `${run.prefillGain.toFixed(2)}×` : undefined },
              ]}
            />
            {baselineSecs > 0 && tunedSecs > 0 && (
              <>
                <Text style={[type.subhead, { color: theme.inkSecondary }]}>
                  Waiting on a {REPLY_TOKENS}-token reply — shorter is better
                </Text>
                <HBars
                  theme={theme}
                  unit="s"
                  data={[
                    { label: 'llama.cpp default', value: baselineSecs },
                    { label: `Tuned · ${run.best.label}`, value: tunedSecs, emphasized: true,
                      note: secsSaved >= 0.1 ? `${secsSaved.toFixed(1)}s sooner` : undefined },
                  ]}
                />
              </>
            )}
          </Card>
        </View>
      )}

      {run && !tune.running && run.points.filter(p => p.tokensPerJoule != null).length >= 2 && (
        <View>
          <SectionHeader theme={theme} title="Energy efficiency" />
          <Card theme={theme}>
            <HBars
              theme={theme}
              unit="tok/J"
              data={run.points
                .filter(p => p.tokensPerJoule != null)
                .map(p => ({
                  label: p.label + (p.isBaseline ? '  (llama.cpp default)' : ''),
                  value: p.tokensPerJoule as number,
                  color: theme.series[1],
                  emphasized: p.label === run.best.label,
                }))}
            />
            <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.s }]}>
              Tokens generated per joule from the battery rail during decode —
              the config that wins on speed doesn't always win on battery.
            </Text>
          </Card>
        </View>
      )}

      {history.length > 0 && (
        <View>
          <SectionHeader theme={theme} title="Previous sweeps" />
          <Card theme={theme} style={{ gap: spacing.m }}>
            {history.slice(0, 5).map((h, i) => (
              <View key={h.id}>
                {i > 0 && <Divider theme={theme} />}
                <Row
                  style={{ justifyContent: 'space-between', marginTop: i > 0 ? spacing.m : 0 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: theme.inkPrimary }]}>
                      {h.best.decodeTps.toFixed(1)} t/s decode
                    </Text>
                    <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
                      {h.best.label} · {h.modelFile}
                    </Text>
                    <Text style={[type.footnote, { color: theme.inkMuted }]}>
                      {new Date(h.timestamp).toLocaleString()} · {h.mode} sweep ·{' '}
                      {h.points.length} configs
                    </Text>
                  </View>
                  <Chip
                    theme={theme}
                    label={
                      h.decodeGain >= 1.005
                        ? `+${((h.decodeGain - 1) * 100).toFixed(0)}%`
                        : '±0%'
                    }
                    tone={h.decodeGain >= 1.005 ? 'good' : 'neutral'}
                  />
                </Row>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}
