import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_DIR = path.resolve('vna-rm-app');
const FILE_URL = 'file:///' + path.join(APP_DIR, 'index.html').replace(/\\/g, '/');

async function snap() {
  const port = 9555;
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1280,900',
    FILE_URL
  ]);
  await new Promise(r => setTimeout(r, 2500));
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
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
  await send('Page.enable');
  await send('Runtime.evaluate', { expression: 'window.vnaApp.selectRoute("R003")' });
  await new Promise(r => setTimeout(r, 1000));
  const snapRes = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('preview_lhr.png', Buffer.from(snapRes.result.data, 'base64'));
  ws.close();
  proc.kill();
  console.log('Saved preview_lhr.png');
}
snap().catch(console.error);
