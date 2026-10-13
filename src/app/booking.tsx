import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLog, useTheme } from '../store';
import { BOOKING_TYPES, delAttachment, delBooking, filesOf, newId, putBooking, type BookingType } from '../model';
import type { Parsed } from '../parse';
import { confirm, notify, openAttachment, pickFiles, type Picked } from '../io';
import { goBack } from '../components';
import { DateTimeField } from '../DateField';
import { Button, Card, Chip, Field, Gap, Header, IconButton, Row, Screen, T } from '../ui';
import { space } from '../theme';

/** Add or edit a booking, with its documents. `prefill` is what "Add from a pasted confirmation" found (JSON). */
export default function BookingScreen() {
  const { id, prefill } = useLocalSearchParams<{ id?: string; prefill?: string }>();
  const { log, update, addFile, readFile } = useLog();
  const { c } = useTheme();
  const old = log.bookings.find((b) => b.id === id);
  const pre = useMemo<Partial<Parsed>>(() => { try { return prefill ? JSON.parse(prefill) : {}; } catch { return {}; } }, [prefill]);
  const [type, setType] = useState<BookingType>(old?.type ?? pre.type ?? 'flight');
  const [title, setTitle] = useState(old?.title ?? pre.title ?? '');
  const [ref, setRef] = useState(old?.ref ?? pre.ref ?? '');
  const [start, setStart] = useState(old?.start ?? pre.start ?? '');
  const [end, setEnd] = useState(old?.end ?? pre.end ?? '');
  const [place, setPlace] = useState(old?.place ?? pre.place ?? '');
  const [notes, setNotes] = useState(old?.notes ?? '');
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<Picked[]>([]);
  const kept = old ? filesOf(log, old.id).filter((a) => !removed.includes(a.id)) : [];

  async function attach() {
    try {
      const picked = await pickFiles();
      setAdded((a) => [...a, ...picked]);
    } catch (e) { notify('Could not attach', (e as Error).message); }
  }
  async function open(fileId: string, name: string, mime: string) {
    const data = await readFile(fileId);
    if (!data) return notify('That file is no longer on this phone', `“${name}” can’t be found. Restore a backup that has it, or attach it again.`);
    openAttachment(data, mime);
  }
  function save() {
    if (!title.trim()) return notify('Add a title', 'For example “AI 123 Mumbai to Madrid”.');
    if (start && end && end < start) return notify('Check the dates', 'It ends before it starts.');
    const bid = old?.id ?? newId('b');
    update((l) => {
      let n = putBooking(l, { id: bid, type, title: title.trim(), ref: ref.trim(), start, end, place: place.trim(), notes: notes.trim() });
      for (const r of removed) n = delAttachment(n, r);
      return n;
    });
    for (const f of added) addFile(bid, f);
    goBack();
  }
  async function remove() {
    if (!(await confirm('Delete this booking?', 'Its files go with it. You can go back to an earlier version in Undo history.', 'Delete', true))) return;
    update((l) => delBooking(l, old!.id));
    goBack();
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={old ? 'Edit booking' : 'Add booking'} left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="label">Type</T>
      <Gap h={space.sm} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {BOOKING_TYPES.map((t) => <Chip key={t.id} label={t.label} icon={t.icon} selected={t.id === type} onPress={() => setType(t.id)} />)}
      </View>
      <Gap />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. AI 123 Mumbai to Madrid" />
      <Gap />
      <Field label="Confirmation, PNR or booking reference" value={ref} onChangeText={setRef} autoCapitalize="characters" autoCorrect={false} />
      <Gap />
      <T v="label">Starts (departure or check-in)</T>
      <DateTimeField value={start} onChange={setStart} label="Starts" />
      <Gap />
      <T v="label">Ends (arrival or check-out)</T>
      <DateTimeField value={end} onChange={setEnd} label="Ends" />
      <Gap />
      <Field label="Address, airport or place" value={place} onChangeText={setPlace} />
      <Gap />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }} />
      <Gap />
      <T v="label">Documents (tickets, vouchers, PDFs, screenshots)</T>
      <Gap h={space.sm} />
      {kept.length || added.length ? (
        <Card pad={false} style={{ paddingHorizontal: space.lg }}>
          {kept.map((a, i) => (
            <Row key={a.id} last={i === kept.length - 1 && !added.length} title={a.name} subtitle={`${Math.max(1, Math.round(a.size / 1024))} KB`}
              left={<Ionicons name="attach" size={22} color={c.accent} />} onPress={() => open(a.id, a.name, a.type)}
              actions={<IconButton icon="close-circle-outline" label={`Remove ${a.name}`} onPress={() => setRemoved((r) => [...r, a.id])} />} />
          ))}
          {added.map((f, i) => (
            <Row key={`${f.name}${i}`} last={i === added.length - 1} title={f.name} subtitle="Will be added when you save"
              left={<Ionicons name="add-circle-outline" size={22} color={c.accent} />}
              actions={<IconButton icon="close-circle-outline" label={`Remove ${f.name}`} onPress={() => setAdded((a) => a.filter((_, j) => j !== i))} />} />
          ))}
        </Card>
      ) : <T v="small">No files attached.</T>}
      <Gap h={space.sm} />
      <Button title="Attach files" icon="attach" kind="secondary" onPress={attach} />
      <Gap h={24} />
      <Button title="Save" onPress={save} />
      {old ? <><Gap h={12} /><Button title="Delete booking" kind="danger" onPress={remove} /></> : null}
    </Screen>
  );
}
