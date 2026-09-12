const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

let session = {
  answers: [],
  current: 0,
  total: 10,
  done: false,
  lastUpdate: Date.now()
};

const viewers = new Set();

function broadcast() {
  const data = `data: ${JSON.stringify(session)}\n\n`;
  for (const res of viewers) {
    try { res.write(data); } catch {}
  }
}

function sendFile(res, filePath, contentType) {
  const full = path.join(__dirname, filePath);
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // live SSE stream
  if (pathname === '/live' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify(session)}\n\n`);
    viewers.add(res);
    req.on('close', () => viewers.delete(res));
    return;
  }

  // receive answer
  if (pathname === '/answer' && req.method === 'POST') {
    const body = await readBody(req);
    const { index, answer, total } = body;
    if (typeof index === 'number' && answer) {
      session.answers[index] = answer;
      session.current = index + 1;
      session.total = total || 10;
      session.done = session.current >= session.total;
      session.lastUpdate = Date.now();
      broadcast();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // reset
  if (pathname === '/reset' && req.method === 'POST') {
    session = {
      answers: [],
      current: 0,
      total: 10,
      done: false,
      lastUpdate: Date.now()
    };
    broadcast();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // pages
  if (pathname === '/' || pathname === '/for-you.html') {
    return sendFile(res, 'for-you.html', 'text/html');
  }
  if (pathname === '/watch' || pathname === '/viewer.html') {
    return sendFile(res, 'viewer.html', 'text/html');
  }

  // static fallback
  const safe = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safe);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    return sendFile(res, safe.slice(1) || safe, types[ext] || 'application/octet-stream');
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  running on http://localhost:${PORT}`);
  console.log(`  her quiz  → http://localhost:${PORT}/`);
  console.log(`  your view → http://localhost:${PORT}/watch\n`);
});
