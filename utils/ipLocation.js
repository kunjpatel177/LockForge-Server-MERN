import geoip from 'geoip-lite';

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

export const resolveLocationFromIp = (ip) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return 'Unknown location';
  if (isLocalOrPrivateIp(normalized)) return 'Local network';

  const lookup = geoip.lookup(normalized);
  if (!lookup) return 'Unknown location';

  const parts = [lookup.city, lookup.region, lookup.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Unknown location';
};

export const enrichActivityLog = (log) => {
  const doc = typeof log.toObject === 'function' ? log.toObject() : { ...log };
  if (!doc.location && doc.ipAddress) {
    doc.location = resolveLocationFromIp(doc.ipAddress);
  }
  return doc;
};

export const resolveSessionLocation = (session) => {
  if (session.location) return session.location;
  return resolveLocationFromIp(session.ipAddress);
};
