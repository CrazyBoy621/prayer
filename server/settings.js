export const METHODS = [
  'MuslimWorldLeague', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai',
  'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore',
  'Tehran', 'Turkey',
];
export const MADHABS = ['Shafi', 'Hanafi'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// api key -> { column, parse } ; parse validates and returns the string to store
const KEYS = {
  latitude: {
    column: 'latitude',
    parse(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < -90 || n > 90) throw badValue('latitude', v);
      return String(n);
    },
  },
  longitude: {
    column: 'longitude',
    parse(v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < -180 || n > 180) throw badValue('longitude', v);
      return String(n);
    },
  },
  timezone: {
    column: 'timezone',
    parse(v) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
      } catch {
        throw badValue('timezone', v);
      }
      return String(v);
    },
  },
  method: {
    column: 'method',
    parse(v) {
      if (!METHODS.includes(v)) throw badValue('method', v);
      return v;
    },
  },
  madhab: {
    column: 'madhab',
    parse(v) {
      if (!MADHABS.includes(v)) throw badValue('madhab', v);
      return v;
    },
  },
  trackingStartDate: {
    column: 'tracking_start_date',
    parse(v) {
      if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
        throw badValue('trackingStartDate', v);
      }
      return v;
    },
  },
};

function badValue(key, value) {
  const err = new Error(`Invalid ${key}: ${JSON.stringify(value)}`);
  err.status = 400;
  return err;
}

export async function getSettings(db) {
  const { rows } = await db.execute('SELECT key, value FROM settings');
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    timezone: raw.timezone,
    method: raw.method,
    madhab: raw.madhab,
    trackingStartDate: raw.tracking_start_date,
  };
}

export async function updateSettings(db, patch) {
  const writes = [];
  for (const [key, value] of Object.entries(patch)) {
    const spec = KEYS[key];
    if (!spec) throw badValue(`unknown setting "${key}"`, value);
    writes.push([spec.column, spec.parse(value)]);
  }
  if (writes.length) {
    await db.batch(
      writes.map(([column, value]) => ({
        sql: 'UPDATE settings SET value = ? WHERE key = ?',
        args: [value, column],
      })),
      'write',
    );
  }
  return getSettings(db);
}
