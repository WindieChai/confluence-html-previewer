import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8766;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers));
  res.end(body);
}

function resolveFile(pathname) {
  var rel = pathname.replace(/^\/+/, '');
  var file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (url.pathname.startsWith('/download/attachments/')) {
      const html = await readFile(join(root, 'examples/sample.html'));
      send(res, 200, html, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sample.html"',
      });
      return;
    }

    var pathname = url.pathname;
    if (pathname === '/') pathname = '/examples/preview.html';
    if (pathname === '/html-previewer.init.js') pathname = '/dist/html-previewer.init.js';

    const file = resolveFile(pathname);
    if (!file) {
      send(res, 403, 'Forbidden');
      return;
    }
    const data = await readFile(file);
    send(res, 200, data, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
    });
  } catch (err) {
    send(res, err && err.code === 'ENOENT' ? 404 : 500, err && err.code === 'ENOENT' ? 'Not found' : 'Error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('http://127.0.0.1:' + port + '/');
});
