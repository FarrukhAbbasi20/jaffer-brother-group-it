import mysql from 'mysql2/promise';

let pool = null;
let employeesPool = null;

export function useMysqlStorage() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function stripQuotes(v) {
  const s = String(v ?? '');
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: stripQuotes(process.env.MYSQL_PASSWORD || ''),
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  };
}

/** Optional separate creds for connection.employees (HR roster). */
function employeesMysqlConfig() {
  const user = process.env.MYSQL_EMPLOYEES_USER || process.env.MYSQL_USER;
  const database = process.env.MYSQL_EMPLOYEES_DATABASE || 'connection';
  const host = process.env.MYSQL_EMPLOYEES_HOST || process.env.MYSQL_HOST;
  if (!host || !user) return null;
  return {
    host,
    port: Number(process.env.MYSQL_EMPLOYEES_PORT || process.env.MYSQL_PORT || 3306),
    user,
    password: stripQuotes(
      process.env.MYSQL_EMPLOYEES_PASSWORD != null && process.env.MYSQL_EMPLOYEES_PASSWORD !== ''
        ? process.env.MYSQL_EMPLOYEES_PASSWORD
        : process.env.MYSQL_PASSWORD || ''
    ),
    database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 3,
    enableKeepAlive: true,
  };
}

export async function getMysqlPool() {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  if (!pool) pool = mysql.createPool(mysqlConfig());
  return pool;
}

/** Pool used to read HR employees (defaults to main pool). */
export async function getEmployeesMysqlPool() {
  const cfg = employeesMysqlConfig();
  if (!cfg) return getMysqlPool();
  const main = mysqlConfig();
  const same =
    cfg.host === main.host &&
    cfg.port === main.port &&
    cfg.user === main.user &&
    cfg.password === main.password &&
    cfg.database === main.database;
  if (same) return getMysqlPool();
  if (!employeesPool) employeesPool = mysql.createPool(cfg);
  return employeesPool;
}

export async function probeMysql() {
  if (!useMysqlStorage()) return { ok: false, reason: 'not configured' };
  const db = await getMysqlPool();
  const [rows] = await db.query('SELECT 1 AS ok');
  return { ok: rows[0]?.ok === 1 };
}
