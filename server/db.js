import mysql from 'mysql2/promise';

let pool = null;

export function useMysqlStorage() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function mysqlConfig() {
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    enableKeepAlive: true,
  };
}

export async function getMysqlPool() {
  if (!useMysqlStorage()) throw new Error('MySQL is not configured');
  if (!pool) pool = mysql.createPool(mysqlConfig());
  return pool;
}

export async function probeMysql() {
  if (!useMysqlStorage()) return { ok: false, reason: 'not configured' };
  const db = await getMysqlPool();
  const [rows] = await db.query('SELECT 1 AS ok');
  return { ok: rows[0]?.ok === 1 };
}
