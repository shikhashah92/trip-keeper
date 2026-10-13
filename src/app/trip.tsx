import { useState } from 'react';
import { useLog } from '../store';
import { putTrip, validTripDates } from '../model';
import { notify } from '../io';
import { goBack } from '../components';
import { DateField } from '../DateField';
import { Button, Chip, Field, Gap, Header, IconButton, Screen, T } from '../ui';

export default function TripScreen() {
  const { log, update } = useLog();
  const t = log.trip;
  const [name, setName] = useState(t.name);
  const [start, setStart] = useState(t.start);
  const [end, setEnd] = useState(t.end);
  const [final, setFinal] = useState(t.final);
  function save() {
    if (!validTripDates(start, end)) return notify('Check the dates', 'The trip can’t end before it starts.');
    update((l) => putTrip(l, { name: name.trim() || 'My Trip', start, end, final }));
    goBack();
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Trip" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <Field label="Trip name" value={name} onChangeText={setName} />
      <Gap />
      <T v="label">Start date</T>
      <DateField value={start} onChange={setStart} label="Start date" />
      <Gap />
      <T v="label">End date</T>
      <DateField value={end} onChange={setEnd} label="End date" min={start || undefined} />
      <Gap />
      <Chip label="Itinerary is final" icon="checkmark-circle-outline" selected={final} onPress={() => setFinal((f) => !f)} />
      <Gap h={24} />
      <Button title="Save trip" onPress={save} />
    </Screen>
  );
}
