import { View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLog, useTheme } from '../../store';
import { handOff } from '../../handoff';
import { notify, pickFiles } from '../../io';
import { BOOKING_TYPE, filesOf, groupBookings, nights, plural, whenText } from '../../model';
import { PlaceLinks } from '../../components';
import { Badge, Button, Card, Gap, Header, IconButton, Row, Screen, T } from '../../ui';
import { space } from '../../theme';

export default function Bookings() {
  const { log } = useLog();
  const { c } = useTheme();
  const groups = groupBookings(log);
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
      {!groups.length ? (
        <Card><T v="small">No bookings yet. Tap + to add a flight, hotel, Airbnb or any document.</T></Card>
      ) : groups.map((g) => (
        <View key={g.id} style={{ marginBottom: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingBottom: space.xs, paddingLeft: 2 }}>
            <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={18} color={c.accent} />
            <T style={{ fontWeight: '700' }}>{g.label} <T v="small">{g.bookings.length}</T></T>
          </View>
          <Card pad={false} style={{ paddingHorizontal: space.lg }}>
            {g.bookings.map((b, i) => {
              const n = filesOf(log, b.id).length;
              const stay = nights(b);
              return (
                <View key={b.id}>
                  <Row last={i === g.bookings.length - 1 && !b.place} left={<Badge icon={BOOKING_TYPE(b.type).icon} />} title={b.title}
                    subtitle={[whenText(b), stay ? plural(stay, 'night') : '', b.place, b.ref ? `Ref ${b.ref}` : '', n ? plural(n, 'file') : ''].filter(Boolean).join(' · ')}
                    onPress={() => router.push({ pathname: '/booking', params: { id: b.id } })} />
                  {b.place ? <View style={{ paddingBottom: space.sm }}><PlaceLinks place={b.place} indent={40 + space.md} /></View> : null}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
