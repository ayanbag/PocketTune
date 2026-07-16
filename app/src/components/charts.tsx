/**
 * Chart primitives (react-native-svg), following the dataviz mark specs:
 * thin marks with 4px rounded data-ends (square at the baseline), 2px lines
 * with ≥8px end markers ringed in surface color, hairline solid gridlines,
 * selective direct labels in ink tokens (text never wears the series color).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text as RNText, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Theme, type } from '../theme';
import { BUSY, SAMPLE_MS } from '../lib/coreload';
import type { CoreCluster } from '../types';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// -------------------------------------------------------------------- helpers

/** Rectangle rounded only on its data end (right side). */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w, h / 2);
  return [
    `M${x} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x}`,
    'Z',
  ].join(' ');
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 4, 5, 8, 10]) {
    if (v <= m * mag) return m * mag;
  }
  return 10 * mag;
}

function fmt(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2).replace(/\.?0+$/, '');
}

export function Legend({
  theme,
  items,
}: {
  theme: Theme;
  items: { label: string; color: string }[];
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
      {items.map(it => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: it.color }} />
          <RNText style={[type.footnote, { color: theme.inkSecondary }]}>{it.label}</RNText>
        </View>
      ))}
    </View>
  );
}

// --------------------------------------------------------------------- HBars

export interface HBarDatum {
  label: string;
  value: number;
  color?: string;
  /** annotation at the tip after the value, e.g. "1.34×" */
  note?: string;
  emphasized?: boolean;
}

/**
 * Horizontal bar chart: category label above each bar, value at the tip.
 * One series → single hue with emphasis; multi-hue only when rows are
 * different entities (caller passes colors).
 */
