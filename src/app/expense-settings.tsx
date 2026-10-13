import { useState } from 'react';
import { View } from 'react-native';
import { useLog } from '../store';
import { isCurrency, putMoney, rateOf } from '../model';
import { notify } from '../io';
import { goBack } from '../components';
import { Button, Field, Gap, Header, IconButton, Screen, selectAll, T } from '../ui';
import { space } from '../theme';

/** Home currency, trip budget, and one exchange rate per foreign currency in use. */
export default function ExpenseSettings() {
  const { log, update } = useLog();
  const t = log.trip;
  const [home, setHome] = useState(t.home);
  const [budget, setBudget] = useState(t.budget ? String(t.budget) : '');
  const used = [...new Set([...log.expenses.map((e) => e.currency), ...Object.keys(t.rates)])].filter((c) => c !== t.home).sort();
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries(used.map((c) => [c, String(rateOf(t, c) || '')])));

  function save() {
    const h = home.trim().toUpperCase();
    if (!isCurrency(h)) return notify('Use a 3-letter currency code', 'For example INR, EUR or USD.');
    const next: Record<string, number> = {};
    if (h === t.home) for (const [c, v] of Object.entries(rates)) { const r = parseFloat(v); if (r > 0) next[c] = r; }
    update((l) => putMoney(l, h, parseFloat(budget) || 0, next));
    goBack();
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Budget & rates" left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ width: 120 }}><Field label="Home currency" value={home} onChangeText={setHome} maxLength={3} autoCapitalize="characters" autoCorrect={false} onFocus={selectAll} /></View>
        <View style={{ flex: 1 }}><Field label={`Trip budget (${t.home})`} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" inputMode="decimal" onFocus={selectAll} /></View>
      </View>
      <Gap />
      {used.length ? (
        <>
          <T v="label">Exchange rates: 1 unit = how many {t.home}?</T>
          <Gap h={space.sm} />
          {used.map((c) => (
            <View key={c} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm }}>
              <T style={{ width: 60, fontWeight: '700' }}>{c}</T>
              <View style={{ flex: 1 }}><Field value={rates[c] ?? ''} onChangeText={(v) => setRates((r) => ({ ...r, [c]: v }))} accessibilityLabel={`Rate for ${c}`} keyboardType="decimal-pad" inputMode="decimal" onFocus={selectAll} /></View>
            </View>
          ))}
        </>
      ) : <T v="small">Rates for other currencies show up here once you log an expense in them.</T>}
      <Gap h={space.sm} />
      <T v="small">Changing the home currency clears the saved rates, since they are relative to it.</T>
      <Gap h={24} />
      <Button title="Save" onPress={save} />
    </Screen>
  );
}
