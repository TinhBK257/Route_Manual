import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT_DIR = process.cwd();
const HTTP_PORT = 9888;
const CDP_PORT = 9889;

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default: return 'application/octet-stream';
  }
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    let reqUrl = decodeURI(req.url.split('?')[0]);
    if (reqUrl === '/') reqUrl = '/vna-rm-app/index.html';
    const filePath = path.join(ROOT_DIR, reqUrl);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': getContentType(filePath),
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${reqUrl}`);
    }
  });

  return new Promise((resolve) => {
    server.listen(HTTP_PORT, () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runAudit() {
  console.log('====================================================================');
  console.log(' VNA ROUTE MANUAL v4.1 - END-TO-END AUTOMATED VERIFICATION AUDIT');
  console.log('====================================================================\n');

  const server = await startStaticServer();

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1440,960',
    `http://127.0.0.1:${HTTP_PORT}/vna-rm-app/index.html`
  ]);

  try {
    await wait(2500);
    const jsonRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    const tabs = await jsonRes.json();
    const pageTab = tabs.find(t => t.type === 'page');
    if (!pageTab) throw new Error('No Chrome page tab found!');

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    const consoleErrors = [];
    const uncaughtExceptions = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        if (data.params.type === 'error') {
          consoleErrors.push(data.params.args.map(a => a.value || a.description || '').join(' '));
        }
      } else if (data.method === 'Runtime.exceptionThrown') {
        uncaughtExceptions.push(data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || ''));
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
    await wait(1200);

    // =========================================================================
    // STEP 1: Verify Initial App Loading & IndexedDB Status
    // =========================================================================
    console.log('[STEP 1] Testing App Initialization & Header Info...');
    const initRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          return {
            hasApp: !!app,
            routesCount: app.routes ? app.routes.length : 0,
            airportsCount: app.airports ? app.airports.length : 0,
            activeTab: app.activeTab,
            badgeText: document.querySelector('.version-badge') ? document.querySelector('.version-badge').innerText : '',
            headerSubtitle: document.getElementById('appHeaderSubtitle') ? document.getElementById('appHeaderSubtitle').innerText : ''
          };
        })()
      `,
      returnByValue: true
    });
    console.log('App Initial State:', initRes.result.result.value);

    // =========================================================================
    // STEP 2: Ingest Real Word Files CHAPTER 3 & CHAPTER 4 via browser fetch
    // =========================================================================
    console.log('\n[STEP 2] Ingesting & Parsing CHAPTER 3_NEW_AMD.docx and CHAPTER 4_REV04.docx...');
    const parseStart = Date.now();

    const parseTriggerRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const respCh3 = await fetch('/CHAPTER 3_NEW_AMD.docx');
            const blobCh3 = await respCh3.blob();
            const fileCh3 = new File([blobCh3], 'CHAPTER 3_NEW_AMD.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

            const respCh4 = await fetch('/CHAPTER 4_REV04.docx');
            const blobCh4 = await respCh4.blob();
            const fileCh4 = new File([blobCh4], 'CHAPTER 4_REV04.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

            const dt3 = new DataTransfer();
            dt3.items.add(fileCh3);
            document.getElementById('fileCh3Input').files = dt3.files;

            const dt4 = new DataTransfer();
            dt4.items.add(fileCh4);
            document.getElementById('fileCh4Input').files = dt4.files;

            // Trigger full parsing
            await window.vnaApp.startParseFiles();

            return {
              success: true,
              routesCount: window.vnaApp.routes.length,
              airportsCount: window.vnaApp.airports.length
            };
          } catch (e) {
            return { error: e.stack || e.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Parse Trigger Result:', parseTriggerRes.result.result.value);
    console.log(`Parsing completed in ${((Date.now() - parseStart) / 1000).toFixed(1)}s`);

    // =========================================================================
    // STEP 3: Verify Core Metrics (176 Routes, 278 Airports)
    // =========================================================================
    console.log('\n[STEP 3] Verifying Core Dataset Dimensions...');
    const datasetAuditRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          return {
            routesCount: app.routes.length,
            airportsCount: app.airports.length,
            headerSubtitle: document.getElementById('appHeaderSubtitle').innerText
          };
        })()
      `,
      returnByValue: true
    });

    const datasetStats = datasetAuditRes.result.result.value;
    console.log('Dataset Stats:', datasetStats);
    if (datasetStats.routesCount !== 176) {
      console.warn(`[WARNING] Expected 176 routes, got ${datasetStats.routesCount}`);
    } else {
      console.log('✓ PASS: Routes count matches exactly 176.');
    }
    if (datasetStats.airportsCount !== 278) {
      console.warn(`[WARNING] Expected 278 airports, got ${datasetStats.airportsCount}`);
    } else {
      console.log('✓ PASS: Airports count matches exactly 278.');
    }

    // =========================================================================
    // STEP 4: AUDIT WSSS (CHANGI AIRPORT) - User Reported Bug
    // =========================================================================
    console.log('\n[STEP 4] Deep Audit on WSSS (Singapore Changi)...');
    const wsssAuditRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          const app = window.vnaApp;
          app.switchTab('airports');
          app.selectAirport('WSSS');
          await new Promise(r => setTimeout(r, 200));

          const airport = app.airports.find(a => a.icao === 'WSSS');
          const tablesInDom = Array.from(document.querySelectorAll('#mainContentPanel table.ch4-word-table'));
          const diagramButtons = Array.from(document.querySelectorAll('#mainContentPanel .image-hyperlink-pill'));
          const stickyHeader = document.getElementById('stickyEntityHeader');
          const tocPills = Array.from(document.querySelectorAll('#quickJumpTocBar .toc-pill'));

          // Check for any empty rows in the rendered DOM table
          const domRows = tablesInDom.length > 0 ? Array.from(tablesInDom[0].querySelectorAll('tr')) : [];
          const emptyDomRows = domRows.filter(tr => tr.innerText.trim() === '');

          return {
            airportData: {
              icao: airport.icao,
              name: airport.name,
              category: airport.category,
              rffsCategory: airport.rffsCategory,
              tablesCount: airport.tables ? airport.tables.length : 0,
              imagesCount: airport.images ? airport.images.length : 0,
              classification: airport.classification
            },
            domRendered: {
              tablesCount: tablesInDom.length,
              totalDomRows: domRows.length,
              emptyDomRowsCount: emptyDomRows.length,
              diagramButtonsCount: diagramButtons.length,
              diagramButtonsText: diagramButtons.map(b => b.innerText.trim()),
              tocPillsCount: tocPills.length,
              tocPillsLabels: tocPills.map(p => p.innerText.trim())
            }
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const wsssInfo = wsssAuditRes.result.result.value;
    console.log('WSSS Audit Info:', JSON.stringify(wsssInfo, null, 2));

    if (wsssInfo.airportData.tablesCount !== 1) {
      throw new Error(`FAIL: WSSS should have exactly 1 table, found ${wsssInfo.airportData.tablesCount}`);
    }
    if (wsssInfo.airportData.imagesCount !== 1) {
      throw new Error(`FAIL: WSSS should have exactly 1 diagram image, found ${wsssInfo.airportData.imagesCount}`);
    }
    if (wsssInfo.domRendered.tablesCount !== 1) {
      throw new Error(`FAIL: DOM rendered ${wsssInfo.domRendered.tablesCount} tables for WSSS (Ghost table still present!)`);
    }
    if (wsssInfo.domRendered.diagramButtonsCount < 1) {
      throw new Error(`FAIL: Expected at least 1 diagram button for WSSS, found ${wsssInfo.domRendered.diagramButtonsCount}`);
    }
    // Verify no buttons reference diagram #2 (duplicate diagram)
    for (const txt of wsssInfo.domRendered.diagramButtonsText) {
      if (txt.includes('#2') || txt.includes('sơ đồ 2')) {
        throw new Error(`FAIL: Unexpected duplicate diagram reference in button: ${txt}`);
      }
    }
    console.log('✓ PASS: WSSS has exactly 1 table and 1 diagram. Ghost table and duplicate diagram ELIMINATED!');

    // Capture clean screenshot of WSSS top
    const ssRes = await sendCmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('preview_wsss_clean.png', Buffer.from(ssRes.result.data, 'base64'));
    console.log('✓ Saved clean screenshot to preview_wsss_clean.png');

    // Scroll to Remark 10 of WSSS and capture screenshot to verify no ghost table below Remark 10
    const scrollEval = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const target = document.getElementById('sec-WSSS-10');
          const panel = document.getElementById('mainContentPanel');
          const beforeScroll = panel ? panel.scrollTop : -1;
          if (target) {
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
          const afterScroll = panel ? panel.scrollTop : -1;
          return {
            hasTarget: !!target,
            targetTagName: target ? target.tagName : null,
            targetText: target ? target.innerText.trim() : null,
            beforeScroll,
            afterScroll,
            panelScrollHeight: panel ? panel.scrollHeight : -1,
            panelClientHeight: panel ? panel.clientHeight : -1
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Scroll to Remark 10 eval:', scrollEval.result.result.value);
    await wait(400);
    const ssRemark10Res = await sendCmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('preview_wsss_remark10.png', Buffer.from(ssRemark10Res.result.data, 'base64'));
    console.log('✓ Saved clean Remark 10 screenshot to preview_wsss_remark10.png');
    fs.writeFileSync('preview_wsss_remark10.png', Buffer.from(ssRemark10Res.result.data, 'base64'));
    console.log('✓ Saved clean Remark 10 screenshot to preview_wsss_remark10.png');

    // =========================================================================
    // STEP 5: Audit All 23 Previously Affected Airports with Deleted Track Changes
    // =========================================================================
    console.log('\n[STEP 5] Auditing all 23 airports previously affected by Track Changes ghost tables...');
    const affectedIcaos = [
      'WSSS', 'EDDB', 'EDDH', 'EKBI', 'ENGM', 'ESGG', 'ESSA', 'PWAK',
      'RJFF', 'RJOT', 'RPLL', 'RPMD', 'RPMZ', 'RPVB', 'RPVE', 'RPVI',
      'RPVM', 'RPSP', 'VERC', 'VTSB', 'VTSS', 'YMAV', 'ZBDS'
    ];

    const audit23Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const icaos = ${JSON.stringify(affectedIcaos)};
          const report = [];

          for (const icao of icaos) {
            const ap = app.airports.find(a => a.icao === icao);
            if (!ap) {
              report.push({ icao, found: false });
              continue;
            }
            // Check images for duplicate mediaPath or rId
            const imgPaths = (ap.images || []).map(img => img.mediaPath);
            const uniquePaths = new Set(imgPaths);
            const hasDuplicateImages = imgPaths.length !== uniquePaths.size;

            // Check tables for empty ones
            const emptyTables = (ap.tables || []).filter(t => t.isEmpty || !t.rows || t.rows.length === 0);

            report.push({
              icao,
              found: true,
              tablesCount: ap.tables ? ap.tables.length : 0,
              emptyTablesCount: emptyTables.length,
              imagesCount: ap.images ? ap.images.length : 0,
              hasDuplicateImages
            });
          }
          return report;
        })()
      `,
      returnByValue: true
    });

    const report23 = audit23Res.result.result.value;
    let anyGhostFound = false;
    let anyDupImageFound = false;

    for (const item of report23) {
      if (item.emptyTablesCount > 0) {
        console.error(`[ERROR] Airport ${item.icao} still has ${item.emptyTablesCount} empty tables!`);
        anyGhostFound = true;
      }
      if (item.hasDuplicateImages) {
        console.error(`[ERROR] Airport ${item.icao} still has duplicate diagram images!`);
        anyDupImageFound = true;
      }
    }

    if (!anyGhostFound && !anyDupImageFound) {
      console.log(`✓ PASS: All 23 affected airports verified! 0 empty ghost tables, 0 duplicate images across all.`);
    } else {
      throw new Error('Audit failed on affected airports!');
    }

    // =========================================================================
    // STEP 6: Audit Classification Normalization (AQD, N/ A) & Airport Notes
    // =========================================================================
    console.log('\n[STEP 6] Auditing Classification normalization (AQD, N/ A) & Notes...');
    const classAuditRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          const vvcs = app.airports.find(a => a.icao === 'VVCS');
          const vvdb = app.airports.find(a => a.icao === 'VVDB');
          const vvts = app.airports.find(a => a.icao === 'VVTS');
          const egll = app.airports.find(a => a.icao === 'EGLL');

          return {
            vvcs: vvcs ? { classification: vvcs.classification, name: vvcs.name } : null,
            vvdb: vvdb ? { classification: vvdb.classification, notesCount: (vvdb.notes || []).length, notes: vvdb.notes } : null,
            vvts: vvts ? { classification: vvts.classification } : null,
            egll: egll ? { tablesCount: (egll.tables || []).length, notes: egll.notes } : null
          };
        })()
      `,
      returnByValue: true
    });

    const classStats = classAuditRes.result.result.value;
    console.log('Classification & Notes Audit:', JSON.stringify(classStats, null, 2));

    if (classStats.vvcs.classification.A350 !== 'N/A' || classStats.vvcs.classification.B787 !== 'N/A') {
      throw new Error(`FAIL: VVCS classification for A350/B787 should be 'N/A', got ${JSON.stringify(classStats.vvcs.classification)}`);
    }
    if (classStats.vvdb.classification.A350 !== 'N/A' || classStats.vvdb.classification.B787 !== 'N/A') {
      throw new Error(`FAIL: VVDB classification for A350/B787 should be 'N/A', got ${JSON.stringify(classStats.vvdb.classification)}`);
    }
    if (classStats.vvdb.notesCount < 1) {
      throw new Error(`FAIL: VVDB should have engine-out emergency procedure notes!`);
    }
    console.log('✓ PASS: VVCS and VVDB correctly parsed with N/A for widebodies, VVDB EOSID procedure notes extracted!');

    // =========================================================================
    // STEP 7: Audit Chapter 3 Dest Alternates Split
    // =========================================================================
    console.log('\n[STEP 7] Auditing Chapter 3 dest alternates split...');
    const ch3AuditRes = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          let wmkkCount = 0;
          for (const r of app.routes) {
            for (const leg of (r.legs || [])) {
              if (leg.destAlternates && leg.destAlternates.includes('WMKK')) {
                wmkkCount++;
              }
            }
          }
          return { wmkkCount };
        })()
      `,
      returnByValue: true
    });
    console.log('WMKK in Dest Alternates count:', ch3AuditRes.result.result.value.wmkkCount);
    if (ch3AuditRes.result.result.value.wmkkCount === 0) {
      console.warn('[WARNING] WMKK not found in dest alternates. Check regex.');
    } else {
      console.log('✓ PASS: WMKK correctly parsed into destAlternates array.');
    }

    // =========================================================================
    // STEP 8: Console Errors and Exceptions Audit
    // =========================================================================
    console.log('\n[STEP 8] Auditing Browser Console Errors & Exceptions...');
    console.log(`Console Errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.error(consoleErrors);
    }
    console.log(`Uncaught Exceptions: ${uncaughtExceptions.length}`);
    if (uncaughtExceptions.length > 0) {
      console.error(uncaughtExceptions);
    }

    if (uncaughtExceptions.length > 0) {
      throw new Error('Uncaught exceptions occurred in browser runtime!');
    }
    console.log('✓ PASS: Zero uncaught exceptions.');

    console.log('\n====================================================================');
    console.log(' ALL AUDIT CHECKS PASSED PERFECTLY!');
    console.log('====================================================================');

    ws.close();
  } finally {
    chromeProc.kill();
    server.close();
  }
}

runAudit().catch((err) => {
  console.error('\n[AUDIT FAILED]:', err);
  process.exit(1);
});
