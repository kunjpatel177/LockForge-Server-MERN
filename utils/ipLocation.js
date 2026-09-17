const IP_API_BASE = process.env.IP_API_BASE_URL || 'http://ip-api.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const locationCache = new Map();
const pendingLookups = new Map();

const normalizeIp = (ip) => {
  if (!ip || ip === 'Unknown') return null;

  let value = String(ip).split(',')[0].trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);

  return value || null;
};

const isLocalOrPrivateIp = (ip) => {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^fc|^fd|^fe80:/i.test(ip)) return true;
  return false;
};

const getCachedLocation = (ip) => {
  const entry = locationCache.get(ip);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    locationCache.delete(ip);
    return null;
  }
  return entry.value;
};

const setCachedLocation = (ip, value) => {
  locationCache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (locationCache.size > 2000) {
    const oldestKey = locationCache.keys().next().value;
    locationCache.delete(oldestKey);
  }
};

const formatIpApiLocation = (data) => {
  if (!data || data.status !== 'success') return 'Unknown location';
  const parts = [data.city, data.regionName, data.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Unknown location';
};

const fetchLocationFromIpApi = async (ip) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const fields = 'status,message,country,regionName,city';
    const url = `${IP_API_BASE}/json/${encodeURIComponent(ip)}?fields=${fields}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) return 'Unknown location';

    const data = await response.json();
    return formatIpApiLocation(data);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('ip-api.com lookup failed:', err.message);
    }
    return 'Unknown location';
  } finally {
    clearTimeout(timeout);
  }
};

export const resolveLocationFromIp = async (ip) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return 'Unknown location';
  if (isLocalOrPrivateIp(normalized)) return 'Local network';

  const cached = getCachedLocation(normalized);
  if (cached) return cached;

  if (pendingLookups.has(normalized)) {
    return pendingLookups.get(normalized);
  }

  const lookupPromise = fetchLocationFromIpApi(normalized)
    .then((location) => {
      setCachedLocation(normalized, location);
      return location;
    })
    .finally(() => {
      pendingLookups.delete(normalized);
    });

  pendingLookups.set(normalized, lookupPromise);
  return lookupPromise;
};

export const enrichActivityLog = async (log) => {
  const doc = typeof log.toObject === 'function' ? log.toObject() : { ...log };
  if (!doc.location && doc.ipAddress) {
    doc.location = await resolveLocationFromIp(doc.ipAddress);
  }
  return doc;
};

export const resolveSessionLocation = async (session) => {
  if (session.location) return session.location;
  return resolveLocationFromIp(session.ipAddress);
};
