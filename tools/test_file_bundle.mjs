import { spawn } from 'child_process';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FILE_URL = 'file:///' + path.resolve('vna-rm-app/index.html').replace(/\\/g, '/');

const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  '--remote-debugging-port=9998',
  '--disable-gpu',
  '--no-sandbox',
  FILE_URL
]);

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9998/json');
    const tabs = await res.json();
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: 'JSON.stringify({ title: document.title, hasApp: !!window.vnaApp, version: document.querySelector(".version-badge")?.innerText, routes: window.vnaApp?.routes?.length })'
        }
      }));
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === 1) {
        console.log('File protocol standalone bundle check:', JSON.parse(data.result?.result?.value));
        ws.close();
        chromeProc.kill();
        process.exit(0);
      }
    };
  } catch(e) {
    console.error(e);
    chromeProc.kill();
    process.exit(1);
  }
}, 2500);
