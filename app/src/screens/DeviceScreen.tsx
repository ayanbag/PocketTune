/**
 * Device tab — what silicon is in this phone and what it means for local AI.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { spacing, Theme, type } from '../theme';
import { useStore } from '../store';
import { Card, Chip, Divider, Row, SectionHeader, StatTile } from '../components/ui';
import { CoreTopology } from '../components/charts';
import { BoltIcon, ChipIcon } from '../components/icons';

function FeatureRow({
  theme,
  name,
  detail,
  present,
}: {
  theme: Theme;
  name: string;
  detail: string;
  present: boolean;
}) {
  return (
    <Row style={{ paddingVertical: 10, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.headline, { color: theme.inkPrimary }]}>{name}</Text>
        <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: 1 }]}>{detail}</Text>
      </View>
      <Chip theme={theme} label={present ? 'Present' : 'Absent'} tone={present ? 'good' : 'off'} />
    </Row>
  );
}

export function DeviceScreen({ theme }: { theme: Theme }) {
  const profile = useStore(s => s.profile);
  const battery = useStore(s => s.battery);

  if (!profile) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
        <Card theme={theme}>
          <Text style={[type.body, { color: theme.inkSecondary }]}>
            Reading CPU information… If this persists, this device may restrict
            /proc/cpuinfo access.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  const deviceName =
    profile.marketingName ?? `${profile.manufacturer} ${profile.model}`.trim();

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.xl, paddingBottom: 110, gap: spacing.l }}
      showsVerticalScrollIndicator={false}>
      <View style={{ marginTop: spacing.s, marginBottom: spacing.s }}>
        <Text style={[type.largeTitle, { color: theme.inkPrimary }]}>{deviceName}</Text>
        <Row style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Chip theme={theme} label={profile.soc} tone="accent" />
          <Chip theme={theme} label={`Android ${profile.androidVersion}`} />
          <Chip theme={theme} label={profile.abi} />
        </Row>
      </View>

      <View>
        <SectionHeader theme={theme} title="CPU topology" />
        <Card theme={theme}>
          <CoreTopology
            theme={theme}
            clusters={profile.clusters.map(c => ({
              name: c.name,
              count: c.count,
              maxMhz: c.maxMhz,
              big: c.cpuIds.some(id => profile.bigCoreIds.includes(id)),
            }))}
          />
          <Divider theme={theme} />
          <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
            Big cores sit at cpu{profile.bigCoreIds.join('–')}. Decode speed is
            latency-bound, so the tuner tests whether fewer, bigger cores beat
            spreading work across the little ones.
          </Text>
        </Card>
      </View>

      <View>
        <SectionHeader theme={theme} title="Arm ISA features" />
        <Card theme={theme} style={{ paddingVertical: spacing.s }}>
          <FeatureRow
            theme={theme}
            name="dotprod"
            detail="SDOT/UDOT int8 dot product — 4× int8 MACs per cycle"
            present={profile.hasDotprod}
          />
          <Divider theme={theme} />
          <FeatureRow
            theme={theme}
            name="i8mm"
            detail="SMMLA int8 matrix multiply — the fast path for 4-bit LLMs"
            present={profile.hasI8mm}
          />
          <Divider theme={theme} />
          <FeatureRow
            theme={theme}
            name="SVE2"
            detail="Scalable vectors — future kernels, not yet used by llama.cpp on phones"
            present={profile.hasSve2}
          />
          <Divider theme={theme} />
          <FeatureRow
            theme={theme}
            name="SME2"
            detail="Scalable matrix extension — arriving in 2025+ flagships"
            present={profile.hasSme}
          />
        </Card>
      </View>

      <View>
        <SectionHeader theme={theme} title="Kernel dispatch" />
        <Card theme={theme}>
          <Row style={{ gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ChipIcon color={theme.accent} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.headline, { color: theme.inkPrimary }]}>
                {profile.kernelPath}
              </Text>
              <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: 2 }]}>
                Inference binary selected at runtime for this CPU
              </Text>
            </View>
          </Row>
          <Divider theme={theme} inset={0} />
          <Text style={[type.subhead, { color: theme.inkSecondary, marginTop: spacing.m }]}>
            {profile.hasI8mm
              ? 'This phone has int8 matrix-multiply hardware. Q4_0 weights are repacked at load time into an i8mm-friendly layout — the sweep on the Lab tab shows what that is worth.'
              : 'Without i8mm, inference uses the dotprod path. Quantization choice and thread placement matter even more here — run the tuner to find the best setup.'}
          </Text>
        </Card>
      </View>

      <View>
        <SectionHeader theme={theme} title="Resources" />
        <Row style={{ gap: spacing.m }}>
          <StatTile
            theme={theme}
            label="Memory"
            value={(profile.memTotalMb / 1024).toFixed(1)}
            unit="GB"
          />
          <StatTile
            theme={theme}
            label="Battery"
            value={battery?.levelPct != null ? String(battery.levelPct) : '—'}
            unit="%"
          />
          <StatTile
            theme={theme}
            label="Temp"
            value={battery?.temperatureC != null ? battery.temperatureC.toFixed(0) : '—'}
            unit="°C"
          />
        </Row>
        {battery?.watts != null && (
          <Card theme={theme} style={{ marginTop: spacing.m }}>
            <Row style={{ gap: 10 }}>
              <BoltIcon color={theme.series[2]} size={18} />
              <Text style={[type.subhead, { color: theme.inkSecondary, flex: 1 }]}>
                Power rail readable ({battery.watts.toFixed(2)} W now) — the tuner
                will report tokens per joule for every config.
              </Text>
            </Row>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
