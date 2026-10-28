import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testInteractions() {
  const port = 9333;
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
    await sendCmd('Page.enable');

    await wait(1000);

    // Test 1: Check All Routes in Single Mode
    const testRoutesRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const results = [];
          for (const r of app.routes) {
            app.selectRoute(r.id);
            const table = document.querySelector('table.ch3-word-table');
            const thead = table ? table.querySelector('thead') : null;
            const metaRows = table ? Array.from(table.querySelectorAll('tr.ch3-row-meta')).map(row => {
              const label = row.querySelector('td.meta-label');
              const val = row.querySelector('td.meta-value');
              const lRect = label.getBoundingClientRect();
              const vRect = val.getBoundingClientRect();
              return {
                label: label.innerText.trim(),
                overflow: lRect.right > vRect.left + 0.5,
                lWidth: lRect.width,
                vWidth: vRect.width
              };
            }) : [];

            results.push({
              routeId: r.id,
              cityPair: r.cityPair,
              hasThead: !!thead,
              metaRowsCount: metaRows.length,
              hasOverflow: metaRows.some(m => m.overflow),
              metaDetails: metaRows
            });
          }
          return results;
        })()
      `,
      returnByValue: true
    });

    console.log('--- Single Mode Route Audit ---');
    const routeResults = testRoutesRes.result.result.value;
    for (const res of routeResults) {
      console.log(`Route ${res.routeId} (${res.cityPair}): thead=${res.hasThead}, metaRows=${res.metaRowsCount}, overflow=${res.hasOverflow}`);
      if (res.hasOverflow) {
        console.error('OVERFLOW IN ROUTE:', res);
      }
    }

    // Test 2: Continuous Region Mode
    console.log('\n--- Continuous Region Mode Audit ---');
    const contRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.switchCh3ViewMode('region');
          const tables = Array.from(document.querySelectorAll('table.ch3-word-table'));
          return {
            tablesCount: tables.length,
            allHaveThead: tables.every(t => !!t.querySelector('thead')),
            allHaveTitle: tables.every(t => !!t.querySelector('tr.ch3-row-title'))
          };
        })()
      `,
      returnByValue: true
    });
    if (contRes.result.exceptionDetails) {
      console.error('Continuous Mode Error:', JSON.stringify(contRes.result.exceptionDetails, null, 2));
    } else {
      console.log('Continuous Mode Result:', contRes.result.result?.value);
    }

    // Test 3: Chapter 4 Tab & Airport Table View
    console.log('\n--- Chapter 4 Airports Audit ---');
    const ch4Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.switchTab('airports');
          const hero = document.querySelector('.ch4-airport-hero');
          const tables = Array.from(document.querySelectorAll('table.ch4-word-table'));
          return {
            hasHero: !!hero,
            heroText: hero ? hero.innerText.trim().replace(/\\n/g, ' ') : '',
            tablesCount: tables.length,
            tableStyles: tables.map(t => ({
              width: t.getBoundingClientRect().width,
              headers: Array.from(t.querySelectorAll('th, td.ch4-yellow-header')).map(h => h.innerText.trim())
            }))
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Chapter 4 Result:', ch4Res.result.result.value);

    // Test 4: Viewport resizing test
    console.log('\n--- Viewport Responsiveness Test ---');
    for (const w of [1440, 1024, 768, 640]) {
      await sendCmd('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false
      });
      await wait(300);

      const vpRes = await sendCmd('Runtime.evaluate', {
        expression: `
          (() => {
            const app = window.vnaApp;
            app.switchTab('routes');
            app.switchCh3ViewMode('single');
            const wrapper = document.querySelector('.ch3-table-wrapper');
            const table = document.querySelector('table.ch3-word-table');
            const metaOverlaps = Array.from(document.querySelectorAll('tr.ch3-row-meta')).some(row => {
              const l = row.querySelector('td.meta-label').getBoundingClientRect();
              const v = row.querySelector('td.meta-value').getBoundingClientRect();
              return l.right > v.left + 0.5;
            });
            return {
              viewportWidth: window.innerWidth,
              wrapperScrollWidth: wrapper ? wrapper.scrollWidth : 0,
              wrapperClientWidth: wrapper ? wrapper.clientWidth : 0,
              hasScrollbar: wrapper ? (wrapper.scrollWidth > wrapper.clientWidth) : false,
              tableWidth: table ? table.getBoundingClientRect().width : 0,
              metaOverlaps
            };
          })()
        `,
        returnByValue: true
      });
      if (vpRes.result.exceptionDetails) {
        console.error(`Width ${w}px Error:`, JSON.stringify(vpRes.result.exceptionDetails, null, 2));
      } else {
        console.log(`Width ${w}px:`, vpRes.result.result?.value);
      }
    }

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

testInteractions().catch(console.error);
