import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLog } from '../store';
import { delExpense, EXPENSE_CATS, isCurrency, newId, putExpense, rateOf, today, type ExpenseCat } from '../model';
import { confirm, notify } from '../io';
import { goBack } from '../components';
import { DateField } from '../DateField';
import { Button, Chip, Field, Gap, Header, IconButton, Screen, selectAll, T } from '../ui';
import { space } from '../theme';

export default function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { log, update } = useLog();
  const t = log.trip;
  const old = log.expenses.find((e) => e.id === id);
  const [amount, setAmount] = useState(old ? String(old.amount) : '');
  const [currency, setCurrency] = useState(old?.currency ?? t.lastCur ?? t.home);
  const [rate, setRate] = useState(() => (old ? String(rateOf(t, old.currency) || '') : ''));
  const [desc, setDesc] = useState(old?.desc ?? '');
  const [cat, setCat] = useState<ExpenseCat>(old?.cat ?? 'food');
  const [date, setDate] = useState(old?.date ?? today());
  const cur = currency.trim().toUpperCase();
  const foreign = isCurrency(cur) && cur !== t.home;
  // When the currency changes, show the rate already saved for it.
  const pickCurrency = (v: string) => {
    setCurrency(v);
    const c = v.trim().toUpperCase();
    setRate(isCurrency(c) && c !== t.home ? String(rateOf(t, c) || '') : '');
  };

  function save() {
    const amt = parseFloat(amount);
    if (!(amt > 0)) return notify('Enter an amount');
    if (!isCurrency(cur)) return notify('Use a 3-letter currency code', 'For example EUR, USD or INR.');
    if (!date) return notify('Pick a date');
    const r = foreign ? parseFloat(rate) : undefined;
    update((l) => putExpense(l, { id: old?.id ?? newId('x'), date, amount: amt, currency: cur, cat, desc: desc.trim() }, r));
    goBack();
  }
  async function remove() {
    if (!(await confirm('Delete this expense?', 'You can go back to an earlier version in Undo history.', 'Delete', true))) return;
    update((l) => delExpense(l, old!.id));
    goBack();
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={old ? 'Edit expense' : 'Add expense'} left={<IconButton icon="close" label="Close" onPress={goBack} />} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}><Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" inputMode="decimal" onFocus={selectAll} autoFocus={!old} /></View>
        <View style={{ width: 120 }}><Field label="Currency" value={currency} onChangeText={pickCurrency} maxLength={3} autoCapitalize="characters" autoCorrect={false} onFocus={selectAll} /></View>
      </View>
      {foreign ? (
        <>
          <Gap />
          <Field label={`1 ${cur} = how many ${t.home}? (applies to all ${cur} expenses)`} value={rate} onChangeText={setRate} keyboardType="decimal-pad" inputMode="decimal" onFocus={selectAll} />
        </>
      ) : null}
      <Gap />
      <Field label="What for" value={desc} onChangeText={setDesc} placeholder="e.g. Lunch at the market" />
      <Gap />
      <T v="label">Category</T>
      <Gap h={space.sm} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {EXPENSE_CATS.map((c) => <Chip key={c.id} label={c.label} icon={c.icon} selected={c.id === cat} onPress={() => setCat(c.id)} />)}
      </View>
      <Gap />
      <T v="label">Date</T>
      <DateField value={date} onChange={setDate} label="Date" />
      <Gap h={24} />
      <Button title="Save" onPress={save} />
      {old ? <><Gap h={12} /><Button title="Delete" kind="danger" onPress={remove} /></> : null}
    </Screen>
  );
}
