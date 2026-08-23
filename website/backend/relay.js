import express from 'express';
import https from 'https';

const PORT = process.env.PORT || 8080;
const RELAY_API_KEY = process.env.RELAY_API_KEY || process.env.DEVICE_API_KEY || 'cms-device-key-default';
const TARGET_API = process.env.TARGET_API || 'https://chetrika-rayz.onrender.com';

const app = express();
app.use(express.json());

function forward(method, req, res) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== RELAY_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const targetPath = req.path === '/api/iot/data' ? '/api/data' : req.path;
  const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';

  const options = {
    hostname: new URL(TARGET_API).hostname,
    port: 443,
    path: targetPath + qs,
    method,
    headers: { 'x-api-key': RELAY_API_KEY }
  };

  let bodyData = null;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    bodyData = JSON.stringify(req.body);
    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = Buffer.byteLength(bodyData);
  }

  const proxyReq = https.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      try { res.status(proxyRes.statusCode).json(JSON.parse(body)); }
      catch { res.status(proxyRes.statusCode).send(body); }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[RELAY] Error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Relay upstream error' });
  });

  if (bodyData) proxyReq.write(bodyData);
  proxyReq.end();
}

app.post('*', (req, res) => forward('POST', req, res));
app.get('*', (req, res) => forward('GET', req, res));
app.put('*', (req, res) => forward('PUT', req, res));

app.listen(PORT, () => {
  console.log(`[RELAY] HTTP relay on port ${PORT} → ${TARGET_API}`);
});
