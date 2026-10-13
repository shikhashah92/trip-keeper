// Flights: a ticket often holds several (an outbound with a connection, a return), and carries more than dates and a
// reference. This splits the text of a ticket into one booking per flight and gathers the details a traveller wants
// at the gate: airline, flight number, airports and terminals, passengers, seat, class, baggage and ticket number.
// It runs on the text of a PDF or screenshot, so nothing here is specific to one airline's layout.
import { findRef, parsePaste, type Parsed } from './parse.ts';

/** IATA airline codes seen on tickets from India, the Gulf, Asia, Europe and North America. A flight number only counts if its code is here. */
export const AIRLINES: Record<string, string> = {
  '6E': 'IndiGo', AI: 'Air India', UK: 'Vistara', QP: 'Akasa Air', SG: 'SpiceJet', IX: 'Air India Express', I5: 'AIX Connect', G8: 'Go First', S5: 'Star Air',
  EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad', WY: 'Oman Air', GF: 'Gulf Air', KU: 'Kuwait Airways', SV: 'Saudia', FZ: 'flydubai', G9: 'Air Arabia',
  SQ: 'Singapore Airlines', TR: 'Scoot', MH: 'Malaysia Airlines', AK: 'AirAsia', D7: 'AirAsia X', TG: 'Thai Airways', FD: 'Thai AirAsia', VZ: 'Thai Vietjet',
  CX: 'Cathay Pacific', KA: 'Cathay Dragon', JL: 'Japan Airlines', NH: 'ANA', KE: 'Korean Air', OZ: 'Asiana', CA: 'Air China', MU: 'China Eastern', CZ: 'China Southern',
  GA: 'Garuda Indonesia', PR: 'Philippine Airlines', VN: 'Vietnam Airlines', VJ: 'VietJet', UL: 'SriLankan', BG: 'Biman', RA: 'Nepal Airlines', QF: 'Qantas', NZ: 'Air New Zealand',
  BA: 'British Airways', VS: 'Virgin Atlantic', LH: 'Lufthansa', LX: 'Swiss', OS: 'Austrian', AF: 'Air France', KL: 'KLM', IB: 'Iberia', VY: 'Vueling', UX: 'Air Europa',
  TP: 'TAP Air Portugal', AZ: 'ITA Airways', SN: 'Brussels Airlines', SK: 'SAS', AY: 'Finnair', TK: 'Turkish Airlines', EI: 'Aer Lingus', FR: 'Ryanair', U2: 'easyJet', W6: 'Wizz Air',
  LO: 'LOT', OK: 'Czech Airlines', A3: 'Aegean', SU: 'Aeroflot', ET: 'Ethiopian', MS: 'EgyptAir', KQ: 'Kenya Airways', SA: 'South African',
  AA: 'American Airlines', DL: 'Delta', UA: 'United', AC: 'Air Canada', WN: 'Southwest', B6: 'JetBlue', AS: 'Alaska Airlines', AM: 'Aeromexico', LA: 'LATAM', AV: 'Avianca',
};

