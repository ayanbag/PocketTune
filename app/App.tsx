/**
 * PocketTune — find and apply the fastest local-LLM configuration for the
 * Arm silicon in this phone. Arm Create: AI Optimization Challenge 2026.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { spacing, type as t, useTheme } from './src/theme';
import { useStore } from './src/store';
import { ChatIcon, ChipIcon, LabIcon, TuneIcon } from './src/components/icons';
import { DeviceScreen } from './src/screens/DeviceScreen';
import { TuneScreen } from './src/screens/TuneScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { LabScreen } from './src/screens/LabScreen';

type Tab = 'device' | 'tune' | 'chat' | 'lab';

const TABS: { id: Tab; label: string; Icon: typeof ChipIcon }[] = [
  { id: 'device', label: 'Device', Icon: ChipIcon },
  { id: 'tune', label: 'Tune', Icon: TuneIcon },
  { id: 'chat', label: 'Chat', Icon: ChatIcon },
  { id: 'lab', label: 'Lab', Icon: LabIcon },
];

function Root() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('device');
  const boot = useStore(s => s.boot);
  const booted = useStore(s => s.booted);
  const tuneRunning = useStore(s => s.tune.running);

  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }} edges={['top']}>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.page}
      />
      <View style={{ flex: 1 }}>
        {!booted ? (
          <View style={styles.bootWrap}>
            <Text style={[t.largeTitle, { color: theme.inkPrimary }]}>PocketTune</Text>
            <Text style={[t.subhead, { color: theme.inkMuted, marginTop: 6 }]}>
              Reading this phone's silicon…
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, display: tab === 'device' ? 'flex' : 'none' }}>
              <DeviceScreen theme={theme} />
            </View>
            <View style={{ flex: 1, display: tab === 'tune' ? 'flex' : 'none' }}>
              <TuneScreen theme={theme} />
            </View>
            <View style={{ flex: 1, display: tab === 'chat' ? 'flex' : 'none' }}>
              <ChatScreen theme={theme} />
            </View>
            <View style={{ flex: 1, display: tab === 'lab' ? 'flex' : 'none' }}>
              <LabScreen theme={theme} />
            </View>
          </>
        )}
      </View>

      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.surfaceElevated,
            borderTopColor: theme.hairline,
          },
        ]}>
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          const busy = id === 'tune' && tuneRunning;
          return (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              style={styles.tabItem}
              android_ripple={{ color: theme.fill, borderless: true }}>
              <Icon color={active ? theme.accent : theme.inkMuted} size={23} />
              <Text
                style={[
                  t.caption,
                  {
                    color: active ? theme.accent : theme.inkMuted,
                    marginTop: 3,
                    fontWeight: active ? '600' : '500',
                  },
                ]}>
                {busy ? 'Tuning…' : label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 18,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
});
