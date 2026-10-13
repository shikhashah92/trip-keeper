import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { newLog, putTrip, validTripDates } from '../model';
import { useBackup } from '../backupActions';
import { hasLegacyData } from '../legacy';
import { notify } from '../io';
import { DateField } from '../DateField';
import { Button, Field, Gap, Header, Screen, T } from '../ui';

/** First run: name the trip, or bring one over from a backup or the first Trip Keeper. */
export default function Welcome() {
  const { start } = useStore();
  const { restore, moveOver, modal } = useBackup();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [legacy, setLegacy] = useState(false);
  useEffect(() => { hasLegacyData().then(setLegacy); }, []);

  async function begin() {
    if (!validTripDates(from, to)) return notify('Check the dates', 'The trip can’t end before it starts.');
    try { await start({ log: putTrip(newLog(), { name: name.trim() || 'My Trip', start: from, end: to }) }); }
    catch (e) { notify('Could not start', (e as Error).message); }
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Trip Keeper" />
      <T>Bookings, tickets, the itinerary and expenses in one place. Everything stays on this phone and works offline.</T>
      <Gap />
      <Field label="Trip name" value={name} onChangeText={setName} placeholder="e.g. Spain, October" />
      <Gap />
      <T v="label">Start date (optional)</T>
      <DateField value={from} onChange={setFrom} label="Start date" />
      <Gap />
      <T v="label">End date (optional)</T>
      <DateField value={to} onChange={setTo} label="End date" min={from || undefined} />
      <Gap h={24} />
      <Button title="Start" onPress={begin} />
      <Gap h={32} />
      <T v="label">Already have a trip?</T>
      <Gap h={12} />
      <Button title="Restore from a backup" icon="folder-open-outline" kind="secondary" onPress={restore} />
      {legacy ? <><Gap h={12} /><Button title="Bring my trip over from the first Trip Keeper" icon="swap-horizontal-outline" kind="secondary" onPress={moveOver} /></> : null}
      {modal}
    </Screen>
  );
}
