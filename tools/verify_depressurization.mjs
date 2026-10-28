import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('Loading docx...');
  const ch3Buf = fs.readFileSync('CHAPTER 3_NEW_AMD.docx');
  const ch3Base64 = ch3Buf.toString('base64');

  const port = 9678;
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
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const pageTab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id && pending.has(d.id)) {
        pending.get(d.id)(d);
        pending.delete(d.id);
      }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    function sendCmd(method, params = {}) {
      return new Promise(res => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCmd('Runtime.enable');
    await wait(1500);

    // 1. Check Seed Data Rendering
    console.log('\n--- CHECK 1: SEED DATA ---');
    const seedCheck = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const seedWithDepress = app.routes.filter(r => r.depressurization);
          app.selectRoute('R003'); // HAN - LHR - HAN in seed data
          const labels = Array.from(document.querySelectorAll('.meta-label')).map(el => el.textContent.trim());
          const depressRow = Array.from(document.querySelectorAll('tr.ch3-row-meta')).find(tr => {
            const l = tr.querySelector('.meta-label');
            return l && l.textContent.toLowerCase().includes('depressur');
          });
          const depressVal = depressRow ? depressRow.querySelector('.meta-value')?.innerText?.trim() : null;
          return {
            seedDepressCount: seedWithDepress.length,
            r003DepressProp: app.routes.find(r => r.id === 'R003')?.depressurization,
            renderedLabels: labels,
            depressRowFound: !!depressRow,
            depressVal
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Seed check raw:', JSON.stringify(seedCheck, null, 2));
    console.log('Seed check:', JSON.stringify(seedCheck.result?.result?.value, null, 2));

    // 2. Upload real docx and test
    console.log('\n--- CHECK 2: UPLOAD REAL DOCX ---');
    await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          const b64 = "${ch3Base64}";
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const file = new File([bytes], 'CHAPTER 3_NEW_AMD.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          const dt = new DataTransfer();
          dt.items.add(file);
          document.getElementById('fileCh3Input').files = dt.files;
          await window.vnaApp.startParseFiles();
        })()
      `,
      awaitPromise: true
    });

    await wait(2500);

    const docxCheck = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const routesWithDepress = app.routes.filter(r => r.depressurization);
          const lhrRoutes = app.routes.filter(r => r.cityPair && r.cityPair.includes('LHR'));
          
          let renderedLhrDepress = null;
          if (lhrRoutes.length > 0) {
            app.selectRoute(lhrRoutes[0].id);
            const depressRow = Array.from(document.querySelectorAll('tr.ch3-row-meta')).find(tr => {
              const l = tr.querySelector('.meta-label');
              return l && l.textContent.toLowerCase().includes('depressur');
            });
            renderedLhrDepress = depressRow ? depressRow.querySelector('.meta-value')?.innerText?.trim() : null;
          }

          return {
            totalRoutes: app.routes.length,
            routesWithDepressCount: routesWithDepress.length,
            routesWithDepressSample: routesWithDepress.map(r => ({ id: r.id, cityPair: r.cityPair, val: r.depressurization })),
            lhrRoute: lhrRoutes[0] ? { id: lhrRoutes[0].id, cityPair: lhrRoutes[0].cityPair, depress: lhrRoutes[0].depressurization } : null,
            renderedLhrDepress
          };
        })()
      `,
      returnByValue: true
    });
    const seedVal = seedCheck.result.result.value;
    const docxVal = docxCheck.result.result.value;

    console.log('\n--- ASSERTION VERIFICATION ---');
    if (!seedVal.depressRowFound) {
      throw new Error('[FAIL] Seed check: Depressurization Procedure row was not found in rendered table!');
    }
    if (!seedVal.depressVal.includes('YES') || !seedVal.depressVal.includes('Chapter 9')) {
      throw new Error(`[FAIL] Seed check: unexpected depressVal: ${seedVal.depressVal}`);
    }
    console.log(' [+] Seed check PASSED: Depressurization Procedure rendered correctly for HAN - LHR - HAN.');

    if (docxVal.routesWithDepressCount !== 15) {
      throw new Error(`[FAIL] Docx check: expected 15 routes with depressurization, got ${docxVal.routesWithDepressCount}`);
    }
    if (!docxVal.renderedLhrDepress || !docxVal.renderedLhrDepress.includes('YES') || !docxVal.renderedLhrDepress.includes('Chapter 9')) {
      throw new Error(`[FAIL] Docx check: HAN - LHR - HAN Depressurization not rendered properly: ${docxVal.renderedLhrDepress}`);
    }
    console.log(' [+] Docx upload check PASSED: Exactly 15 routes have depressurization, and HAN - LHR - HAN displays it faithfully.');
    console.log('\n======================================================');
    console.log(' ALL DEPRESSURIZATION PROCEDURE TESTS PASSED (100%)');
    console.log('======================================================\n');

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
