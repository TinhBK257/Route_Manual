import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runChromeAudit(targetUrl, label) {
  console.log(`\n========================================`);
  console.log(`TESTING [${label}]: ${targetUrl}`);
  console.log(`========================================`);

  const port = 9222 + Math.floor(Math.random() * 100);
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1280,900',
    targetUrl
  ]);

  try {
    await wait(2500);

    const jsonRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await jsonRes.json();
    const pageTab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
    if (!pageTab) {
      throw new Error('No page tab found in Chrome!');
    }

    console.log(`Connected to tab: ${pageTab.title} (${pageTab.url})`);
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    const consoleLogs = [];
    const exceptions = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push(`[CONSOLE ${data.params.type}] ${text}`);
      } else if (data.method === 'Runtime.exceptionThrown') {
        exceptions.push(`[EXCEPTION] ${data.params.exceptionDetails.text} ${data.params.exceptionDetails.exception?.description || ''} url: ${data.params.exceptionDetails.url} line: ${data.params.exceptionDetails.lineNumber}`);
        console.error('FULL EXCEPTION DETAILS:', JSON.stringify(data.params.exceptionDetails, null, 2));
      }
    };

    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    function sendCmd(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCmd('Runtime.enable');
    await sendCmd('Page.enable');

    // Wait for DOM to settle and data to load
    await wait(1500);

    // 1. Evaluate general app status & console errors
    const evalRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const table = document.querySelector('table.ch3-word-table');
          const thead = table ? table.querySelector('thead') : null;
          const ths = thead ? Array.from(thead.querySelectorAll('th')).map(th => ({
            text: th.innerText.trim(),
            width: th.getBoundingClientRect().width,
            colspan: th.getAttribute('colspan') || '1'
          })) : [];

          const titleRow = table ? table.querySelector('tr.ch3-row-title') : null;
          const titleChips = titleRow ? Array.from(titleRow.querySelectorAll('.airport-chip-link')).map(c => ({
            text: c.innerText.trim(),
            bg: window.getComputedStyle(c).backgroundColor,
            color: window.getComputedStyle(c).color,
            border: window.getComputedStyle(c).border
          })) : [];

          const metaRows = table ? Array.from(table.querySelectorAll('tr.ch3-row-meta')).map(r => {
            const labelCell = r.querySelector('td.meta-label');
            const valueCell = r.querySelector('td.meta-value');
            const lRect = labelCell ? labelCell.getBoundingClientRect() : null;
            const vRect = valueCell ? valueCell.getBoundingClientRect() : null;
            const lStyle = labelCell ? window.getComputedStyle(labelCell) : null;
            return {
              label: labelCell ? labelCell.innerText.trim() : '',
              value: valueCell ? valueCell.innerText.trim().substring(0, 40) : '',
              labelWidth: lRect ? lRect.width : 0,
              valueWidth: vRect ? vRect.width : 0,
              labelRight: lRect ? lRect.right : 0,
              valueLeft: vRect ? vRect.left : 0,
              whiteSpace: lStyle ? lStyle.whiteSpace : '',
              overflows: lRect && vRect ? (lRect.right > vRect.left + 1) : false
            };
          }) : [];

          const altCells = table ? Array.from(table.querySelectorAll('td.cell-dest-alt')).map(c => c.innerText.trim()) : [];

          return {
            hasApp: !!app,
            routesCount: app ? app.routes.length : 0,
            airportsCount: app ? app.airports.length : 0,
            currentTab: app ? app.currentTab : '',
            tableExists: !!table,
            theadExists: !!thead,
            ths,
            titleChips,
            metaRows,
            altCells
          };
        })()
      `,
      returnByValue: true
    });

    const report = evalRes.result?.result?.value || evalRes.result?.value || null;
    console.log('Console logs count:', consoleLogs.length, 'Exceptions:', exceptions.length);
    for (const ex of exceptions) console.error(ex);
    for (const log of consoleLogs) console.log(log);

    if (!report) {
      console.error('Eval error:', evalRes);
      return;
    }
    console.log('App Loaded:', report.hasApp, `Routes: ${report.routesCount}, Airports: ${report.airportsCount}`);
    console.log('Table Exists:', report.tableExists, 'Thead Exists:', report.theadExists);
    console.log('Table Headers:', report.ths);
    console.log('Title Chips in Banner:', report.titleChips);
    console.log('Meta Rows Count:', report.metaRows.length);

    let hasOverlap = false;
    for (const m of report.metaRows) {
      if (m.overflows) {
        console.error(`COLLISION DETECTED in row "${m.label}": labelRight=${m.labelRight} > valueLeft=${m.valueLeft}`);
        hasOverlap = true;
      }
    }
    if (!hasOverlap) {
      console.log('✓ NO METADATA OVERLAP DETECTED! All labelRight <= valueLeft.');
    }

    console.log('Destination Alternates sample:', report.altCells);

    // Capture screenshot
    const shotRes = await sendCmd('Page.captureScreenshot', { format: 'png' });
    if (shotRes && shotRes.result && shotRes.result.data) {
      const buf = Buffer.from(shotRes.result.data, 'base64');
      fs.writeFileSync(`audit_screenshot_${label}.png`, buf);
      console.log(`Saved screenshot: audit_screenshot_${label}.png`);
    }

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

async function main() {
  // Test 1: File protocol
  await runChromeAudit(FILE_URL, 'file_proto');

  // Test 2: HTTP server protocol
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    let filePath = path.join(APP_DIR, reqPath === '/' ? 'index.html' : reqPath);
    console.log(`[HTTP REQ] ${req.method} ${req.url} -> ${filePath}`);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      console.error(`[HTTP 404] File not found: ${filePath}`);
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const httpPort = 8089;
  await new Promise(r => server.listen(httpPort, r));
  console.log(`Local test server running on http://127.0.0.1:${httpPort}`);

  try {
    await runChromeAudit(`http://127.0.0.1:${httpPort}/`, 'http_server');
  } finally {
    server.close();
  }
}

main().catch(console.error);
