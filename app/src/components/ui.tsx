/**
 * UI primitives — Apple grouped-card language: soft cards on a neutral page,
 * hairline separators, one accent, generous whitespace.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { radius, spacing, Theme, type } from '../theme';

export function Card({
  theme,
  style,
  children,
}: {
  theme: Theme;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
          shadowOpacity: theme.dark ? 0 : 0.05,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionHeader({ theme, title }: { theme: Theme; title: string }) {
  return (
    <Text
      style={[
        type.caption,
        { color: theme.inkMuted, textTransform: 'uppercase', marginBottom: spacing.s, marginLeft: spacing.xs },
      ]}>
      {title}
    </Text>
  );
}

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider({ theme, inset = 0 }: { theme: Theme; inset?: number }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.hairline,
        marginLeft: inset,
      }}
    />
  );
}

export function Chip({
  theme,
  label,
  tone = 'neutral',
}: {
  theme: Theme;
  label: string;
  tone?: 'neutral' | 'accent' | 'good' | 'off';
}) {
  const palette = {
    neutral: { bg: theme.fill, fg: theme.inkSecondary },
    accent: { bg: theme.accentSoft, fg: theme.accent },
    good: { bg: theme.dark ? 'rgba(12,163,12,0.18)' : 'rgba(12,163,12,0.12)', fg: theme.goodText },
    off: { bg: theme.fill, fg: theme.inkMuted },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      <Text style={[type.footnote, { color: palette.fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

export function Button({
  theme,
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const bg =
    kind === 'primary' ? theme.accent : kind === 'destructive' ? 'transparent' : theme.fillStrong;
  const fg =
    kind === 'primary' ? theme.onAccent : kind === 'destructive' ? theme.critical : theme.inkPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[type.headline, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  theme,
  options,
  value,
  onChange,
}: {
  theme: Theme;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.fill }]}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segItem,
              active && {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.hairline,
                borderWidth: StyleSheet.hairlineWidth,
                shadowColor: '#000',
                shadowOpacity: theme.dark ? 0 : 0.08,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: active ? 1 : 0,
              },
            ]}>
            <Text
              style={[
                type.subhead,
                {
                  color: active ? theme.inkPrimary : theme.inkSecondary,
                  fontWeight: active ? '600' : '400',
                },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({
  theme,
  fraction,
  color,
}: {
  theme: Theme;
  fraction: number;
  color?: string;
}) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.fill }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color ?? theme.accent,
        }}
      />
    </View>
  );
}

export function StatTile({
  theme,
  label,
  value,
  unit,
  delta,
  flex = 1,
}: {
  theme: Theme;
  label: string;
  value: string;
  unit?: string;
  delta?: { text: string; good: boolean };
  flex?: number;
}) {
  return (
    <Card theme={theme} style={{ flex, paddingVertical: spacing.l }}>
      <Text style={[type.subhead, { color: theme.inkSecondary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
        <Text style={[type.statValue, { color: theme.inkPrimary }]}>{value}</Text>
        {unit ? (
          <Text style={[type.subhead, { color: theme.inkMuted, marginLeft: 4 }]}>{unit}</Text>
        ) : null}
      </View>
      {delta ? (
        <Text
          style={[
            type.footnote,
            { color: delta.good ? theme.goodText : theme.critical, fontWeight: '600', marginTop: 2 },
          ]}>
          {delta.text}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  button: {
    borderRadius: radius.control + 2,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  segTrack: {
    flexDirection: 'row',
    borderRadius: radius.control,
    padding: 2,
  },
  segItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.control - 2,
    alignItems: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
