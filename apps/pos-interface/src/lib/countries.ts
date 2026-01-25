export function getSortedCountries() {
  const prioritySet = new Set(priorityCountryNames);
  const priority = countries.filter((c) => prioritySet.has(c.name));
  const others = countries.filter((c) => !prioritySet.has(c.name));
  return [...priority, ...others];
}

export const priorityCountryNames = [
  "Kuwait",
  "Saudi Arabia",
  "Bahrain",
  "Qatar",
  "United Arab Emirates",
];
  
export const countries = [
  // Gulf / Middle East Priority
  { name: 'Kuwait', code: 'KW', phoneCode: '+965' },
  { name: 'Saudi Arabia', code: 'SA', phoneCode: '+966' },
  { name: 'Bahrain', code: 'BH', phoneCode: '+973' },
  { name: 'Qatar', code: 'QA', phoneCode: '+974' },
  { name: 'United Arab Emirates', code: 'AE', phoneCode: '+971' },
  { name: 'Oman', code: 'OM', phoneCode: '+968' },

  // South Asia
  { name: 'India', code: 'IN', phoneCode: '+91' },
  { name: 'Bangladesh', code: 'BD', phoneCode: '+880' },
  { name: 'Pakistan', code: 'PK', phoneCode: '+92' },
  { name: 'Sri Lanka', code: 'LK', phoneCode: '+94' },
  { name: 'Nepal', code: 'NP', phoneCode: '+977' },
  { name: 'Bhutan', code: 'BT', phoneCode: '+975' },
  { name: 'Maldives', code: 'MV', phoneCode: '+960' },

  // Major European Countries
  { name: 'United Kingdom', code: 'GB', phoneCode: '+44' },
  { name: 'Germany', code: 'DE', phoneCode: '+49' },
  { name: 'France', code: 'FR', phoneCode: '+33' },
  { name: 'Italy', code: 'IT', phoneCode: '+39' },
  { name: 'Spain', code: 'ES', phoneCode: '+34' },
  { name: 'Netherlands', code: 'NL', phoneCode: '+31' },
  { name: 'Sweden', code: 'SE', phoneCode: '+46' },
  { name: 'Norway', code: 'NO', phoneCode: '+47' },
  { name: 'Switzerland', code: 'CH', phoneCode: '+41' },
  { name: 'Denmark', code: 'DK', phoneCode: '+45' },
  { name: 'Finland', code: 'FI', phoneCode: '+358' },
  { name: 'Ireland', code: 'IE', phoneCode: '+353' },
  { name: 'Portugal', code: 'PT', phoneCode: '+351' },
  { name: 'Poland', code: 'PL', phoneCode: '+48' },
  { name: 'Greece', code: 'GR', phoneCode: '+30' },
  { name: 'Austria', code: 'AT', phoneCode: '+43' },
  { name: 'Belgium', code: 'BE', phoneCode: '+32' },
  { name: 'Czech Republic', code: 'CZ', phoneCode: '+420' },
  { name: 'Hungary', code: 'HU', phoneCode: '+36' },

  // Other major countries
  { name: 'Turkey', code: 'TR', phoneCode: '+90' },
  { name: 'Egypt', code: 'EG', phoneCode: '+20' },
  { name: 'Singapore', code: 'SG', phoneCode: '+65' },
  { name: 'Malaysia', code: 'MY', phoneCode: '+60' },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62' },
  { name: 'Philippines', code: 'PH', phoneCode: '+63' },
];