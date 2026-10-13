import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  addDays, backupDue, byDay, delBooking, diffDays, events, expenseDays, hero, isRealDay, money, newLog, putBooking, putExpense, putItem, putMoney,
  putTrip, spend, summary, groupBookings, nights, todayView, addAttachment, validTripDates, type Log,
} from '../src/model.ts';
import { buildIcs, fold, planHtml, planText } from '../src/ics.ts';
import { classify, diffBooking, parsePaste } from '../src/parse.ts';
import { parseDocument } from '../src/flights.ts';
import { csvCell, parseBackup, pushSnapshot, serialize, toBackupJSON, toCSV } from '../src/backup.ts';
import { decryptEnvelope, deriveKey, encryptWithKey, isEnvelope, newSalt } from '../src/crypto.ts';
import { checkPin, makePin } from '../src/pin.ts';
import { LATEST, RELEASES } from '../src/whatsNew.ts';

const NOW = new Date('2026-10-20T10:00:00Z');
const sample = (): Log => {
  let l = putTrip(newLog(0), { name: 'Spain', start: '2026-10-23', end: '2026-11-05', country: 'Spain' });
  l = putItem(l, { id: 'i1', title: 'Sagrada Família', date: '2026-10-25', time: '10:00', place: 'Sagrada Família, Barcelona', notes: '' });
  l = putBooking(l, { id: 'b1', type: 'hotel', title: 'Hotel Arts', ref: 'HAB48213', start: '2026-10-24T15:00', end: '2026-10-27T11:00', place: 'Carrer de la Marina 19', notes: '' });
  l = putBooking(l, { id: 'b2', type: 'flight', title: 'BOM to MAD', ref: 'XK92LM', start: '2026-10-23T02:40', end: '2026-10-23T07:55', place: 'Madrid Barajas Airport', notes: '' });
  l = putExpense(l, { id: 'x1', date: '2026-10-24', amount: 45.5, currency: 'EUR', cat: 'food', desc: 'Lunch' }, 95);
  l = putExpense(l, { id: 'x2', date: '2026-10-24', amount: 500, currency: 'INR', cat: 'transport', desc: 'Cab' });
  return l;
};

