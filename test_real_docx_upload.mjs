import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testRealUpload() {
  console.log('Reading docx files from disk...');
  const ch3Buf = fs.readFileSync('CHAPTER 3_NEW_AMD.docx');
  const ch3Base64 = ch3Buf.toString('base64');
  console.log(`Loaded CHAPTER 3: ${(ch3Buf.length / 1024 / 1024).toFixed(2)} MB`);

  const port = 9555;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1280,900',
    FILE_URL
  ]);

  try {
    await wait(2500);
    const jsonRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await jsonRes.json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    function sendCmd(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCmd('Runtime.enable');
    await wait(1000);

    console.log('Populating file inputs and triggering startParseFiles()...');
    const uploadRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const b64 = "${ch3Base64}";
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const file = new File([bytes], 'CHAPTER 3_NEW_AMD.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const dt = new DataTransfer();
            dt.items.add(file);
            document.getElementById('fileCh3Input').files = dt.files;

            // Trigger parsing
            await window.vnaApp.startParseFiles();

            return {
              success: true,
              routesCount: window.vnaApp.routes.length,
              statusText: document.getElementById('parseStatusLog') ? document.getElementById('parseStatusLog').innerText : ''
            };
          } catch (e) {
            return { error: e.stack || e.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Upload Result:', uploadRes.result.result.value);

    // Wait for parse completion
    await wait(2000);

    // Audit parsed routes
    const auditRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          let totalRoutes = app.routes.length;
          let missingHeaders = 0;
          let overlaps = 0;
          const sample = [];

          for (let i = 0; i < Math.min(20, totalRoutes); i++) {
            const r = app.routes[i];
            app.selectRoute(r.id);
            const table = document.querySelector('table.ch3-word-table');
            const th = table ? table.querySelector('thead tr.ch3-row-header') : null;
            if (!th) missingHeaders++;

            const rows = table ? Array.from(table.querySelectorAll('tr.ch3-row-meta')) : [];
            for (const row of rows) {
              const l = row.querySelector('td.meta-label');
              const v = row.querySelector('td.meta-value');
              if (l && v) {
                const lRect = l.getBoundingClientRect();
                const vRect = v.getBoundingClientRect();
                if (lRect.right > vRect.left + 0.5) {
                  overlaps++;
                }
              }
            }

            if (i < 3) {
              sample.push({
                id: r.id,
                cityPair: r.cityPair,
                headers: th ? Array.from(th.querySelectorAll('th')).map(t => t.innerText.trim()) : []
              });
            }
          }

          return {
            totalRoutes,
            missingHeaders,
            overlaps,
            sample
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Audit of dynamic parsed routes:', auditRes.result.result.value);

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

testRealUpload().catch(console.error);
