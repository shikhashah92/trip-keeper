// Pieces shared by several screens.
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mapUrl, zoneShort, type TripEvent } from './model';
import { checkPin } from './pin';
import { useStore, useTheme } from './store';
import { Badge, Button, Field, T } from './ui';
import { radius, space } from './theme';

export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
const MASKED = { secureTextEntry: true } as const;

/** One stop on a day: tap to edit, with one-tap map and nearby links. */
export function EventRow({ e, last }: { e: TripEvent; last?: boolean }) {
  const { c } = useTheme();
  const edit = () => router.push(e.src === 'item' ? { pathname: '/item', params: { id: e.id } } : { pathname: '/booking', params: { id: e.id } });
  return (
    <View style={[{ paddingVertical: space.sm }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${e.time} ${e.title}`} onPress={edit} style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: 48 }, pressed && { opacity: 0.6 }]}>
        <View style={{ width: 46, paddingTop: 2 }}>
          <T v="small">{e.time}</T>
          {e.tz ? <T v="small" style={{ fontSize: 11 }}>{zoneShort(e.tz)}</T> : null}
        </View>
        <Badge icon={e.icon} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={{ fontWeight: '600' }}>{e.title}</T>
          {e.sub ? <T v="small">{e.sub}</T> : null}
        </View>
      </Pressable>
      {e.place ? <PlaceLinks place={e.place} indent={46 + space.md} /> : null}
    </View>
  );
}

/** Open the place in the maps app, or look for restaurants, cash machines and the like around it. Both need internet. */
export function PlaceLinks({ place, indent = 0 }: { place: string; indent?: number }) {
  const { c } = useTheme();
  const link = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}: ${place}`} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={16} color={c.accent} />
      <T color={c.accent} style={{ fontSize: 15, fontWeight: '600' }}>{label}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: space.lg, paddingLeft: indent }}>
      {link('Map', 'map-outline', () => Linking.openURL(mapUrl(place)))}
      {link('Nearby', 'compass-outline', () => router.push({ pathname: '/nearby', params: { place } }))}
    </View>
  );
}

/** Passphrase entry for encrypted backups. mode "set" asks twice and explains that it can't be recovered. */
export function PassphraseModal({ visible, mode, onSubmit, onClose }: {
  visible: boolean; mode: 'set' | 'enter'; onSubmit: (pass: string) => Promise<void>; onClose: () => void;
}) {
  const { c } = useTheme();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setPass(''); setAgain(''); setError(''); onClose(); };
  async function submit() {
    if (mode === 'set' && pass.trim().length < 10) return setError('Use at least 10 characters. A short sentence works well.');
    if (mode === 'set' && pass !== again) return setError('The two passphrases do not match.');
    if (!pass) return setError('Please enter your passphrase.');
    setBusy(true);
    setError('');
    try {
      await onSubmit(pass);
      setPass(''); setAgain('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-start', padding: space.lg, paddingTop: 72 }}>{/* top-aligned: stays above the keyboard */}
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: c.bg, borderRadius: radius.lg, padding: space.xl, gap: space.md }}>
          <T v="title">{mode === 'set' ? 'Lock this backup' : 'Enter the backup passphrase'}</T>
          <T v="small" style={{ lineHeight: 20 }}>
            {mode === 'set'
              ? 'The backup file is locked with this passphrase on your phone, before you save it anywhere. Nobody else can open it, not even Trip Keeper. If you forget it, the backup cannot be recovered, so write it down somewhere safe.'
              : 'This backup is locked. Enter the passphrase you chose when you saved it.'}
          </T>
          <Field label="Passphrase" value={pass} onChangeText={(t) => { setPass(t); setError(''); }} {...MASKED} autoFocus
            autoCapitalize="none" autoCorrect={false} onSubmitEditing={mode === 'enter' ? submit : undefined} />
          {mode === 'set' && (
            <Field label="Type it again" value={again} onChangeText={(t) => { setAgain(t); setError(''); }} {...MASKED}
              autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} />
          )}
          {error ? <T color={c.danger} style={{ fontSize: 15 }}>{error}</T> : null}
          <Button title={busy ? (mode === 'set' ? 'Locking…' : 'Opening…') : mode === 'set' ? 'Lock and save' : 'Open backup'} onPress={submit} disabled={busy} />
          <Button title="Cancel" kind="ghost" onPress={close} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}

/** Covers the app until the PIN is entered. Rendered at the root, above every screen. */
export function LockScreen() {
  const { pin, locked, unlock } = useStore();
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  if (!pin || !locked) return null;
  async function go() {
    if (await checkPin(text, pin!)) { setText(''); setError(''); unlock(); } else { setError('Wrong PIN'); setText(''); }
  }
  return (
    <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
      <View style={{ width: '100%', maxWidth: 320, gap: space.md, alignItems: 'center' }}>
        <Ionicons name="lock-closed" size={44} color={c.accent} />
        <T v="title">Trip Keeper</T>
        <Field value={text} onChangeText={(t) => { setText(t.replace(/\D/g, '')); setError(''); }} placeholder="PIN" {...MASKED} keyboardType="number-pad"
          inputMode="numeric" autoFocus maxLength={8} onSubmitEditing={go} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 6, width: 220 }} accessibilityLabel="PIN" />
        <T v="small" color={c.danger} style={{ minHeight: 20 }}>{error}</T>
        <Button title="Unlock" onPress={go} style={{ alignSelf: 'stretch' }} />
      </View>
    </View>
  );
}
