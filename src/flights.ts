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

const code = (c: string) => (AIRPORTS[c] ? `${AIRPORTS[c]} (${c})` : c);

export interface FlightSegment extends Parsed { flightNo: string; airline?: string; from?: string; to?: string }

const FLIGHT_NO = /\b([A-Z0-9]{2})[\s-]?(\d{1,4})\b/g;
/** Flight numbers in the text, each once, at the line where it first appears (a repeat in a header or a footer is the same flight). */
function flightMarks(t: string): { no: string; code: string; at: number }[] {
  const seen = new Set<string>();
  const out: { no: string; code: string; at: number }[] = [];
  for (const m of t.matchAll(FLIGHT_NO)) {
    const c = m[1];
    if (!AIRLINES[c] || !/[A-Z]/.test(c)) continue;
    // "AI 123" yes; "AI 2026" is probably a year, and a time like "AI 06:15" is not a number at all.
    if (+m[2] > 9999 || (m[2].length === 4 && +m[2] >= 1900 && +m[2] <= 2100 && !/flight|flt/i.test(t.slice(Math.max(0, m.index - 12), m.index)))) continue;
    const next = t[m.index + m[0].length];
    if (next === ':' || next === '.') continue;
    const no = `${c} ${+m[2]}`;
    if (seen.has(no)) continue;
    seen.add(no);
    out.push({ no, code: c, at: t.lastIndexOf('\n', m.index) + 1 }); // the start of its line
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
  const bag = first(all, /(?:check-?in\s+|checked\s+|hand\s+|cabin\s+)?baggage\s*(?:allowance)?\s*[:\-]?\s*(\d{1,3}\s?(?:kg|kgs|pcs?|pieces?)(?:[^\n]{0,24})?)/i);
  const ticket = first(all, /ticket\s*(?:number|no\.?|#)\s*[:#-]?\s*(\d{3}[\s-]?\d{9,10})/i);
  const gate = first(seg, /\bgate\s*[:#-]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
  const meal = first(all, /\bmeal\s*[:\-]\s*([A-Za-z ]{3,24})/i);
  if (seat) lines.push(`Seat: ${seat.replace(/\s/g, '')}`);
  if (cabin) lines.push(`Class: ${cabin[0].toUpperCase()}${cabin.slice(1).toLowerCase()}`);
  if (gate) lines.push(`Gate: ${gate}`);
  if (bag) lines.push(`Baggage: ${bag}`);
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
    const airline = sp.mark ? AIRLINES[sp.mark.code] : undefined;
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
    });
  }
  return out;
}

/** Everything bookable in a document: one booking per flight on a ticket, otherwise the one booking the text describes. */
export function parseDocument(text: string): Parsed[] {
  const base = parsePaste(text);
  if (base.type !== 'flight') return [base];
  const flights = parseFlights(text);
  return flights.length ? flights : [base];
}