export function HBars({
  theme,
  data,
  unit,
}: {
  theme: Theme;
  data: HBarDatum[];
  unit?: string;
}) {
  const [width, setWidth] = useState(0);
  const barH = 16;
  const labelH = 18;
  const gap = 12;
  const rowH = barH + labelH + gap;
  const max = niceMax(Math.max(...data.map(d => d.value), 0.001));
  // room for the value + note at the tip of a full-width bar
  const valueSpace = 104;
  const height = data.length * rowH;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {data.map((d, i) => {
            const y = i * rowH;
            const w = Math.max((d.value / max) * (width - valueSpace), 2);
            // Single-series magnitude default: the (validated) copper accent.
            const color = d.color ?? theme.accent;
            const faded = data.some(x => x.emphasized) && !d.emphasized;
            return (
              <React.Fragment key={d.label + i}>
                <SvgText
                  x={0}
                  y={y + 12}
                  fill={theme.inkSecondary}
                  fontSize={12}
                  fontWeight={d.emphasized ? '600' : '400'}>
                  {d.label}
                </SvgText>
                <Path
                  d={barPath(0, y + labelH, w, barH, 4)}
                  fill={color}
                  opacity={faded ? 0.38 : 1}
                />
                <SvgText
                  x={w + 8}
                  y={y + labelH + barH / 2 + 4}
                  fill={theme.inkPrimary}
                  fontSize={12}
                  fontWeight="600">
                  {`${fmt(d.value)}${unit ? ` ${unit}` : ''}${d.note ? `  ${d.note}` : ''}`}
                </SvgText>
              </React.Fragment>
            );
          })}
          <Line
            x1={0.5}
            y1={labelH - 4}
            x2={0.5}
            y2={height - gap + 4}
            stroke={theme.baseline}
            strokeWidth={1}
          />
        </Svg>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ LineChart

export interface LineSeries {
  name: string;
  color: string;
  /** y values aligned with xLabels */
  values: (number | null)[];
}

export function LineChart({
  theme,
  series,
  xLabels,
  height = 170,
  unit,
}: {
  theme: Theme;
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  unit?: string;
}) {
  const [width, setWidth] = useState(0);
  const padL = 34;
  const padR = 18;
  const padT = 12;
  const padB = 22;
  const all = series.flatMap(s => s.values).filter((v): v is number => v != null);
  const max = niceMax(Math.max(...all, 0.001));
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (i: number) =>
    padL + (xLabels.length > 1 ? (i / (xLabels.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  // Direct-label endpoints only where they don't collide (per the mark spec:
  // when end labels converge, the legend + axis carry the rest).
  const endLabelYs: number[] = [];
  const labelable = new Set<string>();
  [...series]
    .map(sr => {
      let last: number | null = null;
      for (const v of sr.values) if (v != null) last = v;
      return { name: sr.name, last };
    })
    .filter((e): e is { name: string; last: number } => e.last != null)
    .sort((a, b) => b.last - a.last)
    .forEach(e => {
      const y = yAt(e.last);
      if (endLabelYs.every(other => Math.abs(other - y) >= 16)) {
        endLabelYs.push(y);
        labelable.add(e.name);
      }
    });

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map(t => (
            <React.Fragment key={t}>
              <Line
                x1={padL}
                y1={yAt(t)}
                x2={width - padR}
                y2={yAt(t)}
                stroke={t === 0 ? theme.baseline : theme.gridline}
                strokeWidth={1}
              />
              <SvgText
                x={padL - 6}
                y={yAt(t) + 4}
                fill={theme.inkMuted}
                fontSize={10}
                textAnchor="end">
                {fmt(t)}
              </SvgText>
            </React.Fragment>
          ))}
          {xLabels.map((l, i) => (
            <SvgText
              key={l + i}
              x={xAt(i)}
              y={height - 6}
              fill={theme.inkMuted}
              fontSize={10}
              textAnchor="middle">
              {l}
            </SvgText>
          ))}
          {series.map(sr => {
            const pts = sr.values
              .map((v, i) => (v != null ? `${xAt(i)},${yAt(v)}` : null))
              .filter(Boolean)
              .join(' ');
            let lastIdx = -1;
            sr.values.forEach((v, i) => {
              if (v != null) lastIdx = i;
            });
            const lastVal = lastIdx >= 0 ? sr.values[lastIdx] : null;
            return (
              <React.Fragment key={sr.name}>
                <Polyline
                  points={pts}
                  fill="none"
                  stroke={sr.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {sr.values.map((v, i) =>
                  v != null ? (
                    <Circle
                      key={i}
                      cx={xAt(i)}
                      cy={yAt(v)}
                      r={4}
                      fill={sr.color}
                      stroke={theme.surface}
                      strokeWidth={2}
                    />
                  ) : null,
                )}
                {lastVal != null && labelable.has(sr.name) && (
                  <SvgText
                    x={xAt(lastIdx) - 8}
                    y={yAt(lastVal) - 9}
                    fill={theme.inkPrimary}
                    fontSize={11}
                    fontWeight="600"
                    textAnchor="end">
                    {fmt(lastVal)}
                    {unit ? ` ${unit}` : ''}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      {series.length > 1 && (
        <Legend theme={theme} items={series.map(s => ({ label: s.name, color: s.color }))} />
      )}
    </View>
  );
}

// ------------------------------------------------------------------ Sparkline

/**
 * Compact single-series trend: 2px line, endpoint marker ringed in surface,
 * end value in ink (never the series color). No axes — the surrounding text
 * names the metric; a lone baseline grounds the shape.
 */
export function Sparkline({
  theme,
  values,
  height = 36,
  color,
  unit,
  /** false when the caller already prints the latest value next to the chart */
  showValue = true,
}: {
  theme: Theme;
  values: number[];
  height?: number;
  color?: string;
  unit?: string;
  showValue?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const stroke = color ?? theme.accent;
  const padR = !showValue ? 8 : unit ? 58 : 40;
  const padY = 6;
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const plotW = width - padR - 4;
  const xAt = (i: number) =>
    4 + (values.length > 1 ? (i / (values.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => padY + (1 - (v - min) / span) * (height - padY * 2);
  const last = values[values.length - 1];

  if (!values.length) return null;
  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line
            x1={4}
            y1={height - padY + 3}
            x2={showValue ? width - padR + 24 : width - 4}
            y2={height - padY + 3}
            stroke={theme.baseline}
            strokeWidth={1}
          />
          <Polyline
            points={values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle
            cx={xAt(values.length - 1)}
            cy={yAt(last)}
            r={4}
            fill={stroke}
            stroke={theme.surface}
            strokeWidth={2}
          />
          {showValue && (
            <SvgText
              x={xAt(values.length - 1) + 10}
              y={yAt(last) + 4}
              fill={theme.inkPrimary}
              fontSize={12}
              fontWeight="600">
              {fmt(last)}
              {unit ? ` ${unit}` : ''}
            </SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}

// --------------------------------------------------------------- CoreTopology

export interface TopologyCluster {
  name: string;
  count: number;
  maxMhz: number;
  big: boolean;
}

/** Cores as rounded tiles, height scaled by clock, big cluster in accent. */
export function CoreTopology({
  theme,
  clusters,
}: {
  theme: Theme;
  clusters: TopologyCluster[];
}) {
  const [width, setWidth] = useState(0);
  const totalCores = clusters.reduce((a, c) => a + c.count, 0);
  const gap = 6;
  const maxMhz = Math.max(...clusters.map(c => c.maxMhz), 1);
  const maxTileH = 64;
  const labelBlock = 34;
  const height = maxTileH + 8 + labelBlock;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && totalCores > 0 && (
        <Svg width={width} height={height}>
          {(() => {
            const tileW = (width - gap * (totalCores - 1)) / totalCores;
            let x = 0;
            const nodes: React.ReactNode[] = [];
            clusters.forEach((cl, ci) => {
              const tileH = Math.max((cl.maxMhz / maxMhz) * maxTileH, 24);
              const clusterX = x;
              for (let i = 0; i < cl.count; i++) {
                nodes.push(
                  <Rect
                    key={`${ci}-${i}`}
                    x={x}
                    y={maxTileH - tileH}
                    width={tileW}
                    height={tileH}
                    rx={5}
                    fill={cl.big ? theme.accent : theme.fillStrong}
                  />,
                );
                x += tileW + gap;
              }
              const clusterW = x - gap - clusterX;
              nodes.push(
                <SvgText
                  key={`label-${ci}`}
                  x={clusterX + clusterW / 2}
                  y={maxTileH + 24}
                  fill={theme.inkSecondary}
                  fontSize={11}
                  fontWeight={cl.big ? '600' : '400'}
                  textAnchor="middle">
                  {`${cl.count}× ${cl.name.replace('Cortex-', '')}`}
                </SvgText>,
              );
              nodes.push(
                <SvgText
                  key={`freq-${ci}`}
                  x={clusterX + clusterW / 2}
                  y={maxTileH + 38}
                  fill={theme.inkMuted}
                  fontSize={10}
                  textAnchor="middle">
                  {`${(cl.maxMhz / 1000).toFixed(1)} GHz`}
                </SvgText>,
              );
            });
            return nodes;
          })()}
        </Svg>
      )}
    </View>
  );
}

// ----------------------------------------------------------------- CoreMeters

/**
 * Live per-core load. Tile height is the core's max clock — the same encoding
 * CoreTopology uses on the Device tab, so the silicon reads as the same
 * silicon on both screens and no legend is needed: two tall tiles filling
 * while the little ones stay dark *is* the big.LITTLE story. That frees the
 * accent to mean one thing here, activity, rather than doubling as the
 * big-cluster marker it is on Device.
 *
 * Hue is a load ramp — green idling, orange working, red saturated — so a
 * core's colour and its bar height say the same thing twice. Note the ramp's
 * bands (0.25/0.85) straddle BUSY, the threshold the panel's "Running on cpu…"
 * prose uses, so the two can disagree: a core at 0.3 carrying incidental load
 * and a core at 0.6 running inference are both orange, and neither hue edge
 * marks the in-use line. In-use is carried instead by the label ink and weight
 * above and below each tile, which do read BUSY.
 *
 * Worth knowing before trusting either: the load is not bimodal. A migrating
 * thread's whole delta is charged to wherever it landed (see coreload.ts), so
 * a 4-thread config smears across all eight cores rather than pinning four —
 * 46/47/45/91/67/9/45/34 (sum 384% ≈ 3.8 cores) was a real sample. Cores doing
 * real work routinely sit mid-ramp, and the honest answer to "which cores is
 * this config on" is usually "all of them, partially".
 */
export function CoreMeters({
  theme,
  clusters,
  bigCoreIds,
  load,
}: {
  theme: Theme;
  clusters: CoreCluster[];
  bigCoreIds: number[];
  load: number[];
}) {
  const [width, setWidth] = useState(0);
  const cores = clusters
    .flatMap(c => c.cpuIds.map(cpu => ({ cpu, maxMhz: c.maxMhz })))
    .sort((a, b) => a.cpu - b.cpu);

  // The sampler delivers a value per core every SAMPLE_MS; rendered raw, the
  // bars snap 2.5×/s and read as broken. Tween each bar to its new value over
  // exactly one sample interval so it glides into place as the next one lands.
  // JS driver: SVG rect geometry isn't native-driver animatable.
  const anims = useRef(new Map<number, Animated.Value>()).current;
  const animFor = (cpu: number) => {
    let v = anims.get(cpu);
    if (!v) {
      v = new Animated.Value(0);
      anims.set(cpu, v);
    }
    return v;
  };
  useEffect(() => {
    const timings = cores.map(c =>
      Animated.timing(animFor(c.cpu), {
        toValue: Math.max(0, Math.min(1, load[c.cpu] ?? 0)),
        duration: SAMPLE_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    Animated.parallel(timings).start();
    // cores derives from clusters; anims/animFor are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, clusters]);

  // Threshold coloring, same in live and recorded views: idling green,
  // working orange, saturated red.
  const loadColor = (l: number) =>
    l > 0.85 ? theme.critical : l >= 0.25 ? theme.warning : theme.good;

  const gap = 6;
  const maxTileH = 64;
  const topPad = 12; // headroom for the % above the tallest tile
  const baseY = topPad + maxTileH;
  const clusterY = baseY + 20;
  const height = clusterY + 30;
  const maxMhz = Math.max(...cores.map(c => c.maxMhz), 1);

  if (!cores.length) return null;
  const tileW = (width - gap * (cores.length - 1)) / cores.length;
  const xAt = (i: number) => i * (tileW + gap);

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {cores.map((c, i) => {
            const x = xAt(i);
            const tileH = Math.max((c.maxMhz / maxMhz) * maxTileH, 24);
            const top = baseY - tileH;
            const l = Math.max(0, Math.min(1, load[c.cpu] ?? 0));
            const busy = l >= BUSY;
            const anim = animFor(c.cpu);
            return (
              <React.Fragment key={c.cpu}>
                <SvgText
                  x={x + tileW / 2}
                  y={top - 5}
                  fill={busy ? theme.inkPrimary : theme.inkMuted}
                  fontSize={9}
                  fontWeight={busy ? '700' : '500'}
                  textAnchor="middle">
                  {`${Math.round(l * 100)}%`}
                </SvgText>
                <Rect
                  x={x}
                  y={top}
                  width={tileW}
                  height={tileH}
                  rx={5}
                  fill={theme.fillStrong}
                />
                <AnimatedRect
                  x={x}
                  y={anim.interpolate({ inputRange: [0, 1], outputRange: [baseY, top] })}
                  width={tileW}
                  height={anim.interpolate({ inputRange: [0, 1], outputRange: [0, tileH] })}
                  rx={4}
                  fill={loadColor(l)}
                />
                <SvgText
                  x={x + tileW / 2}
                  y={baseY + 12}
                  fill={busy ? theme.inkPrimary : theme.inkMuted}
                  fontSize={9}
                  fontWeight={busy ? '700' : '400'}
                  textAnchor="middle">
                  {c.cpu}
                </SvgText>
              </React.Fragment>
            );
          })}

          {[...clusters]
            .sort((a, b) => Math.min(...a.cpuIds) - Math.min(...b.cpuIds))
            .map(cl => {
              const idxs = cl.cpuIds
                .map(cpu => cores.findIndex(c => c.cpu === cpu))
                .filter(i => i >= 0);
              if (!idxs.length) return null;
              const x0 = xAt(Math.min(...idxs));
              const x1 = xAt(Math.max(...idxs)) + tileW;
              const mid = (x0 + x1) / 2;
              const big = cl.cpuIds.some(id => bigCoreIds.includes(id));
              return (
                <React.Fragment key={`cl-${cl.cpuIds[0]}`}>
                  <Line
                    x1={x0}
                    y1={clusterY}
                    x2={x1}
                    y2={clusterY}
                    stroke={theme.baseline}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={mid}
                    y={clusterY + 14}
                    fill={theme.inkSecondary}
                    fontSize={11}
                    fontWeight={big ? '600' : '400'}
                    textAnchor="middle">
                    {`${cl.cpuIds.length}× ${cl.name.replace('Cortex-', '')}`}
                  </SvgText>
                  <SvgText
                    x={mid}
                    y={clusterY + 26}
                    fill={theme.inkMuted}
                    fontSize={10}
                    textAnchor="middle">
                    {`${(cl.maxMhz / 1000).toFixed(1)} GHz`}
                  </SvgText>
                </React.Fragment>
              );
            })}
        </Svg>
      )}
    </View>
  );
}
