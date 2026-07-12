/**
 * Chart primitives (react-native-svg), following the dataviz mark specs:
 * thin marks with 4px rounded data-ends (square at the baseline), 2px lines
 * with ≥8px end markers ringed in surface color, hairline solid gridlines,
 * selective direct labels in ink tokens (text never wears the series color).
 */
import React, { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Theme, type } from '../theme';

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
            const color = d.color ?? theme.series[0];
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

// ------------------------------------------------------------------ RingGauge

export function RingGauge({
  theme,
  fraction,
  size = 120,
  label,
  sublabel,
}: {
  theme: Theme;
  fraction: number;
  size?: number;
  label: string;
  sublabel?: string;
}) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.fill}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <RNText style={[type.title2, { color: theme.inkPrimary }]}>{label}</RNText>
      {sublabel ? (
        <RNText style={[type.footnote, { color: theme.inkMuted }]}>{sublabel}</RNText>
      ) : null}
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