test('the itinerary merges your stops and dated bookings; stays are two events', () => {
  const ev = events(sample());
  assert.deepEqual(ev.map((e) => [e.date, e.time, e.title]), [
    ['2026-10-23', '02:40', 'BOM to MAD'],
    ['2026-10-24', '15:00', 'Check-in: Hotel Arts'],
    ['2026-10-25', '10:00', 'Sagrada Família'],
    ['2026-10-27', '11:00', 'Check-out: Hotel Arts'],
  ]);
  assert.equal(ev[0].sub, 'Madrid Barajas Airport · Ref XK92LM · until 07:55');
  assert.deepEqual(byDay(ev).map((d) => d.day), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-27']);
});

test('days: real dates only, whole-day differences across daylight saving', () => {
  assert.equal(isRealDay('2026-02-29'), false);
  assert.equal(isRealDay('2028-02-29'), true);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(validTripDates('2026-10-23', '2026-10-22'), false);
  assert.equal(validTripDates('', '2026-10-22'), true);
});

test('Today: countdown, day of the trip, and what comes next', () => {
  const t = sample().trip;
  assert.deepEqual(hero(t, '2026-10-20'), { title: '3 days to go', sub: hero(t, '2026-10-20').sub });
  assert.equal(hero(t, '2026-10-23').title, 'Day 1 of 14');
  assert.equal(hero(t, '2026-11-06').title, 'Trip complete');
  assert.equal(hero({ ...t, start: '' }, '2026-10-20').title, 'Welcome');
  const v = todayView(sample(), '2026-10-22');
  assert.equal(v.today.length, 0);
  assert.equal(v.tomorrow.length, 1);
  assert.equal(todayView(sample(), '2026-10-20').upcomingDay, '2026-10-23');
});

test('expenses: totals use the saved rate, missing rates are flagged and left out', () => {
  const l = sample();
  const s = spend(l, '2026-10-26');
  assert.equal(s.total, 4822.5);
  assert.equal(money(s.total, 'INR'), '₹4,822.50');
  assert.deepEqual(s.byCat.map(([c]) => c), ['food', 'transport']);
  assert.deepEqual(s.missing, []);
  const more = putExpense(l, { id: 'x3', date: '2026-10-25', amount: 10, currency: 'USD', cat: 'shop', desc: '' });
  assert.deepEqual(spend(more, '2026-10-26').missing, ['USD']);
  assert.equal(spend(more, '2026-10-26').total, 4822.5);
  assert.equal(expenseDays(more)[0].day, '2026-10-25');
  // per day: 4 days of the trip so far (23rd to 26th)
  assert.equal(spend(l, '2026-10-26').perDay, 4822.5 / 4);
  assert.equal(spend(putTrip(l, { budget: 10000 }), '2026-10-26').left, 10000 - 4822.5);
});

test('changing the home currency clears the saved rates', () => {
  const l = putMoney(sample(), 'EUR', 500, { INR: 0.01 });
  assert.equal(l.trip.home, 'EUR');
  assert.deepEqual(l.trip.rates, {});
  assert.equal(putMoney(sample(), 'INR', 500, { EUR: 90 }).trip.rates.EUR, 90);
});

test('deleting a booking takes its files with it', () => {
  let l = addAttachment(sample(), { id: 'f1', bookingId: 'b1', name: 'ticket.pdf', type: 'application/pdf', size: 10 });
  assert.equal(l.attachments.length, 1);
  l = delBooking(l, 'b1');
  assert.equal(l.attachments.length, 0);
  assert.equal(l.bookings.length, 1);
});

test('paste import reads the reference, start and end', () => {
  const p = parsePaste('Subject: Hotel Arts confirmation\nBooking number: HAB48213\nCheck-in: 24 Oct 2026 3:00 PM\nCheck-out: 27 Oct 2026 11:00\nAddress: Carrer de la Marina 19, Barcelona');
  assert.equal(p.type, 'hotel');
  assert.equal(p.ref, 'HAB48213');
  assert.equal(p.start, '2026-10-24T15:00');
  assert.equal(p.end, '2026-10-27T11:00');
  assert.equal(p.place, 'Carrer de la Marina 19, Barcelona');
  assert.equal(p.title, 'Hotel Arts confirmation');
  assert.equal(parsePaste('Your flight\nPNR: ZZ99QQ\nDeparts 5 Nov 2026 at 6:10 PM').type, 'flight');
});

test('a ticket PDF lays the time under the date: still found, and a missing time is flagged', () => {
  const ticket = ['AIR INDIA', 'Booking reference: XK92LM', 'Departure (BOM)', 'Fri, 23 Oct 2026', '02:40',
    'Arrival (MAD)', 'Fri, 23 Oct 2026', '07:55 AM', 'Flight AI 123'].join('\n');
  const p = parsePaste(ticket);
  assert.equal(p.type, 'flight');
  assert.equal(p.ref, 'XK92LM');
  assert.equal(p.start, '2026-10-23T02:40');
  assert.equal(p.end, '2026-10-23T07:55');
  assert.equal(p.guessed, undefined);
  const noTime = parsePaste(['Booking reference: ABC123', 'Check-in 24 Oct 2026', 'Check-out 27 Oct 2026', '', '', '', 'Thanks'].join('\n'));
  assert.deepEqual(noTime.guessed, ['start', 'end']);
  assert.equal(noTime.start, '2026-10-24T12:00');
});

test('reading a file proposes only what is new, and keeps a title or type the person chose', () => {
  const p = parsePaste(['Subject: Hotel Arts confirmation', 'Booking number: HAB48213', 'Check-in: 24 Oct 2026 3:00 PM',
    'Check-out: 27 Oct 2026 11:00', 'Address: Carrer de la Marina 19'].join('\n'));
  const blank = { type: 'flight' as const, title: '', ref: '', start: '', end: '', place: '' };
  assert.deepEqual(diffBooking(blank, p, true).map((c) => c.field), ['type', 'title', 'ref', 'start', 'end', 'place']);
  const saved = { type: 'hotel' as const, title: 'Our hotel', ref: 'HAB48213', start: '2026-10-24T14:00', end: '2026-10-27T11:00', place: 'Carrer de la Marina 19' };
  const ch = diffBooking(saved, p, false);
  assert.deepEqual(ch.map((c) => [c.field, c.from, c.to]), [['start', '2026-10-24T14:00', '2026-10-24T15:00']], 'only the changed time; title and type untouched');
  assert.deepEqual(diffBooking({ ...saved, start: '2026-10-24T15:00' }, p, false), []);
});

test('the kind of booking is told apart from what the document says', () => {
  const doc = (...lines: string[]) => lines.join('\n');
  assert.equal(classify(doc('IndiGo e-ticket', 'PNR: QW84ZX', 'Departure (BOM)', 'Arrival (MAD)', 'Gate 14', 'Seat 12A')), 'flight');
  assert.equal(classify(doc('Hotel Arts Barcelona', 'Check-in: 24 Oct 2026', 'Check-out: 27 Oct 2026', '3 nights, 2 guests')), 'hotel');
  assert.equal(classify(doc('Your reservation is confirmed', 'Hosted by Maria', 'Airbnb', 'Entire apartment', 'Check-in 24 Oct')), 'airbnb');
  assert.equal(classify(doc('Hertz car rental', 'Pick-up: Madrid Airport', 'Drop-off: Barcelona', 'Fuel policy: full to full')), 'car');
  assert.equal(classify(doc('Renfe train ticket', 'Madrid Atocha to Barcelona Sants', 'Platform 7', 'Coach 4')), 'train');
  assert.equal(classify(doc('Sagrada Familia guided tour', 'Admission: 2 adults', 'Voucher code ABC123')), 'activity');
  assert.equal(classify(doc('Travel insurance certificate', 'Policy number: TG-8841', 'Insured: A Shah', 'Coverage: medical')), 'insurance');
  assert.equal(classify(doc('Electronic visa', 'Passport number', 'Entry permit valid 90 days')), 'insurance');
  assert.equal(classify('Thanks for your order. See you soon.'), 'other');
  // a flight email that also mentions a hotel offer is still a flight
  assert.equal(classify(doc('PNR: ZZ99QQ', 'Flight AI 123', 'Boarding pass', 'Add a hotel to your trip')), 'flight');
});

test('the Bookings tab sorts into sections, with nights for a stay', () => {
  let l = sample();
  l = putBooking(l, { id: 'b3', type: 'airbnb', title: 'Gràcia flat', ref: '', start: '2026-10-27T15:00', end: '2026-10-30T10:00', place: '', notes: '' });
  l = putBooking(l, { id: 'b4', type: 'insurance', title: 'Travel cover', ref: 'TG-8841', start: '', end: '', place: '', notes: '' });
  const g = groupBookings(l);
  assert.deepEqual(g.map((x) => [x.id, x.bookings.map((b) => b.id)]), [['flights', ['b2']], ['stays', ['b1', 'b3']], ['insurance', ['b4']]]);
  assert.equal(nights(l.bookings.find((b) => b.id === 'b1')!), 3);
  assert.equal(nights(l.bookings.find((b) => b.id === 'b2')!), null, 'a flight has no nights');
  assert.deepEqual(groupBookings(newLog(0)), []);
});

test('flight times: a table of two dates over two times, boarding ignored, a booking date skipped, overnight arrival', () => {
  const doc = (...lines: string[]) => lines.join('\n');
  // dates on one line, times on the next: the arrival must not reuse the departure time
  const table = parsePaste(doc('IndiGo e-ticket', 'PNR: QW84ZX', 'Departure  Arrival', 'Sat, 07 Nov 2026  Sat, 07 Nov 2026', '06:15  08:20', 'Mumbai (BOM)  Bengaluru (BLR)'));
  assert.equal(table.start, '2026-11-07T06:15');
  assert.equal(table.end, '2026-11-07T08:20');
  assert.equal(table.guessed, undefined);
  // boarding and gate times come before the departure and are not it
  const boarding = parsePaste(doc('PNR: ZZ99QQ', 'Flight 6E 521', 'Date: 07 Nov 2026', 'Boarding 05:45  Gate closes 06:00', 'Departure 06:15', 'Arrival 08:20'));
  assert.equal(boarding.start, '2026-11-07T06:15');
  assert.equal(boarding.end, '2026-11-07T08:20');
  // the day the ticket was booked is not the day of travel
  const booked = parsePaste(doc('PNR: ZZ99QQ', 'Booked on 01 Oct 2026', 'Departure: 07 Nov 2026 06:15', 'Arrival: 07 Nov 2026 08:20'));
  assert.equal(booked.start, '2026-11-07T06:15');
  // one date over two times; the arrival is earlier on the clock, so it is the next day
  const night = parsePaste(doc('PNR: ZZ99QQ', 'Flight AI 131', 'Date: 07 Nov 2026', 'Dep 23:30 Mumbai (BOM)', 'Arr 01:45 London (LHR)'));
  assert.equal(night.start, '2026-11-07T23:30');
  assert.equal(night.end, '2026-11-08T01:45');
  // 12-hour times and a date written 07NOV26
  const ampm = parsePaste(doc('PNR: ZZ99QQ', 'Departs 07NOV26 6:15 PM', 'Arrives 07NOV26 8:20 PM'));
  assert.equal(ampm.start, '2026-11-07T18:15');
  assert.equal(ampm.end, '2026-11-07T20:20');
  assert.equal(parsePaste(doc('PNR: ZZ99QQ', 'Flight 6E 521', 'Mumbai (BOM) to Bengaluru (BLR)')).title, '6E 521 BOM → BLR');
});

test('activity times: a range, "10 AM", a duration, and doors-open is not the start', () => {
  const doc = (...lines: string[]) => lines.join('\n');
  const range = parsePaste(doc('Sagrada Familia guided tour', 'Booking reference: ACT12345', 'Date: 25 Oct 2026', 'Time: 10:00 - 12:30', 'Doors open 09:30'));
  assert.equal(range.type, 'activity');
  assert.equal(range.start, '2026-10-25T10:00');
  assert.equal(range.end, '2026-10-25T12:30');
  const doors = parsePaste(doc('Museum entry ticket', 'Sat 7 Nov 2026', 'Doors open 09:00', 'Entry slot 10:30'));
  assert.equal(doors.start, '2026-11-07T10:30');
  const noMinutes = parsePaste(doc('Museum entry ticket', 'Sat 7 Nov 2026', 'Entry at 10 AM'));
  assert.equal(noMinutes.start, '2026-11-07T10:00');
  assert.equal(noMinutes.guessed, undefined);
  const dur = parsePaste(doc('Cooking class voucher', '25 Oct 2026 14:00', 'Duration: 2 hours'));
  assert.equal(dur.start, '2026-10-25T14:00');
  assert.equal(dur.end, '2026-10-25T16:00');
  assert.equal(parsePaste(doc('City tour', 'from 9 AM to 12 PM', '25 Oct 2026')).start, '2026-10-25T09:00');
});

test('a ticket with several flights becomes one booking per flight, with the details a traveller needs', () => {
  const doc = (...lines: string[]) => lines.join('\n');
  const ticket = doc('IndiGo', 'Booking Reference (PNR): QW84ZX', 'Booked on: 01 Oct 2026', 'Passenger: MR RAHUL SHARMA',
    'Flight 6E 521', 'Mumbai (BOM) Terminal 2 → Delhi (DEL) Terminal 3', 'Departure: Sat, 07 Nov 2026 06:15', 'Arrival: Sat, 07 Nov 2026 08:35', 'Seat: 12A',
    'Flight 6E 2104', 'Delhi (DEL) → Leh (IXL)', 'Departure: Sat, 07 Nov 2026 11:05', 'Arrival: Sat, 07 Nov 2026 12:35', 'Seat: 14C', 'Check-in baggage: 15 kg');
  const found = parseDocument(ticket);
  assert.equal(found.length, 2);
  const [a, b] = found;
  assert.equal(a.title, '6E 521 BOM → DEL');
  assert.equal(a.ref, 'QW84ZX');
  assert.equal(a.start, '2026-11-07T06:15');
  assert.equal(a.end, '2026-11-07T08:35');
  assert.equal(a.place, 'Mumbai (BOM) Terminal 2');
  assert.ok(a.notes?.includes('Airline: IndiGo') && a.notes.includes('Flight: 6E 521') && a.notes.includes('Seat: 12A'));
  assert.ok(a.notes?.includes('To: Delhi (DEL), Terminal 3'));
  assert.ok(a.notes?.includes('Passenger: MR RAHUL SHARMA'));
  assert.equal(b.title, '6E 2104 DEL → IXL');
  assert.equal(b.start, '2026-11-07T11:05');
  assert.equal(b.end, '2026-11-07T12:35');
  assert.ok(b.notes?.includes('Seat: 14C'));
  assert.ok(b.notes?.includes('To: Leh (IXL)'));
});

test('flight table rows: one per line, with the next-day arrival marked +1', () => {
  const doc = (...lines: string[]) => lines.join('\n');
  const found = parseDocument(doc('AIR INDIA E-TICKET', 'PNR: ZK7LM2', 'Sector | Flight | Date | Dep | Arr',
    'BOM - LHR | AI 131 | 07 Nov 2026 | 02:40 | 07:25', 'LHR - BOM | AI 130 | 21 Nov 2026 | 21:35 | 10:15 +1'));
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => [f.title, f.start, f.end]), [
    ['AI 131 BOM → LHR', '2026-11-07T02:40', '2026-11-07T07:25'],
    ['AI 130 LHR → BOM', '2026-11-21T21:35', '2026-11-22T10:15'],
  ]);
  assert.ok(found.every((f) => f.ref === 'ZK7LM2' && f.notes?.includes('Airline: Air India')));
  assert.ok(found[0].notes?.includes('From: Mumbai (BOM)') && found[0].notes.includes('To: London (Heathrow) (LHR)'));
});

