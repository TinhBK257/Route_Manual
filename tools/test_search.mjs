import { spawn } from 'child_process';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function testSearch() {
  const port = 9557;
  const proc = spawn(CHROME_PATH, ['--headless=new', `--remote-debugging-port=${port}`, '--disable-gpu', '--no-sandbox', FILE_URL]);
  await new Promise(r => setTimeout(r, 2500));
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  const send = (m, p={}) => new Promise(res => {
    const cur = id++;
    const handler = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === cur) { ws.removeEventListener('message', handler); res(d); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({id: cur, method: m, params: p}));
  });
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1500));

  const testQueries = ['depress', 'depressurization', 'depressurisation', 'escape', 'giảm áp', 'chapter 9'];
  const results = {};

  for (const q of testQueries) {
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const nav = window.vnaApp.sidebarNav;
        nav.searchQuery = ${JSON.stringify(q)};
        nav.renderRoutesList();
        const cards = Array.from(document.querySelectorAll('.item-card'));
        return {
          count: cards.length,
          matchedRoutes: cards.map(c => c.querySelector('.card-title')?.textContent?.trim())
        };
      })()`,
      returnByValue: true
    });
    results[q] = res.result.result.value;
  }

  console.log('Search test results:\n', JSON.stringify(results, null, 2));

  for (const [q, val] of Object.entries(results)) {
    if (val.count !== 3) {
      throw new Error(`Search failed for '${q}': expected 3 routes, got ${val.count}`);
    }
  }
  console.log('\n[PASS] All 6 search queries matched all 3 European depressurization routes!');

  ws.close();
  proc.kill();
}
testSearch().catch(err => {
  console.error(err);
  process.exit(1);
});
