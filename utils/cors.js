export const applyCorsHeaders = (req, res) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const splitPathAndQuery = (value = '') => {
  const [path, ...queryParts] = value.split('?');
  const query = queryParts.length ? `?${queryParts.join('?')}` : '';
  return { path, query };
};

const normalizeApiPath = (path) => {
  if (!path || path === '/') return '/api/health';
  if (path.startsWith('/api/')) return path;
  if (path === '/api') return path;
  return `/api${path.startsWith('/') ? path : `/${path}`}`;
};

/** Preserve full /api/v1/... paths when running behind Vercel serverless routing */
export const fixVercelRequestPath = (req) => {
  const headerPath = req.headers['x-vercel-original-url']
    || req.headers['x-original-url']
    || req.headers['x-forwarded-uri'];

  if (headerPath) {
    const pathname = headerPath.startsWith('http')
      ? new URL(headerPath).pathname
      : splitPathAndQuery(headerPath).path;
    const { query } = splitPathAndQuery(req.url || req.originalUrl || '');
    const fixed = normalizeApiPath(pathname);
    req.url = fixed + query;
    req.originalUrl = fixed + query;
    return;
  }

  const { path: urlPath, query: urlQuery } = splitPathAndQuery(req.url);
  const fixedUrl = normalizeApiPath(urlPath);
  req.url = fixedUrl + urlQuery;

  if (req.originalUrl) {
    const { path: origPath, query: origQuery } = splitPathAndQuery(req.originalUrl);
    req.originalUrl = normalizeApiPath(origPath) + origQuery;
  }
};