test('a single flight still comes back as one booking, and years in the text are not flight numbers', () => {
  const found = parseDocument(['Qatar Airways e-ticket', 'Booking reference: 7HG2KD', 'QR 571 Mumbai (BOM) to Doha (DOH)', 'Departure 07 Nov 2026 03:05', 'Arrival 07 Nov 2026 04:55', 'Valid until 2026', 'Class: Economy'].join('\n'));
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'QR 571 BOM → DOH');
  assert.equal(found[0].start, '2026-11-07T03:05');
  assert.equal(found[0].end, '2026-11-07T04:55');
  assert.ok(found[0].notes?.includes('Class: Economy'));
  // not a flight at all: unchanged
  assert.equal(parseDocument('Hotel Arts\nCheck-in: 24 Oct 2026 3:00 PM\nCheck-out: 27 Oct 2026 11:00').length, 1);
});

test('notes from a file are added below what is there, never over it', () => {
  const p = { type: 'flight' as const, title: 'AI 131 BOM → LHR', notes: 'Airline: Air India\nFlight: AI 131' };
  const empty = { type: 'flight' as const, title: '', ref: '', start: '', end: '', place: '', notes: '' };
  assert.equal(diffBooking(empty, p, true).find((c) => c.field === 'notes')?.to, 'Airline: Air India\nFlight: AI 131');
  const mine = diffBooking({ ...empty, notes: 'Aisle seat please' }, p, false).find((c) => c.field === 'notes')?.to;
  assert.equal(mine, 'Aisle seat please\n\nAirline: Air India\nFlight: AI 131');
  assert.equal(diffBooking({ ...empty, notes: 'Airline: Air India\nFlight: AI 131' }, p, false).find((c) => c.field === 'notes'), undefined, 'already there');
});

