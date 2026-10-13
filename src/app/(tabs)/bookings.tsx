import { View } from 'react-native';
import { router } from 'expo-router';
import { useLog, useTheme } from '../../store';
import { handOff } from '../../handoff';
import { notify, pickFiles } from '../../io';
import { BOOKING_TYPE, filesOf, fmtStamp, plural, sortedBookings } from '../../model';
import { PlaceLinks } from '../../components';
import { Badge, Button, Card, Gap, Header, IconButton, Row, Screen, T } from '../../ui';
import { space } from '../../theme';

export default function Bookings() {
  const { log } = useLog();
  const { c } = useTheme();
  const list = sortedBookings(log);
  // Pick a ticket or confirmation; the booking form opens with the file attached and its details read in.
  async function fromFile() {
    try {
      const files = await pickFiles();
      if (!files.length) return;
      handOff(files);
      router.push('/booking');
    } catch (e) { notify('Could not attach', (e as Error).message); }
  }
  return (
    <Screen>
      <Header title="Bookings" right={<IconButton icon="add-circle" size={32} color={c.accent} label="Add a booking" onPress={() => router.push('/booking')} />} />
      <Button title="Add from a PDF or screenshot" icon="document-attach-outline" onPress={fromFile} />
      <Gap h={space.sm} />
      <Button title="Add from pasted text" icon="clipboard-outline" kind="secondary" onPress={() => router.push('/paste')} />
      <Gap />
      {!list.length ? (
        <Card><T v="small">No bookings yet. Tap + to add a flight, hotel, Airbnb or any document.</T></Card>
      ) : (
        <Card pad={false} style={{ paddingHorizontal: space.lg }}>
          {list.map((b, i) => {
            const n = filesOf(log, b.id).length;
            const kind = BOOKING_TYPE(b.type);
            return (
              <View key={b.id}>
                <Row last={i === list.length - 1 && !b.place} left={<Badge icon={kind.icon} />} title={b.title}
                  subtitle={[fmtStamp(b.start), b.place, b.ref ? `Ref ${b.ref}` : '', n ? plural(n, 'file') : ''].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/booking', params: { id: b.id } })} />
                {b.place ? <View style={{ paddingBottom: space.sm }}><PlaceLinks place={b.place} indent={40 + space.md} /></View> : null}
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