/** City names for airport codes, used when a ticket shows only the code. */
export const AIRPORTS: Record<string, string> = {
  BOM: 'Mumbai', DEL: 'Delhi', BLR: 'Bengaluru', MAA: 'Chennai', HYD: 'Hyderabad', CCU: 'Kolkata', GOI: 'Goa', PNQ: 'Pune', AMD: 'Ahmedabad', COK: 'Kochi',
  JAI: 'Jaipur', LKO: 'Lucknow', TRV: 'Thiruvananthapuram', GAU: 'Guwahati', IXC: 'Chandigarh', SXR: 'Srinagar', ATQ: 'Amritsar', IXB: 'Bagdogra', VNS: 'Varanasi',
  PAT: 'Patna', BBI: 'Bhubaneswar', NAG: 'Nagpur', IDR: 'Indore', CJB: 'Coimbatore', IXE: 'Mangaluru', IXM: 'Madurai', VTZ: 'Visakhapatnam', RPR: 'Raipur',
  IXR: 'Ranchi', UDR: 'Udaipur', JDH: 'Jodhpur', DED: 'Dehradun', IXL: 'Leh', IMF: 'Imphal', DIB: 'Dibrugarh', BHO: 'Bhopal', STV: 'Surat', GOX: 'Goa (Mopa)',
  DXB: 'Dubai', DWC: 'Dubai (Al Maktoum)', AUH: 'Abu Dhabi', SHJ: 'Sharjah', DOH: 'Doha', MCT: 'Muscat', BAH: 'Bahrain', KWI: 'Kuwait', RUH: 'Riyadh', JED: 'Jeddah',
  SIN: 'Singapore', KUL: 'Kuala Lumpur', BKK: 'Bangkok', DMK: 'Bangkok (Don Mueang)', HKT: 'Phuket', CNX: 'Chiang Mai', USM: 'Koh Samui', HKG: 'Hong Kong',
  NRT: 'Tokyo (Narita)', HND: 'Tokyo (Haneda)', KIX: 'Osaka', ICN: 'Seoul', PEK: 'Beijing', PVG: 'Shanghai', CAN: 'Guangzhou', CGK: 'Jakarta', DPS: 'Bali', MNL: 'Manila',
  SGN: 'Ho Chi Minh City', HAN: 'Hanoi', CMB: 'Colombo', KTM: 'Kathmandu', DAC: 'Dhaka', MLE: 'Malé', PBH: 'Paro', SYD: 'Sydney', MEL: 'Melbourne', BNE: 'Brisbane',
  PER: 'Perth', AKL: 'Auckland', LHR: 'London (Heathrow)', LGW: 'London (Gatwick)', STN: 'London (Stansted)', MAN: 'Manchester', EDI: 'Edinburgh', DUB: 'Dublin',
  CDG: 'Paris (Charles de Gaulle)', ORY: 'Paris (Orly)', AMS: 'Amsterdam', FRA: 'Frankfurt', MUC: 'Munich', BER: 'Berlin', ZRH: 'Zurich', GVA: 'Geneva', VIE: 'Vienna',
  FCO: 'Rome', MXP: 'Milan', VCE: 'Venice', MAD: 'Madrid', BCN: 'Barcelona', LIS: 'Lisbon', OPO: 'Porto', IST: 'Istanbul', ATH: 'Athens', CPH: 'Copenhagen',
  ARN: 'Stockholm', OSL: 'Oslo', HEL: 'Helsinki', WAW: 'Warsaw', PRG: 'Prague', BUD: 'Budapest', BRU: 'Brussels', KEF: 'Reykjavik', CAI: 'Cairo', NBO: 'Nairobi',
  JNB: 'Johannesburg', CPT: 'Cape Town', JFK: 'New York (JFK)', EWR: 'Newark', LAX: 'Los Angeles', SFO: 'San Francisco', ORD: 'Chicago', IAD: 'Washington (Dulles)',
  ATL: 'Atlanta', DFW: 'Dallas', BOS: 'Boston', SEA: 'Seattle', MIA: 'Miami', IAH: 'Houston', YYZ: 'Toronto', YVR: 'Vancouver', MEX: 'Mexico City', GRU: 'São Paulo',
};
// Names a ticket may use for a city, when it gives no airport code: "Bombay", "New Delhi", "Mumbai".
const CITY_CODE: Record<string, string> = (() => {
  const m: Record<string, string> = { bombay: 'BOM', 'new delhi': 'DEL', bangalore: 'BLR', calcutta: 'CCU', madras: 'MAA', cochin: 'COK', trivandrum: 'TRV', panaji: 'GOI', 'dabolim': 'GOI', 'mopa': 'GOX', baroda: 'BDQ' };
  for (const [c, name] of Object.entries(AIRPORTS)) { const base = name.replace(/\s*\(.*\)\s*$/, '').toLowerCase(); if (!(base in m)) m[base] = c; }
  return m;
})();
const escapeRx = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
const CITY_RX = new RegExp(`\\b(${Object.keys(CITY_CODE).sort((a, b) => b.length - a.length).map(escapeRx).join('|')})\\b(?!\\s+(?:airlines?|airways|air\\b))`, 'gi');

