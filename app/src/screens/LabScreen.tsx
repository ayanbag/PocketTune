/**
 * Lab tab — the measured evidence behind PocketTune.
 *
 * Two data sources: (1) the published harness runs bundled at build time
 * (results/*.json in the repo, distilled by tools/make_app_evidence.py), and
 * (2) this phone's own tuning history. Every bundled number is traceable to a
 * raw JSON file in the repo.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { Card, Chip, Divider, Row, SectionHeader } from '../components/ui';
import { HBars, LineChart } from '../components/charts';
import evidence from '../data/evidence.json';

interface EvidenceVariant {
  name: string;
  label: string;
  detail: string;
  summary: Record<string, Record<string, number>>;
}

interface EvidenceRun {
  source: string;
  device: { manufacturer: string; model: string; soc: string; has_i8mm: boolean };
  model_file: string;
  params: { threads_swept: number[] };
  variants: EvidenceVariant[];
}

const runs = (evidence as { runs: EvidenceRun[] }).runs;

function best(v: EvidenceVariant, metric: string): number {
  return Math.max(...Object.values(v.summary[metric] ?? {}), 0);
}

export function LabScreen({ theme }: { theme: Theme }) {
  const history = useStore(s => s.history);
  const profile = useStore(s => s.profile);

  // The attribution-ladder run is the one that includes the generic build.
  const ladderRun = runs.find(r => r.variants.some(v => v.name === 'generic'));
  const ladderOrder = ['generic', 'arch', 'kleidiai'];
  const ladder = ladderRun
    ? ladderOrder
        .map(name => ladderRun.variants.find(v => v.name === name))
        .filter((v): v is EvidenceVariant => v != null)
    : [];
  const genericPp = ladder.length ? best(ladder[0], 'pp128') : 0;
  const bestPp = ladder.length ? Math.max(...ladder.map(v => best(v, 'pp128'))) : 0;
  const speedup = genericPp > 0 ? bestPp / genericPp : 0;

  const threadRun = ladderRun;
  const threadLabels = threadRun
    ? Object.keys(threadRun.variants[0]?.summary.tg64 ?? {}).sort(
        (a, b) => Number(a) - Number(b),
      )
    : [];

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <Text style={[type.largeTitle, { color: theme.inkPrimary, marginTop: spacing.s }]}>
        Lab
      </Text>

      {ladderRun && (
        <View>
          <SectionHeader theme={theme} title="The headline finding" />
          <Card theme={theme}>
            <Text style={[type.hero, { color: theme.inkPrimary }]}>
              {speedup.toFixed(2)}×
            </Text>
            <Text style={[type.body, { color: theme.inkSecondary, marginTop: 2 }]}>
              faster prompt processing from Arm-aware build flags alone — same
              phone, same model, same llama.cpp source.
            </Text>
            <Row style={{ gap: 8, marginTop: spacing.m, flexWrap: 'wrap' }}>
              <Chip
                theme={theme}
                label={`${ladderRun.device.manufacturer} ${ladderRun.device.model}`}
                tone="accent"
              />
              <Chip theme={theme} label={ladderRun.device.soc} />
              <Chip theme={theme} label="Llama 3.2 1B · Q4_0" />
            </Row>
          </Card>
        </View>
      )}

      {ladder.length > 0 && (
        <View>
          <SectionHeader theme={theme} title="Attribution ladder — prefill t/s" />
          <Card theme={theme}>
            <HBars
              theme={theme}
              unit="t/s"
              data={ladder.map((v, i) => ({
                label: v.label,
                value: best(v, 'pp128'),
                note:
                  genericPp > 0 && i > 0
                    ? `${(best(v, 'pp128') / genericPp).toFixed(2)}×`
                    : undefined,
                emphasized: best(v, 'pp128') === bestPp,
              }))}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              Each rung isolates one lever. The jump comes from
              armv8.2+dotprod+i8mm codegen plus llama.cpp's Q4_0 repack into
              i8mm-friendly layouts. KleidiAI microkernels land within noise of
              the arch build here — llama.cpp's own aarch64 repack path already
              exploits the same silicon, an honest and measured result.
            </Text>
            <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.s }]}>
              Source: results/{ladderRun?.source} · median of 5 runs per point
            </Text>
          </Card>
        </View>
      )}

      {threadRun && threadLabels.length > 1 && (
        <View>
          <SectionHeader theme={theme} title="Decode scaling by threads" />
          <Card theme={theme}>
            <LineChart
              theme={theme}
              unit="t/s"
              xLabels={threadLabels.map(t => `${t} thr`)}
              series={ladder.slice(0, 3).map((v, i) => ({
                name: v.label,
                color: theme.series[i],
                values: threadLabels.map(t => v.summary.tg64?.[t] ?? null),
              }))}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              More threads ≠ faster. Decode is memory-latency-bound: on the
              optimized builds two threads on the big cores beat six spread
              across the little ones. This is exactly what the Tune tab sweeps
              for your phone.
            </Text>
          </Card>
        </View>
      )}

      <View>
        <SectionHeader theme={theme} title="This phone's tuning history" />
        {history.length === 0 ? (
          <Card theme={theme}>
            <Text style={[type.body, { color: theme.inkSecondary }]}>
              No sweeps yet. Run one from the Tune tab and its results will
              accumulate here{profile ? ` for the ${profile.marketingName ?? profile.model}` : ''}.
            </Text>
          </Card>
        ) : (
          <Card theme={theme} style={{ gap: spacing.m }}>
            {history.slice(0, 5).map((run, i) => (
              <View key={run.timestamp}>
                {i > 0 && <Divider theme={theme} />}
                <Row style={{ justifyContent: 'space-between', marginTop: i > 0 ? spacing.m : 0 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.headline, { color: theme.inkPrimary }]}>
                      {run.best.decodeTps.toFixed(1)} t/s decode
                    </Text>
                    <Text style={[type.footnote, { color: theme.inkMuted, marginTop: 2 }]}>
                      {run.best.label} · {run.modelFile}
                    </Text>
                    <Text style={[type.footnote, { color: theme.inkMuted }]}>
                      {new Date(run.timestamp).toLocaleString()} · {run.mode} sweep ·{' '}
                      {run.points.length} configs
                    </Text>
                  </View>
                  <Chip
                    theme={theme}
                    label={
                      run.decodeGain >= 1.005
                        ? `+${((run.decodeGain - 1) * 100).toFixed(0)}%`
                        : '±0%'
                    }
                    tone={run.decodeGain >= 1.005 ? 'good' : 'neutral'}
                  />
                </Row>
              </View>
            ))}
          </Card>
        )}
      </View>

      <View>
        <SectionHeader theme={theme} title="Methodology" />
        <Card theme={theme}>
          {[
            'Fixed prompt and generation lengths per point',
            'Repetitions with reported medians, not single shots',
            'Baseline is stock llama.cpp defaults (4 threads, f16 KV)',
            'Power from the battery rail when the kernel exposes it',
            'Raw JSON for every published number lives in the repo',
          ].map((line, i) => (
            <Row key={i} style={{ gap: 8, paddingVertical: 4 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: theme.accent,
                  marginTop: 7,
                  alignSelf: 'flex-start',
                }}
              />
              <Text style={[type.subhead, { color: theme.inkSecondary, flex: 1 }]}>{line}</Text>
            </Row>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}
