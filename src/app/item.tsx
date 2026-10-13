import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useLog } from '../store';
import { defaultDay, delItem, newId, putItem, today } from '../model';
import { confirm, notify } from '../io';
import { goBack } from '../components';
import { DateField, TimeField } from '../DateField';
import { Button, Field, Gap, Header, IconButton, Screen, T } from '../ui';

/** Add or edit a stop of your own (a booking's dates show up in the itinerary by themselves). */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { log, update } = useLog();
  const old = log.items.find((i) => i.id === id);
  const [title, setTitle] = useState(old?.title ?? '');
  const [date, setDate] = useState(old?.date ?? defaultDay(log.trip, today()));
  const [time, setTime] = useState(old?.time ?? '');
  const [place, setPlace] = useState(old?.place ?? '');
  const [notes, setNotes] = useState(old?.notes ?? '');

  function save() {
    if (!title.trim() || !date) return notify('Add a title and a date', 'Both are needed so it can appear on the right day.');
    update((l) => putItem(l, { id: old?.id ?? newId('i'), title: title.trim(), date, time, place: place.trim(), notes: notes.trim() }));
    goBack();
  }
  async function remove() {
    if (!(await confirm('Delete this activity?', 'It is removed from the itinerary. You can go back to an earlier version in Undo history.', 'Delete', true))) return;
    update((l) => delItem(l, old!.id));
    goBack();
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={old ? 'Edit activity' : 'Add activity'} left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Sagrada Família tour" autoFocus={!old} />
      <Gap />
      <T v="label">Date</T>
      <DateField value={date} onChange={setDate} label="Date" />
      <Gap />
      <T v="label">Time (optional)</T>
      <TimeField value={time} onChange={setTime} label="Time" />
      <Gap />
      <Field label="Place or address" value={place} onChangeText={setPlace} />
      <Gap />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }} />
      <Gap h={24} />
      <Button title="Save" onPress={save} />
      {old ? <><Gap h={12} /><Button title="Delete" kind="danger" onPress={remove} /></> : null}
    </Screen>
  );
}
