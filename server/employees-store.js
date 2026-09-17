import { getMysqlPool, useMysqlStorage } from './db.js';

function employeesTable() {
  // Always read HR roster from connection.employees (same MySQL server).
  return '`connection`.`employees`';
}

/** Company tags in HR DepartmentName (same function, different legal entity). */
const HR_COMPANY_SUFFIXES = [
  'JASPL',
  'JBSPL',
  'JBSL',
  'JBL',
  'JBS',
  'BTCPL',
  'BTC',
  'GSJSPL',
  'KKPL',
  'MBL',
  'ITPL',
  'JBTPL',
  'JBT',
];

const HR_COMPANY_SUFFIX_RE = new RegExp(
  `\\s*[-–—]\\s*(?:${HR_COMPANY_SUFFIXES.join('|')})\\s*$`,
  'i'
);

/** "Group Supply Chain - JASPL" / "- JBSPL" → "Group Supply Chain" */
export function normalizeHrDepartmentName(name) {
  let d = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!d) return '';
  let prev;
  do {
    prev = d;
    d = d.replace(HR_COMPANY_SUFFIX_RE, '').trim();
  } while (d !== prev);
  return d || String(name || '').trim();
}

function mapEmployeeRow(r) {
  if (!r) return null;
  return {
    accessCode: r.accessCode != null ? String(r.accessCode) : '',
    fullName: String(r.fullName || '').trim(),
    email: String(r.email || '').trim().toLowerCase(),
    department: String(r.department || '').trim(),
    division: String(r.division || '').trim(),
    designation: String(r.designation || '').trim(),
    company: String(r.company || '').trim(),
    status: r.status,
  };
}

export async function searchEmployees(query = '', { limit = 40 } = {}) {
  if (!useMysqlStorage()) return [];
  const db = await getMysqlPool();
  const q = String(query || '').trim();
  const lim = Math.min(80, Math.max(1, Number(limit) || 40));
  const table = employeesTable();

  let sql = `
    SELECT
      AccessCode AS accessCode,
      FullName AS fullName,
      EmailAddress AS email,
      DepartmentName AS department,
      DivisionName AS division,
      Designation AS designation,
      CompanyName AS company,
      Status AS status
    FROM ${table}
    WHERE EmailAddress IS NOT NULL
      AND TRIM(EmailAddress) <> ''
      AND (Status = 1 OR Status = '1' OR Status IS NULL)
  `;
  const params = [];
  if (q) {
    sql += ` AND (
      FullName LIKE ?
      OR EmailAddress LIKE ?
      OR DepartmentName LIKE ?
      OR Designation LIKE ?
      OR CAST(AccessCode AS CHAR) LIKE ?
    )`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ` ORDER BY FullName ASC LIMIT ${lim}`;

  try {
    const [rows] = await db.query(sql, params);
    return (rows || [])
      .map(mapEmployeeRow)
      .filter((r) => r && r.email.includes('@'));
  } catch (err) {
    console.error('searchEmployees failed:', err.message || err);
    const e = new Error(
      'Could not read connection.employees. MySQL user needs SELECT on connection.employees.'
    );
    e.status = 503;
    e.cause = err;
    throw e;
  }
}

export async function findEmployeeByEmail(email) {
  if (!useMysqlStorage()) return null;
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const db = await getMysqlPool();
  const table = employeesTable();
  try {
    const [rows] = await db.query(
      `SELECT
        AccessCode AS accessCode,
        FullName AS fullName,
        EmailAddress AS email,
        DepartmentName AS department,
        DivisionName AS division,
        Designation AS designation,
        CompanyName AS company,
        Status AS status
       FROM ${table}
       WHERE LOWER(TRIM(EmailAddress)) = ?
       LIMIT 1`,
      [normalized]
    );
    return mapEmployeeRow(rows?.[0]);
  } catch (err) {
    console.error('findEmployeeByEmail failed:', err.message || err);
    return null;
  }
}
