import { getMysqlPool, useMysqlStorage } from './db.js';
import {
  BU_DIVISION_SEED,
  BUSINESS_UNITS,
  buMapPublic,
  normalizeBu,
  resolveBuFromDivision,
} from './bu-map.js';

let cache = { at: 0, rows: null };

export async function listBuDivisionRows() {
  if (!useMysqlStorage()) return BU_DIVISION_SEED.map(([bu, division]) => ({ bu, division }));
  const now = Date.now();
  if (cache.rows && now - cache.at < 60_000) return cache.rows;
  try {
    const db = await getMysqlPool();
    const [rows] = await db.query(
      `SELECT bu, division FROM bu_division_map ORDER BY bu ASC, division ASC`
    );
    cache = {
      at: now,
      rows: (rows || []).map((r) => ({
        bu: normalizeBu(r.bu),
        division: String(r.division || '').trim(),
      })),
    };
    if (!cache.rows.length) {
      cache.rows = BU_DIVISION_SEED.map(([bu, division]) => ({
        bu: normalizeBu(bu),
        division: String(division).trim(),
      }));
    }
    return cache.rows;
  } catch (err) {
    console.warn('listBuDivisionRows:', err.message || err);
    return BU_DIVISION_SEED.map(([bu, division]) => ({
      bu: normalizeBu(bu),
      division: String(division).trim(),
    }));
  }
}

export async function getBuMap() {
  const rows = await listBuDivisionRows();
  return {
    units: BUSINESS_UNITS,
    map: buMapPublic(rows),
    rows,
  };
}

export async function resolveBusinessUnitFromDivision(division) {
  const rows = await listBuDivisionRows();
  return resolveBuFromDivision(division, rows);
}

export function invalidateBuCache() {
  cache = { at: 0, rows: null };
}
