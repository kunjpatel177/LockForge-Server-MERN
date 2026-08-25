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

/** Vercel strips /api prefix before the serverless handler runs */
export const fixVercelRequestPath = (req) => {
  const addPrefix = (path) => {
    if (!path || path.startsWith('/api')) return path;
    return `/api${path.startsWith('/') ? path : `/${path}`}`;
  };

  req.url = addPrefix(req.url);

  if (req.originalUrl) {
    const [path, query] = req.originalUrl.split('?');
    const fixedPath = addPrefix(path);
    req.originalUrl = query ? `${fixedPath}?${query}` : fixedPath;
  }
};
