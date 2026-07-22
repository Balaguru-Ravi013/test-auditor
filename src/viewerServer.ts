// src/viewerServer.ts
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Package root whether running from dist/ or src/ */
const packageRoot = path.resolve(__dirname, '..');
const viewerDir = path.join(packageRoot, 'viewer');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === 'darwin') {
    await execa('open', [url], { reject: false });
  } else if (platform === 'win32') {
    await execa('cmd', ['/c', 'start', '', url], { reject: false });
  } else {
    await execa('xdg-open', [url], { reject: false });
  }
}

function waitForExit(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    process.once('SIGINT', done);
    process.once('SIGTERM', done);
  });
}

/**
 * Serve the package viewer and the generated report, open the browser,
 * and keep the process alive until Ctrl+C.
 */
export async function openReportViewer(reportPath: string): Promise<string> {
  const absoluteReport = path.resolve(reportPath);
  if (!fs.existsSync(viewerDir)) {
    throw new Error(`Viewer not found at ${viewerDir}`);
  }
  if (!fs.existsSync(absoluteReport)) {
    throw new Error(`Report not found at ${absoluteReport}`);
  }

  const server = http.createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] || '/';

    if (urlPath === '/report.md') {
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(absoluteReport).pipe(res);
      return;
    }

    const safePath =
      urlPath === '/' ? '/index.html' : path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(viewerDir, safePath);

    if (!filePath.startsWith(viewerDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  const port: number = await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('Could not bind viewer server'));
    });
    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}/`;
  await openBrowser(url);

  // Keep serving until the user stops the CLI.
  await waitForExit();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return url;
}
