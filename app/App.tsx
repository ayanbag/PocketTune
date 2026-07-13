/**
 * PocketTune — find and apply the fastest local-LLM configuration for the
 * Arm silicon in this phone. Arm Create: AI Optimization Challenge 2026.
 */
import React, { useEffect } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { spacing, type as t, useTheme } from './src/theme';
import { TabId, useStore } from './src/store';
import { useKeyboardHeight } from './src/lib/keyboard';
import { BoxIcon, ChatIcon, ChipIcon, LabIcon, TuneIcon } from './src/components/icons';
import { DeviceScreen } from './src/screens/DeviceScreen';
import { ModelsScreen } from './src/screens/ModelsScreen';
import { TuneScreen } from './src/screens/TuneScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { LabScreen, hasPublishedEvidence } from './src/screens/LabScreen';

const TABS: { id: TabId; label: string; Icon: typeof ChipIcon }[] = [
  { id: 'device', label: 'Device', Icon: ChipIcon },
  { id: 'models', label: 'Models', Icon: BoxIcon },
  { id: 'tune', label: 'Tune', Icon: TuneIcon },
  { id: 'chat', label: 'Chat', Icon: ChatIcon },
  { id: 'lab', label: 'Lab', Icon: LabIcon },
];

function Root() {
  const theme = useTheme();
  const tab = useStore(s => s.tab);
  const setTab = useStore(s => s.setTab);
  const boot = useStore(s => s.boot);
  const booted = useStore(s => s.booted);
  const tuneRunning = useStore(s => s.tune.running);
  // Manual keyboard avoidance (edge-to-edge kills adjustResize, see
  // lib/keyboard.ts): pad the content by the keyboard height and hide the
  // tab bar, so whatever input has focus sits flush on top of the keyboard.
  // The reported height excludes the gesture-nav inset, so add it back.
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const keyboardPad = keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0;

  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }} edges={['top']}>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.page}
      />
      <View style={{ flex: 1, paddingBottom: keyboardPad }}>
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
            <View style={{ flex: 1, display: tab === 'models' ? 'flex' : 'none' }}>
              <ModelsScreen theme={theme} />
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
          keyboardHeight > 0 && { display: 'none' },
          {
            backgroundColor: theme.surfaceElevated,
            borderTopColor: theme.hairline,
          },
        ]}>
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          const busy = id === 'tune' && tuneRunning;
          const disabled = id === 'lab' && !hasPublishedEvidence;
          return (
            <Pressable
              key={id}
              disabled={disabled}
              onPress={() => setTab(id)}
              style={[styles.tabItem, disabled && { opacity: 0.35 }]}
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
