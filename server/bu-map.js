/** Business Unit ↔ Division map (from hrform.bu_division_map). */

export const BUSINESS_UNITS = [
  { key: 'JBL', label: 'JBL · Jaffer Brothers' },
  { key: 'JBS', label: 'JBS · Jaffer Business Systems' },
  { key: 'JASPL', label: 'JASPL · Jaffer Agro Services' },
  { key: 'CRS', label: 'CSU' },
  { key: 'BTC', label: 'BTC · Blutech' },
];

/** Portal departments available under each Business Unit (CSU = CRS). */
export const DEPARTMENTS_BY_BU = {
  CRS: [
    'Group IT',
    'IT / GIT',
    'P&C',
    'Finance',
    'Legal',
    'Admin',
    'Procurement',
    'Supply Chain',
    'Operations',
    'Marketing',
  ],
  JBL: [
    'Sales',
    'Marketing',
    'Operations',
    'Finance',
    'P&C',
    'Admin',
    'Supply Chain',
    'Procurement',
  ],
  JBS: ['Sales', 'Marketing', 'Operations', 'Finance', 'P&C', 'Admin', 'Procurement'],
  JASPL: [
    'Sales',
    'Marketing',
    'Operations',
    'Finance',
    'P&C',
    'Admin',
    'Supply Chain',
    'Procurement',
  ],
  BTC: ['Sales', 'Marketing', 'Operations', 'Finance', 'P&C', 'Admin'],
};

export function departmentsForBu(bu, allDepartments = []) {
  const key = normalizeBu(bu);
  const fallback = allDepartments.length
    ? allDepartments
    : Object.values(DEPARTMENTS_BY_BU).flat();
  if (!key || key === 'All') {
    return [...new Set(fallback)];
  }
  const listed = DEPARTMENTS_BY_BU[key];
  if (listed?.length) {
    // Prefer configured list, keep only names that exist in org departments when provided
    if (allDepartments.length) {
      const allow = new Set(allDepartments.map((d) => String(d).trim()));
      const hit = listed.filter((d) => allow.has(d));
      return hit.length ? hit : listed;
    }
    return [...listed];
  }
  return [...new Set(fallback)];
}

export const BU_DIVISION_SEED = [
  ['JBL', 'JBL - Distribution Services'],
  ['JBL', 'JBL - HILTI Division'],
  ['JBL', 'JBL - JES'],
  ['JBL', 'JBL - Machinery Division'],
  ['JBL', 'MBL - HO'],
  ['JBS', 'EAP'],
  ['JBS', 'HKPL'],
  ['JBS', 'Impare Tech'],
  ['JBS', 'JBS Consulting'],
  ['JBS', 'JBS Consulting - Business OPS'],
  ['JBS', 'JBS Consulting - Business Unit'],
  ['JBS', 'JBS Consulting - International Sales'],
  ['JBS', 'JBS Consulting - Pre Sales'],
  ['JBS', 'JBS Consulting - Sales'],
  ['JBS', 'JBS Consulting - Service Delivery'],
  ['JBS', 'JBS Inc.'],
  ['JBS', 'JBSPL'],
  ['JBS', 'JBSPL - JBSL'],
  ['JASPL', 'GS Jaffer Seeds'],
  ['JASPL', 'GSJSPL - GS Jaffer Seeds'],
  ['JASPL', 'GSJSPL - Pesticides'],
  ['JASPL', 'JASPL - Factory'],
  ['JASPL', 'JASPL - Fertilizer Nutraful'],
  ['JASPL', 'JASPL - HEIS'],
  ['JASPL', 'JASPL - HEIS '],
  ['JASPL', 'JASPL - Jaffer Environment & Hygiene'],
  ['JASPL', 'JASPL - Pesticides'],
  ['JASPL', 'JBTPL - Biotech'],
  ['JASPL', 'KKPL'],
  ['CRS', 'JASPL - HO'],
  ['CRS', 'JBL - HO'],
  ['CRS', 'JBSPL - HO'],
  ['BTC', 'BTCPL - Blutech'],
];

export function normalizeBu(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return '';
  if (v === 'ALL' || v === '*') return 'All';
  const hit = BUSINESS_UNITS.find((b) => b.key === v);
  return hit ? hit.key : v;
}

export function buLabel(key) {
  const n = normalizeBu(key);
  if (n === 'All') return 'All business units';
  return BUSINESS_UNITS.find((b) => b.key === n)?.label || n || '—';
}

function normDiv(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Resolve BU from an HR DivisionName using the seed map (and DB rows if provided). */
export function resolveBuFromDivision(division, rows = BU_DIVISION_SEED) {
  const d = normDiv(division);
  if (!d) return '';
  for (const row of rows) {
    const bu = Array.isArray(row) ? row[0] : row.bu;
    const div = Array.isArray(row) ? row[1] : row.division;
    if (normDiv(div) === d) return normalizeBu(bu);
  }
  // Soft match: division starts with mapped value or vice versa
  for (const row of rows) {
    const bu = Array.isArray(row) ? row[0] : row.bu;
    const div = normDiv(Array.isArray(row) ? row[1] : row.division);
    if (!div) continue;
    if (d === div || d.startsWith(div) || div.startsWith(d)) return normalizeBu(bu);
  }
  // Prefix heuristics from DivisionName itself
  if (/^jbl\b/.test(d) || d.includes('jbl -')) return 'JBL';
  if (/^jbspl\b/.test(d) || /^jbs\b/.test(d) || d.includes('jbs consulting')) return 'JBS';
  if (/^jaspl\b/.test(d) || /^gsjspl\b/.test(d) || /^kkpl\b/.test(d) || /^jbtpl\b/.test(d)) return 'JASPL';
  if (/^btcpl\b/.test(d) || d.includes('blutech')) return 'BTC';
  if (d.includes(' - ho') || d.endsWith(' ho')) {
    // Shared HO divisions are CRS in the map
    if (d.startsWith('jbl') || d.startsWith('jbspl') || d.startsWith('jaspl')) return 'CRS';
  }
  return '';
}

export function divisionsForBu(bu, rows = BU_DIVISION_SEED) {
  const key = normalizeBu(bu);
  if (!key || key === 'All') {
    return [...new Set(rows.map((r) => (Array.isArray(r) ? r[1] : r.division).trim()).filter(Boolean))];
  }
  return [
    ...new Set(
      rows
        .filter((r) => normalizeBu(Array.isArray(r) ? r[0] : r.bu) === key)
        .map((r) => String(Array.isArray(r) ? r[1] : r.division || '').trim())
        .filter(Boolean)
    ),
  ];
}

export function buMapPublic(rows = BU_DIVISION_SEED) {
  return BUSINESS_UNITS.map((b) => ({
    key: b.key,
    label: b.label,
    divisions: divisionsForBu(b.key, rows),
  }));
}
