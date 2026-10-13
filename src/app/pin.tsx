import { useState } from 'react';
import { useStore } from '../store';
import { checkPin, makePin, PIN_RE } from '../pin';
import { confirm, notify } from '../io';
import { goBack } from '../components';
import { Button, Field, Gap, Header, IconButton, Screen, T } from '../ui';

const MASKED = { secureTextEntry: true, keyboardType: 'number-pad', inputMode: 'numeric', autoCapitalize: 'none', autoCorrect: false, maxLength: 8 } as const;

export default function Pin() {
  const { pin, setPin } = useStore();
  const [current, setCurrent] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const digits = (v: string) => v.replace(/\D/g, '');

  async function save() {
    if (pin && !(await checkPin(current, pin))) return notify('Current PIN is wrong');
    if (!PIN_RE.test(a)) return notify('Use 4 to 8 digits');
    if (a !== b) return notify('The PINs do not match');
    await setPin(await makePin(a));
    goBack();
  }
  async function remove() {
    if (!pin) return;
    if (!(await checkPin(current, pin))) return notify('Enter your current PIN above to remove it');
    if (await confirm('Remove the PIN?', 'Anyone who picks up this phone can open Trip Keeper.', 'Remove', true)) { await setPin(null); goBack(); }
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={pin ? 'Change PIN' : 'Set a PIN'} left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="small">{pin ? 'The app locks when opened and after a minute in the background.' : 'Set a PIN so nobody can open your bookings if they pick up your phone.'}</T>
      <Gap />
      {pin ? <><Field label="Current PIN" value={current} onChangeText={(v) => setCurrent(digits(v))} {...MASKED} /><Gap /></> : null}
      <Field label="New PIN (4 to 8 digits)" value={a} onChangeText={(v) => setA(digits(v))} {...MASKED} />
      <Gap />
      <Field label="Repeat new PIN" value={b} onChangeText={(v) => setB(digits(v))} {...MASKED} />
      <Gap h={24} />
      <Button title="Save PIN" onPress={save} />
      {pin ? <><Gap h={12} /><Button title="Remove PIN" kind="danger" onPress={remove} /></> : null}
      <Gap />
      <T v="small">This is a screen lock, not encryption. If you forget the PIN you would have to clear this site’s data in your browser settings and restore from a backup.</T>
    </Screen>
  );
}
