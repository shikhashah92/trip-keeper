import { View } from 'react-native';
import { RELEASES } from '../whatsNew';
import { fmtLong } from '../model';
import { goBack } from '../components';
import { Badge, Card, Gap, Header, IconButton, Screen, T } from '../ui';
import { space } from '../theme';

export default function WhatsNew() {
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="What’s new" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      {RELEASES.map((r) => (
        <View key={r.date} style={{ marginBottom: space.lg }}>
          <T v="title">{r.title}</T>
          <T v="small">{fmtLong(r.date)}</T>
          <Gap h={space.sm} />
          <Card>
            {r.changes.map((ch, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm }}>
                <Badge icon={ch.icon} size={36} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{ch.title}</T>
                  <T v="small">{ch.text}</T>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
