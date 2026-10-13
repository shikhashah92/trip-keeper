import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLog, useTheme } from '../store';
import { BOOKING_TYPE, BOOKING_TYPES, delAttachment, delBooking, filesOf, newId, putBooking, zoneLabel, type BookingType } from '../model';
import { diffBooking, type Change, type Current, type Parsed } from '../parse';
import { parseBest } from '../flights';
import { canRead, readFileTexts } from '../reader';
import { clearHandOff, peekHandOff, setViewing } from '../handoff';
import { choose, confirm, notify, pickFiles, type Picked } from '../io';
import { goBack } from '../components';
import { DateTimeField } from '../DateField';
import { Button, Card, Chip, Field, Gap, Header, IconButton, Row, Screen, T } from '../ui';
import { space } from '../theme';

const LABEL: Record<Change['field'], string> = { type: 'Type', title: 'Title', ref: 'Reference', start: 'Starts', end: 'Ends', place: 'Place', notes: 'Notes' };
// With the year: a ticket read for the wrong year is the mistake worth catching here.
const stamp = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const show = (field: Change['field'], v: string) => (!v ? '(empty)' : field === 'start' || field === 'end' ? stamp(v) : field === 'type' ? BOOKING_TYPE(v).label : v);
/** One flight as a line in a list: "6E 521 BOM → BLR, 7 Nov 2026 06:15 to 08:20". */
const oneLine = (p: Parsed) => `${p.title}${p.start ? `, ${stamp(p.start)}${p.end ? ` → ${stamp(p.end).split(',').pop()!.trim()}` : ''}` : ''}`;