test('calendar file: CRLF, flight reminders, tomorrow previews, escaping and folding', () => {
  const ics = buildIcs(sample(), true, '2026-10-20', NOW);
  assert.ok(ics.includes('\r\n') && !/[^\r]\n/.test(ics));
  assert.ok(ics.includes('TRIGGER:-PT1440M') && ics.includes('TRIGGER:-PT180M'));
  assert.ok((ics.match(/UID:tk-preview-/g) ?? []).length >= 3);
  assert.ok(ics.includes('LOCATION:Sagrada Família\\, Barcelona'));
  assert.ok(!buildIcs(sample(), false, '2026-10-20', NOW).includes('tk-preview-'));
  const odd = putItem(newLog(0), { id: 'z', title: 'Wine; cheese, bread', date: '2026-10-25', time: '', place: '', notes: '' });
  const out = buildIcs(odd, false, '2026-10-20', NOW);
  assert.ok(out.includes('Wine\\; cheese\\, bread'));
  assert.ok(out.includes('DTSTART;VALUE=DATE:20261025'));
  for (const line of fold('SUMMARY:' + 'é'.repeat(100)).split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(fold('SUMMARY:' + 'é'.repeat(100)).replace(/\r\n /g, ''), 'SUMMARY:' + 'é'.repeat(100));
});

test('share text and print page leave booking references out', () => {
  const l = sample();
  assert.ok(planText(l).includes('Hotel Arts'));
  assert.ok(!planText(l).includes('HAB48213') && !planText(l).includes('XK92LM'));
  assert.ok(!planHtml(l).includes('XK92LM'));
  assert.ok(planHtml(putItem(l, { id: 'q', title: '<script>', date: '2026-10-25', time: '', place: '', notes: '' })).includes('&lt;script&gt;'));
});

test('backups: round trip, files kept, bad input refused', () => {
  let l = addAttachment(sample(), { id: 'f1', bookingId: 'b2', name: 'pass.pdf', type: 'application/pdf', size: 0 });
  const files = { f1: 'data:application/pdf;base64,JVBERg==' };
  const back = parseBackup(toBackupJSON(l, files));
  assert.deepEqual(back.log.bookings, l.bookings);
  assert.deepEqual(back.log.expenses, l.expenses);
  assert.equal(back.log.attachments[0].size, 4);
  assert.deepEqual(back.files, files);
  assert.deepEqual(parseBackup(serialize(l), true).log.attachments.map((a) => a.id), ['f1'], 'own stored copy keeps its file list');
  assert.equal(parseBackup(serialize(l)).log.attachments.length, 0, 'a backup without the bytes drops the file, never fails');
  assert.throws(() => parseBackup('nope'), /not valid JSON/);
  assert.throws(() => parseBackup('{"app":"other"}'), /not a Trip Keeper/);
  assert.throws(() => parseBackup(JSON.stringify({ ...JSON.parse(serialize(l)), schemaVersion: 99 })), /newer version/);
  const bad = JSON.parse(serialize(l));
  bad.expenses[0].currency = 'euro';
  assert.throws(() => parseBackup(JSON.stringify(bad)), /expense #1/);
  const dup = JSON.parse(serialize(l));
  dup.bookings.push(dup.bookings[0]);
  assert.throws(() => parseBackup(JSON.stringify(dup)), /booking #3/);
  l = putTrip(l, { name: 'x' });
  assert.equal(pushSnapshot([1, 2, 3], 0, 3).length, 3);
});

test('a backup from the first Trip Keeper still restores', () => {
  const old = {
    v: 1,
    trip: { k: 'trip', name: 'Spain', start: '2026-10-23', end: '2026-11-05', final: true, country: 'Spain', home: 'INR', budget: 100000, rates: { EUR: 95 } },
    items: [{ id: 'a', title: 'Walk', date: '2026-10-25', time: '', place: '', notes: '' }],
    bookings: [{ id: 'b', type: 'flight', title: 'BOM to MAD', ref: 'XK92LM', start: '2026-10-23T02:40', end: '', place: '', notes: '' }],
    expenses: [{ id: 'e', date: '2026-10-24', amount: 45.5, currency: 'EUR', cat: 'food', desc: 'Lunch' }],
    files: [{ id: 'f', bookingId: 'b', name: 't.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERg==' }],
  };
  const { log, files } = parseBackup(JSON.stringify(old));
  assert.equal(log.trip.final, true);
  assert.equal(log.trip.rates.EUR, 95);
  assert.equal(log.bookings.length, 1);
  assert.equal(log.attachments[0].name, 't.pdf');
  assert.ok(files.f);
});

test('expense CSV: converted amounts, and cells that start like formulas are neutralised', () => {
  const l = putExpense(sample(), { id: 'x9', date: '2026-10-26', amount: 5, currency: 'EUR', cat: 'other', desc: '=HYPERLINK("x")' });
  const rows = toCSV(l).split('\n');
  assert.equal(rows[0], 'Date,Category,Description,Amount,Currency,Rate to INR,Amount in INR');
  assert.ok(rows.some((r) => r === '2026-10-24,Food & drink,Lunch,45.5,EUR,95,4322.50'));
  assert.ok(rows.some((r) => r.includes(`"'=HYPERLINK(""x"")"`)));
  assert.equal(csvCell('a,b'), '"a,b"');
});

test('locked backups: round trip, wrong passphrase refused', async () => {
  const salt = newSalt();
  const file = await encryptWithKey(await deriveKey('correct horse battery', salt, 100_000), salt, 100_000, toBackupJSON(sample(), {}));
  assert.ok(isEnvelope(file) && !isEnvelope(toBackupJSON(sample(), {})));
  assert.equal(parseBackup(await decryptEnvelope(file, 'correct horse battery')).log.trip.name, 'Spain');
  await assert.rejects(decryptEnvelope(file, 'wrong passphrase!'), /does not open/);
});

test('PIN: a stored record checks only the right PIN', async () => {
  const rec = await makePin('4821');
  assert.equal(await checkPin('4821', rec), true);
  assert.equal(await checkPin('4822', rec), false);
  // the first version's record: hex SHA-256 of salt + pin
  const { createHash } = await import('node:crypto');
  const old = { salt: 'abc123', hash: createHash('sha256').update('abc1231234').digest('hex') };
  assert.equal(await checkPin('1234', old), true);
});

test('backup reminder: a week after the last one, and only when there is something to lose', () => {
  const l = sample();
  assert.equal(backupDue(newLog(0), 99 * 86_400_000), false);
  assert.equal(backupDue(l, 3 * 86_400_000), false);
  assert.equal(backupDue(l, 8 * 86_400_000), true);
  assert.equal(backupDue({ ...l, settings: { ...l.settings, lastBackupAt: 7 * 86_400_000 } }, 8 * 86_400_000), false);
  assert.equal(summary(l), '2 bookings, 1 activity, 2 expenses');
});

test('what’s new: newest first, one card per date, in the right shape', () => {
  assert.equal(LATEST, RELEASES[0]);
  const dates = RELEASES.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(new Set(dates).size, dates.length);
});

// The release build (npm run check) must have produced the app and its offline worker.
test('the production build has the shell and service worker', { skip: !process.env.REQUIRE_DIST }, () => {
  for (const f of ['dist/index.html', 'dist/sw.js', 'dist/manifest.webmanifest']) assert.ok(existsSync(f), f);
});
