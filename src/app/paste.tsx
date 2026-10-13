import { useState } from 'react';
import { router } from 'expo-router';
import { parsePaste } from '../parse';
import { notify } from '../io';
import { goBack } from '../components';
import { Button, Field, Gap, Header, IconButton, Screen, T } from '../ui';

/** Paste the text of a confirmation email or booking page; the booking form opens with what was found, to review. */
export default function Paste() {
  const [text, setText] = useState('');
  function read() {
    if (!text.trim()) return notify('Paste some text first');
    router.replace({ pathname: '/booking', params: { prefill: JSON.stringify(parsePaste(text)) } });
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="From a confirmation" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="small">Paste the text of a confirmation email or booking page. Trip Keeper fills in what it can find (type, reference, dates, address) and you review before saving. Nothing leaves your phone. If no time is found it puts 12:00, so check it.</T>
      <Gap />
      <Field label="Pasted text" value={text} onChangeText={setText} multiline autoFocus style={{ minHeight: 200, paddingTop: 12, textAlignVertical: 'top' }} />
      <Gap h={24} />
      <Button title="Read it" onPress={read} />
    </Screen>
  );
}