/**
 * Add or edit a booking, with its documents. `prefill` is what "Add from a pasted confirmation" found (JSON).
 * Attaching a PDF or screenshot reads it on the phone and offers to fill in, or update, the details.
 */
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
  const [startTz, setStartTz] = useState<string | undefined>(old?.startTz); // zones a read ticket named: the times stay as written
  const [endTz, setEndTz] = useState<string | undefined>(old?.endTz);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<Picked[]>(() => peekHandOff()); // from "Add from a PDF or screenshot"
  const [reading, setReading] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState(''); // the text found in the last file, so a wrong reading can be looked into
  const kept = old ? filesOf(log, old.id).filter((a) => !removed.includes(a.id)) : [];

  // What the form holds now, for a file that finishes reading a few seconds from now.
  const now = useRef<Current>({ type, title, ref, start, end, place, notes });
  const pending = useRef<Picked[]>([]); // files on the form, for saving them with several bookings at once
  useEffect(() => { now.current = { type, title, ref, start, end, place, notes }; pending.current = added; });

  /** Read the first readable file and, if it has something to add or change, ask before touching the form. */
  async function readFrom(list: Picked[]) {
    const f = list.find(canRead);
    if (!f) return; // a Word file and the like: attached, but there is nothing to read
    setReading(`Reading “${f.name}”…`);
    try {
      const texts = await readFileTexts(f, (m) => setReading(m));
      const best = parseBest(texts);
      // One report with everything needed to see why a reading went wrong: the build, the text each way, and what was made of it.
      setLastRead([`Trip Keeper build ${process.env.EXPO_PUBLIC_BUILD ?? 'dev'}`, `File: ${f.name} (${f.type})`, `Used reading ${best.index + 1} of ${texts.length}`,
        ...texts.map((t, i) => `\n--- text, reading ${i + 1} ---\n${t}`), '\n--- found ---', JSON.stringify(best.parsed, null, 1)].join('\n'));
      let found = best.parsed;
      // A ticket with several flights (a connection, a return): offer one booking for each, as a trip planner would.
      if (found.length > 1 && !old) {
        const list2 = found.map((p, i) => `${i + 1}. ${oneLine(p)}`).join('\n');
        if (await choose(`${found.length} flights found`, `${list2}\n\nAdd each as its own booking? The file is attached to the first.`, `Add all ${found.length}`, 'Only the first')) {
          const ids = found.map(() => newId('b'));
          update((l) => found.reduce((n, p, i) => putBooking(n, { id: ids[i], type: 'flight', title: p.title, ref: p.ref ?? '', start: p.start ?? '',
            end: p.end ?? '', place: p.place ?? '', notes: p.notes ?? '', startTz: p.startTz, endTz: p.endTz }), l));
          for (const file of new Set([...pending.current, ...list])) addFile(ids[0], file);
          notify(`${found.length} flights added`, 'Each is in Bookings and on its day in the itinerary. Check the times there.');
          return goBack();
        }
        found = [found[0]];
      }
      // Editing a booking: use the flight on the file that matches it, if there is one.
      const p = (old && found.find((x) => x.title && old.title.includes(x.title.split(' ').slice(0, 2).join(' ')))) || found[0];
      const changes = diffBooking(now.current, p, !old);
      if (!changes.length) return notify('Nothing to fill in', `“${f.name}” was read, but it didn’t give anything new for this booking. If you expected more, tap “Copy a report of what was read” below to see what the reader had to work with.`);
      const lines = changes.map((ch) => `${LABEL[ch.field]}: ${ch.from ? `${show(ch.field, ch.from)} → ` : ''}${show(ch.field, ch.to)}${ch.guessed ? ' (time not found, please check)' : ''}`);
      const ok = await confirm(old ? 'Update from this file?' : 'Fill in from this file?', `${lines.join('\n')}\n\nCheck these before you save.`, old ? 'Update' : 'Fill in');
      if (!ok) return;
      if (p.startTz) setStartTz(p.startTz);
      if (p.endTz) setEndTz(p.endTz);
      for (const ch of changes) {
        if (ch.field === 'type') setType(ch.to as BookingType);
        else if (ch.field === 'title') setTitle(ch.to);
        else if (ch.field === 'ref') setRef(ch.to);
        else if (ch.field === 'start') setStart(ch.to);
        else if (ch.field === 'end') setEnd(ch.to);
        else if (ch.field === 'place') setPlace(ch.to);
        else setNotes(ch.to);
      }
    } catch (e) {
      notify('Couldn’t read this file', `${(e as Error).message} It is still attached, so you can fill in the details by hand.`);
    } finally {
      setReading(null);
    }
  }

  // Files handed over from the Bookings tab are read as soon as the form opens (once, even when effects run twice).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const files = peekHandOff();
    clearHandOff();
    if (files.length) setTimeout(() => readFrom(files), 0); // after the form has painted, so it shows "Reading…"
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function attach() {
    try {
      const picked = await pickFiles();
      if (!picked.length) return;
      setAdded((a) => [...a, ...picked]);
      readFrom(picked);
    } catch (e) { notify('Could not attach', (e as Error).message); }
  }
  /** Show a file inside the app: a new browser tab is blocked or missing in an installed phone app. */
  function view(f: Picked) {
    setViewing(f);
    router.push('/file');
  }
  async function open(fileId: string, name: string, mime: string) {
    const data = await readFile(fileId);
    if (!data) return notify('That file is no longer on this phone', `“${name}” can’t be found. Restore a backup that has it, or attach it again.`);
    view({ name, type: mime, data });
  }
  async function copyRead() {
    try { await navigator.clipboard.writeText(lastRead); notify('Copied', 'The report is on your clipboard. Paste it where you were asked to; it has the text from the file in it.'); }
    catch { notify('Could not copy', 'Your browser did not allow it.'); }
  }
  function save() {
    if (reading) return notify('Still reading the file', 'This takes a few seconds. Save when it finishes.');
    if (!title.trim()) return notify('Add a title', 'For example “AI 123 Mumbai to Madrid”.');
    if (start && end && end < start) return notify('Check the dates', 'It ends before it starts.');
    const bid = old?.id ?? newId('b');
    update((l) => {
      let n = putBooking(l, { id: bid, type, title: title.trim(), ref: ref.trim(), start, end, place: place.trim(), notes: notes.trim(), startTz, endTz });
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
      {reading ? (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <ActivityIndicator color={c.accent} />
            <T style={{ flex: 1 }}>{reading}</T>
          </Card>
          <Gap />
        </>
      ) : null}
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
      {startTz && start ? <T v="small">Local time there: {zoneLabel(startTz, start)}</T> : null}
      <Gap />
      <T v="label">Ends (arrival or check-out)</T>
      <DateTimeField value={end} onChange={setEnd} label="Ends" />
      {endTz && end ? <T v="small">Local time there: {zoneLabel(endTz, end)}</T> : null}
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
            <Row key={`${f.name}${i}`} last={i === added.length - 1} title={f.name} subtitle="Will be added when you save" onPress={() => view(f)}
              left={<Ionicons name="add-circle-outline" size={22} color={c.accent} />}
              actions={<IconButton icon="close-circle-outline" label={`Remove ${f.name}`} onPress={() => setAdded((a) => a.filter((_, j) => j !== i))} />} />
          ))}
        </Card>
      ) : <T v="small">No files attached.</T>}
      <Gap h={space.sm} />
      <Button title="Attach files" icon="attach" kind="secondary" onPress={attach} disabled={!!reading} />
      <T v="small" style={{ marginTop: space.sm }}>A PDF or screenshot is read on this phone to fill in the details. It is not sent anywhere.</T>
      {lastRead ? <><Gap h={space.sm} /><Button title="Copy a report of what was read" kind="ghost" icon="copy-outline" onPress={copyRead} /></> : null}
      <Gap h={24} />
      <Button title="Save" onPress={save} disabled={!!reading} />
      {old ? <><Gap h={12} /><Button title="Delete booking" kind="danger" onPress={remove} /></> : null}
    </Screen>
  );
}
