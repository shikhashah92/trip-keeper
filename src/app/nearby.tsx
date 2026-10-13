import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { mapUrl, NEARBY } from '../model';
import { goBack } from '../components';
import { Badge, Card, Gap, Header, IconButton, Row, Screen, T } from '../ui';
import { space } from '../theme';

/** Searches in the maps app for things near a place. The searches need internet; nothing is sent from this app. */
export default function Nearby() {
  const { place = '' } = useLocalSearchParams<{ place?: string }>();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Near this place" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <T v="small">{place}</T>
      <Gap />
      <Card pad={false} style={{ paddingHorizontal: space.lg }}>
        {NEARBY.map((n, i) => (
          <Row key={n.query} last={i === NEARBY.length - 1} left={<Badge icon={n.icon} />} title={n.label}
            onPress={() => Linking.openURL(mapUrl(`${n.query} near ${place}`))} />
        ))}
      </Card>
      <Gap />
      <T v="small">Opens your maps app. Needs internet.</T>
    </Screen>
  );
}
