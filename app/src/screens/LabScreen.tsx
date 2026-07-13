/**
 * Lab tab — the measured evidence, read through *this* phone's silicon.
 *
 * The bundled harness runs (results/*.json, distilled by tools/make_app_evidence.py)
 * cover specific chips. Rather than showing all of them flat, Lab picks the run
 * that describes the CPU in your hand: an exact match when we've published one
 * for this model, otherwise the closest phone in the same ISA feature class,
 * labelled plainly as a reference rather than as your numbers. This phone's own
 * tuning history sits underneath.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { Card, Chip, Divider, Row, SectionHeader } from '../components/ui';
import { HBars, LineChart } from '../components/charts';
import { knownDeviceName } from '../lib/cpu';
import type { DeviceProfile } from '../types';
import evidence from '../data/evidence.json';

interface EvidenceVariant {
  name: string;
  label: string;
  detail: string;
  summary: Record<string, Record<string, number>>;
}

interface EvidenceDevice {
  manufacturer: string;
  model: string;
  soc: string;
  has_i8mm: boolean;
  has_dotprod: boolean;
}

interface EvidenceRun {
  source: string;
  device: EvidenceDevice;
  model_file: string;
  params: { threads_swept: number[] };
  variants: EvidenceVariant[];
}

const runs = (evidence as { runs: EvidenceRun[] }).runs;

/** ISA class — the thing that decides which matmul kernels the chip can run. */
type IsaClass = 'i8mm' | 'dotprod' | 'baseline';

function isaOf(d: { has_i8mm: boolean; has_dotprod: boolean }): IsaClass {
  return d.has_i8mm ? 'i8mm' : d.has_dotprod ? 'dotprod' : 'baseline';
}

function profileIsa(p: DeviceProfile): IsaClass {
  return isaOf({ has_i8mm: p.hasI8mm, has_dotprod: p.hasDotprod });
}

const ISA_LABEL: Record<IsaClass, string> = {
  i8mm: 'dotprod + i8mm',
  dotprod: 'dotprod only',
  baseline: 'no int8 extensions',
};

/** Rung order within an attribution ladder; the dp-* names are the non-i8mm builds. */
const RUNG: Record<string, number> = {
  generic: 0,
  arch: 1,
  'dp-arch': 1,
  kleidiai: 2,
  'dp-kleidiai': 2,
};

function deviceLabel(d: EvidenceDevice): string {
  return knownDeviceName(d.model) ?? `${d.manufacturer} ${d.model}`.trim();
}

/** Best value of a metric across the threads swept for one build variant. */
function peak(v: EvidenceVariant, metric: string): number {
  return Math.max(...Object.values(v.summary[metric] ?? {}), 0);
}

/** A run that carries a full generic → arch → KleidiAI ladder, i.e. one per device. */
const ladderRuns = runs
  .filter(r => r.variants.some(v => v.name === 'generic' && peak(v, 'pp128') > 0))
  .map(r => ({
    ...r,
    ladder: r.variants
      .filter(v => v.name in RUNG)
      .sort((a, b) => RUNG[a.name] - RUNG[b.name]),
  }));

type LadderRun = (typeof ladderRuns)[number];

function genericPeak(r: LadderRun): number {
  return peak(r.ladder[0], 'pp128');
}

function bestPeak(r: LadderRun): number {
  return Math.max(...r.ladder.map(v => peak(v, 'pp128')), 0);
}

function speedupOf(r: LadderRun): number {
  const g = genericPeak(r);
  return g > 0 ? bestPeak(r) / g : 0;
}

