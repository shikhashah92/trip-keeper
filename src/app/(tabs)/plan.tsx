import { View } from 'react-native';
import { router } from 'expo-router';
import { useLog, useTheme } from '../../store';
import { byDay, dayLabel, events, fmtDate, today } from '../../model';
import { planHtml, planText } from '../../ics';
import { notify, printHtml } from '../../io';
import { EventRow } from '../../components';
import { Banner, Button, Card, Gap, Header, IconButton, Screen, T } from '../../ui';
import { space } from '../../theme';

/** The share sheet, or the clipboard (then the person pastes it into WhatsApp or email). */
async function shareText(title: string, text: string) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    notify('Itinerary copied', 'Paste it into WhatsApp or email.');
  } catch { notify('Itinerary', text); }
}

export default function Plan() {
  const { log } = useLog();
  const { c } = useTheme();
  const ev = events(log);
  const days = byDay(ev);
  const day = today();
  return (
    <Screen>
      <Header title="Itinerary" right={<IconButton icon="add-circle" size={32} color={c.accent} label="Add an activity" onPress={() => router.push('/item')} />} />
      {!ev.length ? (
        <Card><T v="small">No plans yet. Tap + to add an activity. Bookings with a date appear here automatically.</T></Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Calendar" icon="calendar-outline" kind="secondary" style={{ flex: 1, paddingHorizontal: space.sm }} onPress={() => router.push('/calendar')} />
            <Button title="Share" icon="share-outline" kind="secondary" style={{ flex: 1, paddingHorizontal: space.sm }} onPress={() => shareText(log.trip.name, planText(log))} />
            <Button title="PDF" icon="print-outline" kind="secondary" style={{ flex: 1, paddingHorizontal: space.sm }}
              onPress={() => { if (!printHtml(planHtml(log))) notify('Could not open the print page', 'Allow pop-ups for this site, or use Share instead.'); }} />
          </View>
          <Gap />
          {!log.trip.final ? <><Banner text="Draft: mark it final in More when you are done planning." /><Gap /></> : null}
          {days.map((d) => (
            <View key={d.day} style={{ marginBottom: space.lg }}>
              <T style={{ fontWeight: '700', paddingBottom: space.xs, paddingLeft: 2 }}>
                {fmtDate(d.day)} <T v="small">{dayLabel(log.trip, d.day)}{d.day === day ? ' · today' : ''}</T>
              </T>
              <Card pad={false} style={{ paddingHorizontal: space.lg }}>
                {d.events.map((e, i) => <EventRow key={`${e.src}${e.id}${i}`} e={e} last={i === d.events.length - 1} />)}
              </Card>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