// The time zone of each airport in AIRPORTS, by group. A ticket's times are local to each airport.
const TZ_GROUPS: Record<string, string[]> = {
  'Asia/Kolkata': ['BOM', 'DEL', 'BLR', 'MAA', 'HYD', 'CCU', 'GOI', 'GOX', 'PNQ', 'AMD', 'COK', 'JAI', 'LKO', 'TRV', 'GAU', 'IXC', 'SXR', 'ATQ', 'IXB', 'VNS', 'PAT', 'BBI', 'NAG', 'IDR', 'CJB', 'IXE', 'IXM', 'VTZ', 'RPR', 'IXR', 'UDR', 'JDH', 'DED', 'IXL', 'IMF', 'DIB', 'BHO', 'STV'],
  'Asia/Dubai': ['DXB', 'DWC', 'AUH', 'SHJ'], 'Asia/Qatar': ['DOH'], 'Asia/Muscat': ['MCT'], 'Asia/Bahrain': ['BAH'], 'Asia/Kuwait': ['KWI'], 'Asia/Riyadh': ['RUH', 'JED'],
  'Asia/Singapore': ['SIN'], 'Asia/Kuala_Lumpur': ['KUL'], 'Asia/Bangkok': ['BKK', 'DMK', 'HKT', 'CNX', 'USM'], 'Asia/Hong_Kong': ['HKG'], 'Asia/Tokyo': ['NRT', 'HND', 'KIX'],
  'Asia/Seoul': ['ICN'], 'Asia/Shanghai': ['PEK', 'PVG', 'CAN'], 'Asia/Jakarta': ['CGK'], 'Asia/Makassar': ['DPS'], 'Asia/Manila': ['MNL'], 'Asia/Ho_Chi_Minh': ['SGN', 'HAN'],
  'Asia/Colombo': ['CMB'], 'Asia/Kathmandu': ['KTM'], 'Asia/Dhaka': ['DAC'], 'Indian/Maldives': ['MLE'], 'Asia/Thimphu': ['PBH'],
  'Australia/Sydney': ['SYD', 'MEL'], 'Australia/Brisbane': ['BNE'], 'Australia/Perth': ['PER'], 'Pacific/Auckland': ['AKL'],
  'Europe/London': ['LHR', 'LGW', 'STN', 'MAN', 'EDI'], 'Europe/Dublin': ['DUB'], 'Europe/Paris': ['CDG', 'ORY'], 'Europe/Amsterdam': ['AMS'], 'Europe/Berlin': ['FRA', 'MUC', 'BER'],
  'Europe/Zurich': ['ZRH', 'GVA'], 'Europe/Vienna': ['VIE'], 'Europe/Rome': ['FCO', 'MXP', 'VCE'], 'Europe/Madrid': ['MAD', 'BCN'], 'Europe/Lisbon': ['LIS', 'OPO'],
  'Europe/Istanbul': ['IST'], 'Europe/Athens': ['ATH'], 'Europe/Copenhagen': ['CPH'], 'Europe/Stockholm': ['ARN'], 'Europe/Oslo': ['OSL'], 'Europe/Helsinki': ['HEL'],
  'Europe/Warsaw': ['WAW'], 'Europe/Prague': ['PRG'], 'Europe/Budapest': ['BUD'], 'Europe/Brussels': ['BRU'], 'Atlantic/Reykjavik': ['KEF'],
  'Africa/Cairo': ['CAI'], 'Africa/Nairobi': ['NBO'], 'Africa/Johannesburg': ['JNB', 'CPT'],
  'America/New_York': ['JFK', 'EWR', 'IAD', 'ATL', 'BOS', 'MIA'], 'America/Chicago': ['ORD', 'DFW', 'IAH'], 'America/Los_Angeles': ['LAX', 'SFO', 'SEA'],
  'America/Toronto': ['YYZ'], 'America/Vancouver': ['YVR'], 'America/Mexico_City': ['MEX'], 'America/Sao_Paulo': ['GRU'],
};
export const AIRPORT_TZ: Record<string, string> = {};
for (const [tz, codes] of Object.entries(TZ_GROUPS)) for (const c of codes) AIRPORT_TZ[c] = tz;

