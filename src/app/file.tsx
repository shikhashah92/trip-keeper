import { createElement, useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { getViewing } from '../handoff';
import { isImage, isPdf, readFileTexts, renderPdfInto } from '../reader';
import { notify, saveFile } from '../io';
import { goBack } from '../components';
import { useTheme } from '../store';
import { Button, Gap, Header, IconButton, Screen, T } from '../ui';
import { space } from '../theme';

/** A ticket or voucher, shown inside the app (a new browser tab is blocked or missing in an installed phone app). */
export default function FileViewer() {
  const { c } = useTheme();
  const f = getViewing(); // set just before navigating here
  const [holder, setHolder] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(() => !!f && isPdf(f));
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!f || !isPdf(f) || !holder) return;
    let live = true;
    const el = holder;
    el.replaceChildren();
    renderPdfInto(f, el, (m) => live && setNote(m))
      .catch((e) => live && setFailed((e as Error).message))
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [f, holder]);

  /** All the text of the file on the clipboard (a screenshot is read first), for pasting into a message or a note. */
  async function copyText() {
    if (!f) return;
    setCopying(true);
    try {
      const text = (await readFileTexts(f))[0];
      await navigator.clipboard.writeText(text);
      notify('Text copied', 'The text of this file is on your clipboard.');
    } catch (e) { notify('Could not copy the text', (e as Error).message); }
    finally { setCopying(false); }
  }

  /** Save to Files, or the share sheet on a phone. */
  async function save() {
    if (!f) return;
    try {
      const bin = atob(f.data.slice(f.data.indexOf(',') + 1));
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await saveFile(f.name, u8, f.type);
    } catch (e) { notify('Could not save', (e as Error).message); }
  }

  if (!f) return <Screen edges={['top', 'bottom']}><Header title="File" left={<IconButton icon="close" label="Close" onPress={goBack} />} /><T v="small">Nothing to show.</T></Screen>;
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={f.name} left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      {isImage(f) ? (
        <Image accessibilityLabel={f.name} source={{ uri: f.data }} resizeMode="contain" style={{ width: '100%', aspectRatio: 0.75, backgroundColor: c.card, borderRadius: 8 }} />
      ) : isPdf(f) ? (
        <>
          {busy ? <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingBottom: space.md }}><ActivityIndicator color={c.accent} /><T v="small">{note || 'Opening…'}</T></View> : null}
          {failed ? <T color={c.danger}>{failed} You can still save it below.</T> : null}
          {createElement('div', { ref: setHolder, style: { width: '100%' } })}
        </>
      ) : <T>This kind of file can’t be shown here. Save it to open it in another app.</T>}
      <Gap />
      {isPdf(f) || isImage(f) ? <><Button title={copying ? 'Reading…' : 'Copy text'} icon="copy-outline" kind="secondary" onPress={copyText} disabled={copying} /><Gap h={space.sm} /></> : null}
      <Button title="Save or share" icon="share-outline" kind="secondary" onPress={save} />
    </Screen>
  );
}