export function LabScreen({ theme }: { theme: Theme }) {
  const history = useStore(s => s.history);
  const profile = useStore(s => s.profile);

  const myIsa = profile ? profileIsa(profile) : null;

  // Exact model match first; failing that, the closest phone we've actually run
  // with the same ISA class. Never present another phone's numbers as yours.
  const exact = profile
    ? ladderRuns.find(r => r.device.model === profile.model)
    : undefined;
  const proxy = myIsa
    ? ladderRuns.find(r => isaOf(r.device) === myIsa)
    : undefined;
  const shown = exact ?? proxy ?? ladderRuns[0];
  const isThisPhone = exact != null;

  const threadLabels = shown
    ? Object.keys(shown.ladder[0]?.summary.tg64 ?? {}).sort((a, b) => Number(a) - Number(b))
    : [];

  // Cross-device comparison only says something when the classes differ.
  const classes = new Set(ladderRuns.map(r => isaOf(r.device)));
  const showComparison = ladderRuns.length >= 2 && classes.size >= 2;

  const phoneName = profile
    ? profile.marketingName ?? `${profile.manufacturer} ${profile.model}`.trim()
    : 'this phone';

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <Text style={[type.largeTitle, { color: theme.inkPrimary, marginTop: spacing.s }]}>
        Lab
      </Text>

      {shown && (
        <View>
          <SectionHeader
            theme={theme}
            title={isThisPhone ? 'Measured on this phone' : 'Closest measured chip'}
          />
          <Card theme={theme}>
            {isThisPhone ? (
              <>
                <Text style={[type.hero, { color: theme.inkPrimary }]}>
                  {speedupOf(shown).toFixed(2)}×
                </Text>
                <Text style={[type.body, { color: theme.inkSecondary, marginTop: 2 }]}>
                  faster prompt processing on this exact phone from Arm-aware build
                  flags alone — same model, same llama.cpp source, only the ISA
                  targets changed.
                </Text>
              </>
            ) : (
              <>
                <Text style={[type.title2, { color: theme.inkPrimary }]}>
                  {deviceLabel(shown.device)}
                </Text>
                <Text style={[type.body, { color: theme.inkSecondary, marginTop: 4 }]}>
                  We haven't published a harness run for the {phoneName} yet. The
                  numbers below come from the closest phone we have actually
                  benchmarked — same ISA class ({myIsa ? ISA_LABEL[myIsa] : 'unknown'}),
                  so the same kernels are in play, but a different SoC. Your phone's
                  real numbers come from the Tune tab.
                </Text>
                <Text style={[type.body, { color: theme.inkSecondary, marginTop: spacing.m }]}>
                  On that phone, Arm-aware build flags bought{' '}
                  <Text style={{ color: theme.inkPrimary, fontWeight: '600' }}>
                    {speedupOf(shown).toFixed(2)}× prefill
                  </Text>{' '}
                  over a generic arm64 build.
                </Text>
              </>
            )}
            <Row style={{ gap: 8, marginTop: spacing.m, flexWrap: 'wrap' }}>
              <Chip
                theme={theme}
                label={isThisPhone ? 'This phone' : `Reference · ${deviceLabel(shown.device)}`}
                tone={isThisPhone ? 'accent' : 'off'}
              />
              <Chip theme={theme} label={shown.device.soc} />
              <Chip theme={theme} label={ISA_LABEL[isaOf(shown.device)]} />
            </Row>
          </Card>
        </View>
      )}

      {shown && shown.ladder.length > 1 && (
        <View>
          <SectionHeader theme={theme} title="Attribution ladder — prefill t/s" />
          <Card theme={theme}>
            <HBars
              theme={theme}
              unit="t/s"
              data={shown.ladder.map(v => ({
                label: v.label,
                value: peak(v, 'pp128'),
                note:
                  genericPeak(shown) > 0 && RUNG[v.name] > 0
                    ? `${(peak(v, 'pp128') / genericPeak(shown)).toFixed(2)}×`
                    : undefined,
                emphasized: peak(v, 'pp128') === bestPeak(shown),
              }))}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              Each rung isolates one lever.{' '}
              {isaOf(shown.device) === 'i8mm'
                ? 'The jump comes from armv8.2+dotprod+i8mm codegen plus llama.cpp’s Q4_0 repack into i8mm-friendly layouts.'
                : 'Without i8mm the win comes from armv8.2+dotprod codegen and the Q4_0 repack — the same idea, one instruction short of the fast path.'}{' '}
              KleidiAI microkernels land within noise of the arch build here —
              llama.cpp’s own aarch64 repack path already exploits the same silicon,
              an honest and measured result.
            </Text>
            <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.s }]}>
              Source: results/{shown.source} · median of 5 runs per point
            </Text>
          </Card>
        </View>
      )}

      {showComparison && (
        <View>
          <SectionHeader theme={theme} title="What your ISA class is worth" />
          <Card theme={theme}>
            <HBars
              theme={theme}
              unit="t/s"
              data={[...ladderRuns]
                .sort((a, b) => bestPeak(b) - bestPeak(a))
                .map(r => ({
                  label: `${deviceLabel(r.device)} · ${ISA_LABEL[isaOf(r.device)]}`,
                  value: bestPeak(r),
                  note: `${speedupOf(r).toFixed(2)}× vs generic`,
                  emphasized: myIsa != null && isaOf(r.device) === myIsa,
                }))}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              {myIsa === 'i8mm'
                ? 'Your chip sits in the i8mm row — the widest int8 matmul path llama.cpp can reach on Arm, and the one the biggest prefill numbers live on.'
                : myIsa === 'dotprod'
                  ? 'Your chip sits in the dotprod row. The i8mm ceiling is out of reach on this silicon — that is a hardware limit, not a tuning failure. Everything below it still is yours to win: thread count, core placement, KV quantization.'
                  : 'Best prefill each measured phone reached, after tuning.'}
            </Text>
            <Text style={[type.footnote, { color: theme.inkMuted, marginTop: spacing.s }]}>
              Different SoCs, so this is not a clean i8mm-only isolation — memory
              bandwidth and core mix differ too. It is the gap the feature shows up
              in, not a controlled ablation of it.
            </Text>
          </Card>
        </View>
      )}

      {shown && threadLabels.length > 1 && (
        <View>
          <SectionHeader theme={theme} title="Decode scaling by threads" />
          <Card theme={theme}>
            <LineChart
              theme={theme}
              unit="t/s"
              xLabels={threadLabels.map(t => `${t} thr`)}
              series={shown.ladder.slice(0, 3).map((v, i) => ({
                name: v.label,
                color: theme.series[i],
                values: threadLabels.map(t => v.summary.tg64?.[t] ?? null),
              }))}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              More threads ≠ faster. Decode is memory-latency-bound: on the optimized
              builds two threads on the big cores beat six spread across the little
              ones.{' '}
              {profile?.bigCoreIds.length
                ? `Your big cores are cpu${profile.bigCoreIds.join('–')} — that is where the Tune tab points the work.`
                : 'The Tune tab sweeps this for your phone.'}
            </Text>
          </Card>
        </View>
      )}

      {history.length >= 2 && (
        <View>
          <SectionHeader theme={theme} title="Tuning trend on this phone" />
          <Card theme={theme}>
            <LineChart
              theme={theme}
              unit="t/s"
              xLabels={[...history]
                .reverse()
                .map(r =>
                  new Date(r.timestamp).toLocaleDateString(undefined, {
                    month: 'numeric',
                    day: 'numeric',
                  }),
                )}
              series={[
                {
                  name: 'Tuned best',
                  color: theme.series[0],
                  values: [...history].reverse().map(r => r.best.decodeTps),
                },
                {
                  name: 'llama.cpp default',
                  color: theme.series[1],
                  values: [...history].reverse().map(r => r.baseline.decodeTps),
                },
              ]}
            />
            <Divider theme={theme} />
            <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
              Best decode speed per sweep against the stock default, oldest to newest.
              The gap is what tuning buys on this phone; run-to-run wobble in the
              baseline is thermal, not noise in the method.
            </Text>
          </Card>
        </View>
      )}

      <View>
        <SectionHeader theme={theme} title="This phone's tuning history" />
        {history.length === 0 ? (
          <Card theme={theme}>
            <Text style={[type.body, { color: theme.inkSecondary }]}>
              No sweeps yet. Run one from the Tune tab and this phone's own numbers
              will accumulate here — measured on the {phoneName}, not inherited from
              anyone else's hardware.
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
            'Only phones we have physically run appear here — no estimates',
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
