export const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const allowedOrigins = [
    process.env.CLIENT_URL,
    'https://lockforgekmp.vercel.app',
    'https://lockforgepwm.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  if (allowedOrigins.includes(origin)) return true;

  // Allow all Vercel preview or production deployments
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vercel.app')) {
      return true;
    }
  } catch {
    // ignore invalid URL
  }

  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return false;
};

export const applyCorsHeaders = (req, res) => {
  const origin = req.headers?.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
};

const splitPathAndQuery = (value = '') => {
  const [path, ...queryParts] = value.split('?');
  const query = queryParts.length ? `?${queryParts.join('?')}` : '';
  return { path, query };
};

const normalizeApiPath = (path) => {
  if (!path || path === '/' || path === '') return '/';
  if (path === '/health') return '/api/health';
  if (path.startsWith('/api/') || path === '/api') return path;
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
};

/** Preserve full /api/v1/... paths when running behind Vercel serverless routing */
export const fixVercelRequestPath = (req) => {
  const headerPath =
    req.headers?.['x-vercel-original-url'] ||
    req.headers?.['x-original-url'] ||
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-matched-path'];

  let target = headerPath || req.url || '/';

  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      const parsed = new URL(target);
      target = parsed.pathname + parsed.search;
    } catch {
      // keep target
    }
  }

  const { path: urlPath, query: urlQuery } = splitPathAndQuery(target);
  const fixedPath = normalizeApiPath(urlPath);
  const finalUrl = fixedPath + urlQuery;

  req.url = finalUrl;
  if (req.originalUrl) {
    req.originalUrl = finalUrl;
  }
};
