import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useLog, useTheme } from '../../store';
import { backupDue, fmtDate, hero, dayLabel, today, todayView, type TripEvent } from '../../model';
import { EventRow } from '../../components';
import { LATEST } from '../../whatsNew';
import { useUpdate } from '../../pwa';
import { Banner, Button, Card, Gap, Header, Screen, T } from '../../ui';
import { space } from '../../theme';

function Section({ title, events, empty }: { title: string; events: TripEvent[]; empty: string }) {
  return (
    <Card>
      <T v="label">{title}</T>
      {events.length ? events.map((e, i) => <EventRow key={`${e.src}${e.id}${i}`} e={e} last={i === events.length - 1} />) : <T v="small" style={{ paddingTop: space.sm }}>{empty}</T>}
    </Card>
  );
}

export default function Today() {
  const { log, update } = useLog();
  const { c } = useTheme();
  // The date can change while the app stays open overnight: re-read it when the app comes back to the front.
  const [day, setDay] = useState(today());
  useEffect(() => {
    const h = () => { if (!document.hidden) setDay(today()); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);
  const upd = useUpdate();
  const t = log.trip;
  const h = hero(t, day);
  const v = todayView(log, day);
  const unseen = log.settings.seenRelease !== LATEST.date;
  return (
    <Screen>
      <Header title={t.name} right={<T v="label" color={t.final ? c.accent : c.warnText}>{t.final ? 'Final' : 'Draft'}</T>} />
      {upd.ready ? <><Banner text="A new version of Trip Keeper is ready." action="Reload" onPress={upd.reload} /><Gap /></> : null}
      {backupDue(log) ? <><Banner text="It has been a week. Save a backup so a lost phone doesn’t lose your trip." action="Back up" onPress={() => router.push('/backup')} /><Gap /></> : null}
      <Card style={{ backgroundColor: c.brand, borderWidth: 0 }}>
        <T v="big" color={c.onAccent}>{h.title}</T>
        <T color={c.onAccent} style={{ opacity: 0.85 }}>{h.sub}</T>
      </Card>
      <Gap />
      <Section title={`Today · ${fmtDate(day)}`} events={v.today} empty="Nothing planned today." />
      <Gap />
      <Section title={`Tomorrow · ${fmtDate(v.tomorrowDay)} ${dayLabel(t, v.tomorrowDay)}`.trim()} events={v.tomorrow} empty="Nothing planned tomorrow." />
      {v.upcomingDay ? (
        <>
          <Gap />
          <Section title={`Next up · ${fmtDate(v.upcomingDay)} ${dayLabel(t, v.upcomingDay)}`.trim()} events={v.upcoming} empty="" />
        </>
      ) : null}
      {unseen ? (
        <View style={{ marginTop: space.lg }}>
          <Card>
            <T v="label">New</T>
            <T style={{ fontWeight: '600' }}>{LATEST.title}</T>
            <Gap h={space.md} />
            <Button title="See what’s new" kind="secondary" onPress={() => { update((l) => ({ ...l, settings: { ...l.settings, seenRelease: LATEST.date } })); router.push('/whats-new'); }} />
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
