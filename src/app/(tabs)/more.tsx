import { View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLog, useTheme } from '../../store';
import { backupDue, fmtDate, type Theme } from '../../model';
import { LATEST } from '../../whatsNew';
import { isStandalone } from '../../pwa';
import { Badge, Card, Gap, Header, Row, Screen, Segmented, T } from '../../ui';
import { space } from '../../theme';

const go = (path: string) => () => router.push(path as never);
const Chevron = () => { const { c } = useTheme(); return <Ionicons name="chevron-forward" size={20} color={c.muted} />; };

export default function More() {
  const { log, update, pin } = useLog();
  const t = log.trip;
  const dates = t.start ? `${fmtDate(t.start)} → ${t.end ? fmtDate(t.end) : '?'}` : 'Set your trip dates';
  return (
    <Screen>
      <Header title="More" />
      <Card pad={false} style={{ paddingHorizontal: space.lg }}>
        <Row left={<Badge icon="airplane" />} title={t.name} subtitle={`${dates} · ${t.final ? 'Final' : 'Draft'}`} right={<Chevron />} onPress={go('/trip')} />
        <Row last left={<Badge icon="information-circle" />} title="Country quick facts" subtitle={t.country ?? 'Plugs, voltage, emergency numbers'} right={<Chevron />} onPress={go('/country')} />
      </Card>
      <Gap />
      <Card pad={false} style={{ paddingHorizontal: space.lg }}>
        <Row left={<Badge icon="lock-closed" />} title="App lock" subtitle={pin ? 'A PIN is set' : 'Set a PIN for this phone'} right={<Chevron />} onPress={go('/pin')} />
        <Row left={<Badge icon="save" />} title="Backup and restore" subtitle={backupDue(log) ? 'A backup is due' : log.settings.lastBackupAt ? `Last saved ${new Date(log.settings.lastBackupAt).toLocaleDateString('en-IN')}` : 'Not saved yet'} right={<Chevron />} onPress={go('/backup')} />
        <Row last left={<Badge icon="time" />} title="Undo history" subtitle="Your last 10 versions" right={<Chevron />} onPress={go('/undo')} />
      </Card>
      <Gap />
      <Card>
        <T v="label">Theme</T>
        <Gap h={space.sm} />
        <Segmented<Theme> value={log.settings.theme} onChange={(theme) => update((l) => ({ ...l, settings: { ...l.settings, theme } }))}
          options={[{ id: 'system', label: 'Phone' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
      </Card>
      <Gap />
      <Card pad={false} style={{ paddingHorizontal: space.lg }}>
        <Row left={<Badge icon="sparkles" />} title="What’s new" subtitle={LATEST.title} right={<Chevron />} onPress={go('/whats-new')} last={isStandalone()} />
        {!isStandalone() ? <Row last left={<Badge icon="phone-portrait" />} title="Add to Home Screen" subtitle="Works offline, like an app" right={<Chevron />} onPress={go('/install')} /> : null}
      </Card>
      <Gap />
      <View style={{ paddingHorizontal: space.sm }}>
        <T v="small">Everything stays on this phone. There is no account and no server. Save a backup now and then, because clearing browser data or losing the phone removes it.</T>
      </View>
    </Screen>
  );
}
