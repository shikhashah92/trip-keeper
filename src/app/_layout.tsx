import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore, StoreProvider, useTheme } from '../store';
import '../pwa'; // registers the service worker
import { today } from '../model';
import { confirm, notify, saveFile } from '../io';
import { LockScreen } from '../components';
import { Button, Gap, Screen, T } from '../ui';
import { DialogHost } from '../dialog';

/** Shown if stored data fails validation: never a dead end, never silently overwritten. */
function Recovery() {
  const { corrupt, erase } = useStore();
  const download = () => saveFile(`trip-keeper-unreadable-${today()}.json`, corrupt!.raw, 'application/json').catch((e) => notify('Download failed', e.message));
  const fresh = async () => {
    if (await confirm('Start fresh?', 'A copy of the unreadable data is kept on this device. Download it first if you want to keep it safe elsewhere.', 'Start fresh', true)) await erase();
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <Gap h={48} />
      <T v="h1">We couldn’t read your data</T>
      <Gap h={12} />
      <T>Your data is still on this device. Download a copy first. Then start fresh. You can restore a backup afterwards from Settings.</T>
      <Gap h={8} />
      <T v="small">Details: {corrupt!.error}</T>
      <Gap h={24} />
      <Button title="Download my data" icon="download-outline" onPress={download} />
      <Gap h={12} />
      <Button title="Start fresh" kind="secondary" onPress={fresh} />
    </Screen>
  );
}

function Root() {
  const { ready, log, corrupt } = useStore();
  const { c, dark } = useTheme();
  useEffect(() => {
    document.body.style.backgroundColor = c.bg;
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    // Browser/OS chrome (status bar in the installed app) follows the theme.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', c.bg));
  }, [c.bg, dark]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View>;
  if (corrupt) return <><Recovery /><DialogHost /></>;
  const modal = { presentation: 'modal' as const };
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!!log}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item" options={modal} />
          <Stack.Screen name="booking" options={modal} />
          <Stack.Screen name="paste" options={modal} />
          <Stack.Screen name="expense" options={modal} />
          <Stack.Screen name="expense-settings" options={modal} />
          <Stack.Screen name="calendar" options={modal} />
          <Stack.Screen name="nearby" options={modal} />
          <Stack.Screen name="trip" options={modal} />
          <Stack.Screen name="country" options={modal} />
          <Stack.Screen name="pin" options={modal} />
          <Stack.Screen name="backup" />
          <Stack.Screen name="undo" />
          <Stack.Screen name="whats-new" options={modal} />
          <Stack.Screen name="install" options={modal} />
        </Stack.Protected>
        <Stack.Protected guard={!log}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
      <LockScreen />
      <DialogHost />
    </>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