const code = (c: string) => (AIRPORTS[c] ? `${AIRPORTS[c]} (${c})` : c);

export interface FlightSegment extends Parsed { flightNo: string; airline?: string; from?: string; to?: string }

const FLIGHT_NO = /\b([A-Z0-9]{2})[\s-]?(\d{1,4})\b/g;

interface Mark { no: string; code: string; at: number; name?: string }
/**
 * Flight numbers in the text, each at the start of its line. A number counts when its airline code is one we know,
 * when it follows the word "flight", or when its line opens with it and a name ("EY 205 • Etihad"), so an airline
 * missing from the table is still found. The same number twice in a row is one flight; later it is another day's.
 */
function flightMarks(t: string): Mark[] {
  const out: Mark[] = [];
  for (const m of t.matchAll(FLIGHT_NO)) {
    const c = m[1];
    if (!/[A-Z]/.test(c)) continue;
    const at = t.lastIndexOf('\n', m.index) + 1;
    const lineEnd = t.indexOf('\n', m.index);
    const line = t.slice(at, lineEnd < 0 ? t.length : lineEnd);
    const labelled = /(?:flight|flt)\s*(?:no\.?|number)?\s*[:#-]?\s*$/i.test(t.slice(Math.max(0, m.index - 18), m.index));
    const named = /^\s*[•·|–—-]\s*([A-Za-z][A-Za-z .&'-]{2,30})/.exec(line.slice(line.indexOf(m[0]) + m[0].length));
    const opens = line.trimStart().startsWith(m[0]);
    if (!AIRLINES[c] && !labelled && !(opens && named)) continue;
    // "AI 123" yes; "AI 2026" is probably a year, and a time like "AI 06:15" is not a number at all.
    if (+m[2] > 9999 || (m[2].length === 4 && +m[2] >= 1900 && +m[2] <= 2100 && !labelled)) continue;
    const next = t[m.index + m[0].length];
    if (next === ':' || next === '.' || (next === '-' && /\d/.test(t[m.index + m[0].length + 1] ?? ''))) continue;
    // "Airbus A350", "Boeing 737": the aircraft, even where its letters are also an airline's code.
    if (/airbus|boeing|embraer|aircraft|atr|bombardier|canadair|equipment/i.test(t.slice(Math.max(0, m.index - 14), m.index))) continue;
    if (/^A[1-3]$/.test(c) && m[0] === c + m[2] && m[2].length === 2) continue; // A318 ... A388 written without a space: an aircraft, not Aegean
    const no = `${c} ${+m[2]}`;
    const prev = out[out.length - 1];
    if (prev && (prev.at === at || prev.no === no)) continue; // the same line, or the same flight named again straight after
    out.push({ no, code: c, at, name: named?.[1]?.trim() });
  }
  return out;
}
// Three letters in brackets that are not airports: a reference label, a currency, a tax.
const NOT_AIRPORT = new Set(['PNR', 'GST', 'USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'VAT', 'TAX', 'ETA', 'ETD', 'TBA', 'MRP', 'PDF', 'URL', 'FAQ', 'OTA', 'CGST', 'SGST', 'IGST', 'UDF', 'PSF', 'ASF', 'EMD', 'GDS']);
const NOT_PLACE = /reference|booking|ticket|fare|tax|amount|total|payment|number|passenger|charge|fee|convenience|discount/i;

/** Airports in a stretch of text, in order of appearance: "Mumbai (BOM)", then bare "BOM → BLR" pairs. */
function airportsIn(s: string): { code: string; name: string }[] {
  const out: { code: string; name: string }[] = [];
  const add = (c: string, name = '') => { if (!NOT_AIRPORT.has(c) && !out.some((o) => o.code === c)) out.push({ code: c, name }); };
  for (const m of s.matchAll(/([A-Za-z][A-Za-z .'-]{1,34}?)\s*\(([A-Z]{3})\)/g)) {
    const name = m[1].replace(/^(?:departure|arrival|depart(?:s|ing)?|arrive(?:s)?|from|to|origin|destination|airport|terminal)[\s:.-]*/i, '').trim();
    if (!AIRPORTS[m[2]] && NOT_PLACE.test(m[1])) continue; // "Booking Reference (PNR)"
    add(m[2], /^(departure|arrival|airport|terminal|flight|gate)$/i.test(name) || name.length < 3 ? '' : name);
  }
  if (out.length < 2) for (const m of s.matchAll(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to)\s*([A-Z]{3})\b/g)) { add(m[1]); add(m[2]); }
  // A code alone on its line, the way app screens and some e-tickets print it.
  // (or one of several columns on a line: "BOM   03h 05m • Non stop   AUH").
  if (out.length < 2) for (const line of s.split('\n')) for (const tok of line.split(/\s{2,}/)) { const c = tok.trim(); if (/^[A-Z]{3}$/.test(c) && AIRPORTS[c]) add(c); }
  // No codes: look for city names, in the order they appear.
  if (out.length < 2) for (const m of s.matchAll(CITY_RX)) { const c = CITY_CODE[m[1].toLowerCase()]; if (c) add(c, AIRPORTS[c]?.replace(/\s*\(.*\)\s*$/, '') ?? ''); }
  return out;
}
const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const first = (s: string, rx: RegExp) => { const m = s.match(rx); return m ? clean(m[1]) : undefined; };

/** Details a traveller wants at the airport. Segment text first for terminal, gate and seat; the whole ticket for the rest. */
function detailsOf(seg: string, all: string): { lines: string[]; passengers: string[] } {
  const lines: string[] = [];
  // Names, once each (a title and the same name from a "Passenger:" label are one person). Spaces only: a name stops at the line end.
  const people = new Map<string, string>();
  const person = (raw: string) => { const n = clean(raw); const key = n.replace(/^(?:MR|MRS|MS|MSTR|MISS|DR)\.?\s+/i, '').toUpperCase(); if (key.length > 2 && !people.has(key)) people.set(key, n); };
  for (const m of all.matchAll(/\b(?:MR|MRS|MS|MSTR|MISS|DR)\.? +[A-Z][A-Za-z]+(?: +[A-Z][A-Za-z]+){0,3}/g)) person(m[0]);
  for (const m of all.matchAll(/(?:passengers?|travell?ers?)(?: name)? *[:\-] *([A-Za-z][A-Za-z .'/-]{2,40})/gi)) person(m[1]);
  const passengers = [...people.values()];
  const seat = first(seg, /\bseat(?:\s*(?:no\.?|number))?\s*[:#-]?\s*(\d{1,2}\s?[A-K])\b/i) ?? first(all, /\bseat(?:\s*(?:no\.?|number))?\s*[:#-]?\s*(\d{1,2}\s?[A-K])\b/i);
  const cabin = first(seg, /\b(premium economy|economy|business|first)(?:\s+class)?\b/i) ?? first(all, /\b(premium economy|economy|business|first)(?:\s+class)?\b/i);
  const cabinBag = first(seg, /\b(?:cabin|hand)(?:\s+baggage)?\s*[:\-]?\s*(\d{1,3}\s?kgs?)\b/i) ?? first(all, /\b(?:cabin|hand)(?:\s+baggage)?\s*[:\-]?\s*(\d{1,3}\s?kgs?)\b/i);
  const checkedBag = first(seg, /\b(?:checked|check-?in)(?:\s+baggage)?\s*[:\-]?\s*(\d{1,3}\s?(?:kgs?|pcs?|pieces?))\b/i) ?? first(all, /\b(?:checked|check-?in)(?:\s+baggage)?\s*[:\-]?\s*(\d{1,3}\s?(?:kgs?|pcs?|pieces?))\b/i);
  const bag = cabinBag || checkedBag ? undefined : first(all, /baggage\s*(?:allowance)?\s*[:\-]?\s*(\d{1,3}\s?(?:kg|kgs|pcs?|pieces?)(?:[^\n]{0,24})?)/i);
  const aircraft = first(seg, /\b((?:airbus|boeing|embraer|atr|bombardier)[ ]+[A-Za-z]?\d[A-Za-z0-9-]*(?:[ ]+[A-Za-z0-9-]+)?)/i);
  const dur = seg.match(/\b(\d{1,2})\s?h(?:rs?|ours?)?\s?(\d{1,2})\s?m(?:in(?:s|utes)?)?\b(?:\s*[•·|,-]\s*(non[- ]?stop|\d+\s?stops?))?/i);
  const status = first(seg, /\bstatus\s*[:\-]?\s*(confirmed|ticketed|cancelled|canceled|waitlisted|pending|on time|delayed)\b/i) ?? first(all, /\bstatus\s*[:\-]?\s*(confirmed|ticketed|cancelled|canceled|waitlisted|pending)\b/i);
  const fare = first(seg, /\bfare(?:\s+type)?\s*[:\-]?\s*([A-Za-z][A-Za-z ]{1,18}?)(?=\s*(?:\n|$|seat|cabin|checked|baggage))/i);
  const ticket = first(all, /ticket\s*(?:number|no\.?|#)\s*[:#-]?\s*(\d{3}[\s-]?\d{9,10})/i);
  const gate = first(seg, /\bgate\s*[:#-]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
  const meal = first(all, /\bmeal\s*[:\-]\s*([A-Za-z ]{3,24})/i);
  if (seat) lines.push(`Seat: ${seat.replace(/\s/g, '')}`);
  if (cabin) lines.push(`Class: ${cabin[0].toUpperCase()}${cabin.slice(1).toLowerCase()}`);
  if (gate) lines.push(`Gate: ${gate}`);
  if (cabinBag) lines.push(`Cabin baggage: ${cabinBag.replace(/\s+/g, ' ')}`);
  if (checkedBag) lines.push(`Checked baggage: ${checkedBag.replace(/\s+/g, ' ')}`);
  if (bag) lines.push(`Baggage: ${bag}`);
  if (aircraft) lines.push(`Aircraft: ${aircraft}`);
  if (dur) lines.push(`Duration: ${+dur[1]}h ${dur[2].padStart(2, '0')}m${dur[3] ? `, ${/^non/i.test(dur[3]) ? 'non-stop' : dur[3].toLowerCase()}` : ''}`);
  if (fare && !/breakup|summary|rules|details|amount|total|tax|basic/i.test(fare)) lines.push(`Fare: ${fare}`);
  if (status) lines.push(`Status: ${status[0].toUpperCase()}${status.slice(1).toLowerCase()}`);
  if (meal) lines.push(`Meal: ${meal}`);
  if (ticket) lines.push(`Ticket: ${ticket.replace(/[\s]/g, '')}`);
  return { lines, passengers: passengers.slice(0, 6) };
}

/** Terminals for the two airports of a segment: "Terminal 2", "T2", "Term. 1B", in the order they appear. */
function terminalsIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\bterminal\s*[:#-]?\s*([0-9][A-Z]?|[A-E])\b|\bterm\.?\s*([0-9][A-Z]?)\b|\bT([1-9])\b/gi)) out.push((m[1] ?? m[2] ?? m[3]).toUpperCase());
  return out;
}

/**
 * One booking per flight found in the ticket. The text between a flight number and the next one belongs to that
 * flight, so a table row, a block per flight, and a header-then-details layout all split the same way. With no
 * flight number at all the whole text is one flight. Dates, times and the "+1" day are read by parsePaste.
 */
export function parseFlights(text: string): FlightSegment[] {
  const t = text.replace(/\r/g, '');
  const marks = flightMarks(t);
  const ref = findRef(t);
  const spans = marks.length > 1
    ? marks.map((m, i) => ({ mark: m, text: t.slice(i === 0 ? 0 : m.at, marks[i + 1]?.at ?? t.length) }))
    : [{ mark: marks[0], text: t }];
  const out: FlightSegment[] = [];
  for (const sp of spans) {
    const base = parsePaste(sp.text, 'flight');
    const ports = airportsIn(sp.text);
    const from = ports[0], to = ports[1];
    const no = sp.mark?.no ?? '';
    if (spans.length > 1 && !base.start && !from) continue; // a flight number in the small print, with nothing about a trip
    const d = detailsOf(sp.text, t);
    const term = terminalsIn(sp.text);
    const lines: string[] = [];
    const airline = sp.mark ? AIRLINES[sp.mark.code] ?? sp.mark.name : undefined;
    if (airline) lines.push(`Airline: ${airline}`);
    if (no) lines.push(`Flight: ${no}`);
    if (from) lines.push(`From: ${from.name ? `${from.name} (${from.code})` : code(from.code)}${term[0] ? `, Terminal ${term[0]}` : ''}`);
    if (to) lines.push(`To: ${to.name ? `${to.name} (${to.code})` : code(to.code)}${term[1] ? `, Terminal ${term[1]}` : ''}`);
    if (d.passengers.length) lines.push(`Passenger${d.passengers.length > 1 ? 's' : ''}: ${d.passengers.join(', ')}`);
    lines.push(...d.lines);
    const title = `${no ? `${no} ` : ''}${from && to ? `${from.code} → ${to.code}` : ''}`.trim() || base.title;
    out.push({
      ...base, type: 'flight', ref: base.ref ?? ref, title,
      place: from ? `${from.name || AIRPORTS[from.code] || ''}${from.name || AIRPORTS[from.code] ? ' ' : ''}(${from.code})${term[0] ? ` Terminal ${term[0]}` : ''}` : base.place,
      notes: lines.join('\n') || undefined, flightNo: no, airline, from: from?.code, to: to?.code,
      ...(from && AIRPORT_TZ[from.code] ? { startTz: AIRPORT_TZ[from.code] } : {}), ...(to && AIRPORT_TZ[to.code] ? { endTz: AIRPORT_TZ[to.code] } : {}),
    });
  }
  // The same flight on the same day twice (a summary at the top, then the details): keep the fuller one, in the first one's place.
  const keep = new Map<string, number>();
  const merged: FlightSegment[] = [];
  for (const f of out) {
    const key = `${f.flightNo}|${(f.start ?? '').slice(0, 10)}`;
    const at = keep.get(key);
    if (at === undefined || !f.flightNo) { keep.set(key, merged.length); merged.push(f); continue; }
    const have = merged[at];
    if ((f.end ? 1 : 0) + (f.from && f.to ? 1 : 0) + (f.notes?.length ?? 0) / 1000 > (have.end ? 1 : 0) + (have.from && have.to ? 1 : 0) + (have.notes?.length ?? 0) / 1000) merged[at] = f;
  }
  return merged;
}

/** Everything bookable in a document: one booking per flight on a ticket, otherwise the one booking the text describes. */
export function parseDocument(text: string): Parsed[] {
  const base = parsePaste(text);
  if (base.type !== 'flight') return [base];
  const flights = parseFlights(text);
  return flights.length ? flights : [base];
}

/** How complete a reading is: flights with dates, times and both airports count, a flight that is only a number does not. */
function score(list: Parsed[]): number {
  return list.reduce((n, p) => {
    const f = p as Partial<FlightSegment>;
    const full = (p.start ? 2 : -3) + (p.end ? 2 : 0) + (f.from && f.to ? 2 : -2) + (f.flightNo ? 1 : 0) - (p.guessed?.length ?? 0) * 2;
    return n + full;
  }, 0);
}

/**
 * A PDF can be read in the order its text was drawn or as rows by position; which one suits a ticket depends on how
 * it was made. Read the text each way and keep the reading that found the most. The first wins a tie.
 */
export function parseBest(texts: string[]): { parsed: Parsed[]; text: string; index: number } {
  let best = { parsed: parseDocument(texts[0]), text: texts[0], index: 0 };
  let top = score(best.parsed);
  texts.slice(1).forEach((text, i) => {
    const parsed = parseDocument(text);
    const sc = score(parsed);
    if (sc > top) { top = sc; best = { parsed, text, index: i + 1 }; }
  });
  return best;
}
