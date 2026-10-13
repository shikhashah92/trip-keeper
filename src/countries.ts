// Country quick facts: a static reference that works offline. Verify a fact before changing it.
export interface Country { plug: string; volts: string; currency: string; emergency: string; drives: 'left' | 'right' }

export const COUNTRY: Record<string, Country> = {
  'Australia': { plug: 'I', volts: '230V', currency: 'AUD', emergency: '000', drives: 'left' },
  'Austria': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Croatia': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Czechia': { plug: 'C / E', volts: '230V', currency: 'CZK', emergency: '112', drives: 'right' },
  'France': { plug: 'C / E', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Germany': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Greece': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'India': { plug: 'C / D / M', volts: '230V', currency: 'INR', emergency: '112', drives: 'left' },
  'Indonesia': { plug: 'C / F', volts: '230V', currency: 'IDR', emergency: '112', drives: 'left' },
  'Ireland': { plug: 'G', volts: '230V', currency: 'EUR', emergency: '112 or 999', drives: 'left' },
  'Italy': { plug: 'C / F / L', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Japan': { plug: 'A / B', volts: '100V', currency: 'JPY', emergency: '110 police, 119 fire and ambulance', drives: 'left' },
  'Netherlands': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Portugal': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Singapore': { plug: 'G', volts: '230V', currency: 'SGD', emergency: '999 police, 995 ambulance', drives: 'left' },
  'Spain': { plug: 'C / F', volts: '230V', currency: 'EUR', emergency: '112', drives: 'right' },
  'Switzerland': { plug: 'C / J', volts: '230V', currency: 'CHF', emergency: '112 (police 117, ambulance 144)', drives: 'right' },
  'Thailand': { plug: 'A / B / C / F / O', volts: '230V', currency: 'THB', emergency: '191 police, 1669 medical, 1155 tourist police', drives: 'left' },
  'Turkey': { plug: 'C / F', volts: '230V', currency: 'TRY', emergency: '112', drives: 'right' },
  'United Arab Emirates': { plug: 'G (also C / D)', volts: '230V', currency: 'AED', emergency: '999 police, 998 ambulance', drives: 'right' },
  'United Kingdom': { plug: 'G', volts: '230V', currency: 'GBP', emergency: '999 or 112', drives: 'left' },
  'United States': { plug: 'A / B', volts: '120V', currency: 'USD', emergency: '911', drives: 'right' },
  'Vietnam': { plug: 'A / C / F', volts: '220V', currency: 'VND', emergency: '113 police, 115 ambulance', drives: 'right' },
};
export const COUNTRY_NAMES = Object.keys(COUNTRY);
