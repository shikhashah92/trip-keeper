import { View } from 'react-native';
import { router } from 'expo-router';
import { useLog, useTheme } from '../../store';
import { dayLabel, EXPENSE_CAT, expenseDays, fmtDate, money, spend, toHome, today } from '../../model';
import { useBackup } from '../../backupActions';
import { Badge, Banner, Button, Card, Gap, Header, IconButton, Row, Screen, T } from '../../ui';
import { radius, space } from '../../theme';

export default function Expenses() {
  const { log } = useLog();
  const { c } = useTheme();
  const { exportCSV } = useBackup();
  const t = log.trip;
  const H = t.home;
  const s = spend(log, today());
  const days = expenseDays(log);
  const hasForeign = s.paid.some(([cur]) => cur !== H);
  const pct = s.budget ? Math.min(100, Math.round((s.total / s.budget) * 100)) : 0;
  return (
    <Screen>
      <Header title="Expenses" right={<IconButton icon="add-circle" size={32} color={c.accent} label="Add an expense" onPress={() => router.push('/expense')} />} />
      <Card style={{ backgroundColor: c.brand, borderWidth: 0 }}>
        <T color={c.onAccent} style={{ opacity: 0.85 }}>Total spent</T>
        <T v="big" color={c.onAccent}>{money(s.total, H)}</T>
        {s.budget ? (
          <>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: `${c.onAccent}40`, marginVertical: space.sm, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${pct}%`, backgroundColor: c.onAccent }} />
            </View>
            <T color={c.onAccent} style={{ opacity: 0.85 }}>{s.left! < 0 ? `Over budget by ${money(-s.left!, H)}` : `${money(s.left!, H)} left of ${money(s.budget, H)}`}</T>
          </>
        ) : null}
        {s.perDay !== null ? <T color={c.onAccent} style={{ opacity: 0.85 }}>About {money(s.perDay, H)} per day so far</T> : null}
      </Card>
      {s.missing.length ? <><Gap /><Banner text={`No rate for ${s.missing.join(', ')}. Set it in Budget & rates so the totals include these.`} action="Set" onPress={() => router.push('/expense-settings')} /></> : null}
      {s.byCat.length ? (
        <>
          <Gap />
          <Card>
            <T v="label">By category</T>
            {s.byCat.map(([cat, v]) => (
              <View key={cat} style={{ paddingTop: space.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T>{EXPENSE_CAT(cat).label}</T>
                  <T style={{ fontWeight: '700' }}>{money(v, H)}</T>
                </View>
                <View style={{ height: 5, borderRadius: radius.pill, backgroundColor: c.accentSoft, marginTop: 5 }}>
                  <View style={{ height: 5, borderRadius: radius.pill, backgroundColor: c.brand, width: `${s.total ? Math.round((v / s.total) * 100) : 0}%` }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      {hasForeign ? (
        <>
          <Gap />
          <Card>
            <T v="label">Paid in</T>
            {s.paid.map(([cur, v]) => (
              <View key={cur} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.sm }}>
                <T>{cur}</T><T style={{ fontWeight: '700' }}>{money(v, cur)}</T>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      <Gap />
      {!days.length ? <Card><T v="small">No expenses yet. Tap + to log one.</T></Card> : days.map((d) => (
        <View key={d.day} style={{ marginBottom: space.lg }}>
          <T style={{ fontWeight: '700', paddingBottom: space.xs, paddingLeft: 2 }}>{fmtDate(d.day)} <T v="small">{dayLabel(t, d.day)} · {money(d.sum, H)}</T></T>
          <Card pad={false} style={{ paddingHorizontal: space.lg }}>
            {d.list.map((e, i) => {
              const h = toHome(t, e);
              const cat = EXPENSE_CAT(e.cat);
              return (
                <Row key={e.id} last={i === d.list.length - 1} left={<Badge icon={cat.icon} />} title={e.desc || cat.label} subtitle={cat.label}
                  onPress={() => router.push({ pathname: '/expense', params: { id: e.id } })}
                  right={<View style={{ alignItems: 'flex-end' }}>
                    <T style={{ fontWeight: '700' }}>{money(e.amount, e.currency)}</T>
                    {e.currency !== H && h !== null ? <T v="small">{money(h, H)}</T> : null}
                  </View>} />
              );
            })}
          </Card>
        </View>
      ))}
      <Button title="Budget & rates" kind="secondary" icon="options-outline" onPress={() => router.push('/expense-settings')} />
      {log.expenses.length ? <><Gap h={space.sm} /><Button title="Export CSV" kind="secondary" icon="download-outline" onPress={exportCSV} /></> : null}
    </Screen>
  );
}
