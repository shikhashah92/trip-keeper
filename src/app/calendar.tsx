import { useState } from 'react';
import { useLog } from '../store';
import { today } from '../model';
import { buildIcs } from '../ics';
import { notify, saveFile } from '../io';
import { goBack } from '../components';
import { Button, Chip, Gap, Header, IconButton, Screen, T } from '../ui';

export default function Calendar() {
  const { log } = useLog();
  const [preview, setPreview] = useState(true);
  async function make() {
    try {
      const ics = buildIcs(log, preview, today());
      if (await saveFile(`${log.trip.name.replace(/\W+/g, '-')}.ics`, ics, 'text/calendar')) goBack();
    } catch (e) { notify('Could not make the file', (e as Error).message); }
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Add to calendar" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="small">Makes a calendar file with every dated stop and booking. Opening it adds them to your calendar app with reminders: flights 1 day and 3 hours before, everything else 1 hour before. Times are added as local times.</T>
      <Gap />
      <Chip label="8 PM reminder with tomorrow’s plan" icon="moon-outline" selected={preview} onPress={() => setPreview((p) => !p)} />
      <Gap h={24} />
      <Button title="Save calendar file" icon="calendar-outline" onPress={make} />
    </Screen>
  );
}
