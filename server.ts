import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));

/** Saves one maplestory.io URL to /assets/<name> so the game works offline and fast. */
async function cacheOne(url: string): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;
  const safe = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9._-]+/gi, '_');
  const filePath = path.join(ROOT, 'assets', safe);

  try {
    await fs.access(filePath);
    return safe;
  } catch {
    // proceed to fetch
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    await fs.mkdir(path.join(ROOT, 'assets'), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));
    return safe;
  } catch {
    return null;
  }
}

// API: cache a single asset to /assets/
app.post('/api/cache-asset', async (req, res) => {
  const { url } = (req.body || {}) as { url?: string };
  if (!url) {
    return res.json({ saved: null });
  }
  const saved = await cacheOne(url);
  return res.json({ saved });
});

// API: warm the cache for a batch of URLs with concurrency
app.post('/api/warm-assets', async (req, res) => {
  const { urls } = (req.body || {}) as { urls?: string[] };
  if (!Array.isArray(urls)) {
    return res.json({ count: 0 });
  }
  const targets = urls.slice(0, 5000);
  const batchSize = 25;
  let count = 0;
  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map(cacheOne));
    count += results.filter(Boolean).length;
  }
  return res.json({ count });
});

// Static assets cache
app.use(
  '/assets',
  express.static(path.join(ROOT, 'assets'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.cur')) {
        res.setHeader('content-type', 'image/x-icon');
      } else if (filePath.endsWith('.gif')) {
        res.setHeader('content-type', 'image/gif');
      } else {
        res.setHeader('content-type', 'image/png');
      }
    },
  })
);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(ROOT, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(ROOT, 'dist', 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Maple Wayfarer running at http://0.0.0.0:${port}`);
});
