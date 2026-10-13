import { View } from 'react-native';
import { useLog } from '../store';
import { COUNTRY, COUNTRY_NAMES } from '../countries';
import { putTrip } from '../model';
import { goBack } from '../components';
import { Card, Chip, Gap, Header, IconButton, Screen, T } from '../ui';
import { space } from '../theme';

/** Plug, voltage, currency, emergency number and driving side for a country: works offline. */
export default function Country() {
  const { log, update } = useLog();
  const sel = log.trip.country && COUNTRY[log.trip.country] ? log.trip.country : undefined;
  const c = sel ? COUNTRY[sel] : null;
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Country quick facts" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      {c ? (
        <>
          <Card>
            <T v="title">{sel}</T>
            <Gap h={space.sm} />
            <T>Plug type: <T style={{ fontWeight: '700' }}>{c.plug}</T> · {c.volts}</T>
            <T>Currency: <T style={{ fontWeight: '700' }}>{c.currency}</T></T>
            <T>Emergency: <T style={{ fontWeight: '700' }}>{c.emergency}</T></T>
            <T>Drives on the <T style={{ fontWeight: '700' }}>{c.drives}</T></T>
            <Gap h={space.sm} />
            <T v="small">General reference, so double-check close to travel.</T>
          </Card>
          <Gap />
        </>
      ) : <><T v="small">Choose where you are going.</T><Gap /></>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {COUNTRY_NAMES.map((n) => (
          <Chip key={n} label={n} selected={n === sel} onPress={() => update((l) => putTrip(l, { country: n === sel ? undefined : n }))} />
        ))}
      </View>
    </Screen>
  );
}
