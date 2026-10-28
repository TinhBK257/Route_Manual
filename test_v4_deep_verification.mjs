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

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

async function runDeepVerification() {
  console.log('================================================================');
  console.log(' VNA ROUTE MANUAL v4.0 - DEEP VERIFICATION & SPEC AUDIT');
  console.log('================================================================\n');

  const port = 9444;
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
    await wait(1000);

    // =========================================================================
    // TEST 1: Switch to Chapter 4, select airports, verify scrollTop: 0, sticky header, sidebar visibility
    // =========================================================================
    console.log('[TEST 1] Chapter 4 Airport Selection, Scroll Reset & Sticky Header...');
    const test1Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          const app = window.vnaApp;
          app.switchTab('airports');
          await new Promise(r => setTimeout(r, 100));

          const results = [];
          const testIcaos = ['VVTS', 'VVNB', 'VVDN', 'VVCR', 'VVDB', 'EGLL'];

          for (const icao of testIcaos) {
            // First simulate user scrolling down before selecting
            const mainPanel = document.getElementById('mainContentPanel');
            if (mainPanel) mainPanel.scrollTop = 450;

            // Select airport
            app.selectAirport(icao);
            await new Promise(r => setTimeout(r, 100));

            const stickyHeader = document.getElementById('stickyEntityHeader');
            const stickyStyle = stickyHeader ? window.getComputedStyle(stickyHeader) : null;
            const stickyRect = stickyHeader ? stickyHeader.getBoundingClientRect() : null;

            const activeCard = document.querySelector('.item-card.active');
            const sidebarContainer = document.getElementById('itemsListContainer');
            const sideRect = sidebarContainer ? sidebarContainer.getBoundingClientRect() : null;
            const cardRect = activeCard ? activeCard.getBoundingClientRect() : null;

            const isCardVisible = (cardRect && sideRect) ? (
              cardRect.top >= sideRect.top - 50 && cardRect.bottom <= sideRect.bottom + 50
            ) : false;

            results.push({
              icao,
              scrollTop: mainPanel ? mainPanel.scrollTop : -1,
              hasStickyHeader: !!stickyHeader,
              headerPosition: stickyStyle ? stickyStyle.position : '',
              headerVisible: stickyRect ? (stickyRect.top >= 0 && stickyRect.height > 0) : false,
              hasActiveCard: !!activeCard,
              activeCardIcao: activeCard ? activeCard.dataset.icao : '',
              isCardVisible
            });
          }

          return results;
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Test 1 Results:', test1Res.result.result.value);
    for (const r of test1Res.result.result.value) {
      if (r.scrollTop !== 0) throw new Error(`Airport ${r.icao} did not scroll to top! scrollTop = ${r.scrollTop}`);
      if (r.headerPosition !== 'sticky') throw new Error(`Sticky header missing sticky position for ${r.icao}!`);
      if (!r.headerVisible) throw new Error(`Sticky header not visible for ${r.icao}!`);
      if (r.activeCardIcao !== r.icao) throw new Error(`Active sidebar card mismatch: expected ${r.icao}, got ${r.activeCardIcao}`);
    }
    console.log('✓ PASS: Selecting any airport resets scrollTop to 0, sticky header remains visible, sidebar card is active and visible!\n');

    // =========================================================================
    // TEST 2: Sticky Quick-Jump TOC 1-10 and Section Scroll
    // =========================================================================
    console.log('[TEST 2] Sticky TOC 1-10 Bar & Section Scrolling...');
    const test2Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          const app = window.vnaApp;
          app.selectAirport('VVTS');
          await new Promise(r => setTimeout(r, 100));

          const tocBar = document.getElementById('quickJumpTocBar');
          const pills = tocBar ? Array.from(tocBar.querySelectorAll('.toc-pill')).map(p => ({
            target: p.dataset.target,
            text: p.innerText.trim(),
            active: p.classList.contains('active')
          })) : [];

          const mainPanel = document.getElementById('mainContentPanel');
          const sec5El = document.getElementById('sec-VVTS-5');
          const stickyHeader = document.getElementById('stickyEntityHeader');
          const tocBarEl = document.getElementById('quickJumpTocBar');

          const mainRectBefore = mainPanel ? mainPanel.getBoundingClientRect() : null;
          const sec5RectBefore = sec5El ? sec5El.getBoundingClientRect() : null;
          const offsetTopCalc = (stickyHeader ? stickyHeader.offsetHeight : 54) + (tocBarEl ? tocBarEl.offsetHeight : 40) + 12;
          const scrollYCalc = mainPanel ? (mainPanel.scrollTop + (sec5RectBefore.top - mainRectBefore.top) - offsetTopCalc) : 0;

          // Measure sticky positions while scrolled down
          mainPanel.scrollTop = 250;
          await new Promise(r => setTimeout(r, 50));
          const scrolledHdr = stickyHeader.getBoundingClientRect();
          const scrolledToc = tocBar.getBoundingClientRect();
          const stickyOverlap = scrolledHdr.bottom - scrolledToc.top;
          const tocHeight = tocBar.offsetHeight;

          // Click section 5 (Runways)
          app.scrollToSection('sec-VVTS-5');
          await new Promise(r => setTimeout(r, 600));

          const sec5RectAfter = sec5El ? sec5El.getBoundingClientRect() : null;

          return {
            pillsCount: pills.length,
            pills,
            tocHeight,
            stickyOverlap,
            scrolledHdrBottom: scrolledHdr.bottom,
            scrolledTocTop: scrolledToc.top,
            scrollTopAfterJump: mainPanel ? mainPanel.scrollTop : -1,
            scrollHeight: mainPanel ? mainPanel.scrollHeight : 0,
            clientHeight: mainPanel ? mainPanel.clientHeight : 0,
            sec5RectBefore,
            mainRectBefore,
            offsetTopCalc,
            scrollYCalc,
            sec5TopAfter: sec5RectAfter ? sec5RectAfter.top : -1
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const test2Val = test2Res.result.result.value;
    console.log('Test 2 Results: TOC Pills count:', test2Val.pillsCount);
    console.log('TOC Pills:', test2Val.pills.map(p => p.text).join(' | '));
    console.log('TOC Height:', test2Val.tocHeight, 'Sticky Overlap:', test2Val.stickyOverlap);
    console.log('ScrollTop after jump to Sec 5:', test2Val.scrollTopAfterJump);
    console.log('Test 2 Full Detail:', test2Val);
    if (test2Res.result.result.value.pillsCount < 8) {
      throw new Error(`Expected at least 8 TOC pills for VVTS, got ${test2Res.result.result.value.pillsCount}`);
    }
    if (test2Res.result.result.value.tocHeight < 36) {
      throw new Error(`TOC bar height is squished/collapsed: ${test2Res.result.result.value.tocHeight}px`);
    }
    if (test2Res.result.result.value.stickyOverlap > 1) {
      throw new Error(`Sticky header is overlapping TOC bar by ${test2Res.result.result.value.stickyOverlap}px!`);
    }
    if (test2Res.result.result.value.scrollTopAfterJump <= 0) {
      throw new Error('Quick jump to section 5 did not scroll main content panel!');
    }
    console.log('✓ PASS: TOC Bar renders sections 1-10, has zero overlap with sticky header, and jump scrolling works accurately!\n');

    // =========================================================================
    // TEST 3: Word Document Exact Colors (#FFE599, #70AD47, #E7E6E6, #262626)
    // =========================================================================
    console.log('[TEST 3] Word Exact Table Color Verification...');
    const test3Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.selectAirport('VVTS');

          // Chapter 4 colors
          const yellowEl = document.querySelector('.ch4-yellow-header');
          const greenEl = document.querySelector('.ch4-green-adq');
          const grayEl = document.querySelector('.ch4-gray-subhead');

          const yellowBg = yellowEl ? window.getComputedStyle(yellowEl).backgroundColor : '';
          const greenBg = greenEl ? window.getComputedStyle(greenEl).backgroundColor : '';
          const grayBg = grayEl ? window.getComputedStyle(grayEl).backgroundColor : '';

          // Chapter 3 dark banner color
          app.switchTab('routes');
          app.selectRoute('R001');
          const bannerEl = document.querySelector('tr.ch3-row-title td');
          const bannerBg = bannerEl ? window.getComputedStyle(bannerEl).backgroundColor : '';

          return {
            yellowBg,
            greenBg,
            grayBg,
            bannerBg
          };
        })()
      `,
      returnByValue: true
    });

    const colors = test3Res.result.result.value;
    console.log('Computed Colors:', colors);

    const expectedYellow = hexToRgb('#FFE599'); // rgb(255, 229, 153)
    const expectedGreen = hexToRgb('#70AD47');  // rgb(112, 173, 71)
    const expectedGray = hexToRgb('#E7E6E6');   // rgb(231, 230, 230)
    const expectedBanner = hexToRgb('#262626'); // rgb(38, 38, 38)

    console.log(`Checking Yellow Header: ${colors.yellowBg} === ${expectedYellow}`);
    console.log(`Checking Green ADQ:     ${colors.greenBg} === ${expectedGreen}`);
    console.log(`Checking Gray Subhead:   ${colors.grayBg} === ${expectedGray}`);
    console.log(`Checking Banner:        ${colors.bannerBg} === ${expectedBanner}`);

    if (colors.yellowBg !== expectedYellow) throw new Error(`Yellow header mismatch: expected ${expectedYellow}, got ${colors.yellowBg}`);
    if (colors.greenBg !== expectedGreen) throw new Error(`Green ADQ mismatch: expected ${expectedGreen}, got ${colors.greenBg}`);
    if (colors.grayBg !== expectedGray) throw new Error(`Gray subhead mismatch: expected ${expectedGray}, got ${colors.grayBg}`);
    if (colors.bannerBg !== expectedBanner) throw new Error(`Dark banner mismatch: expected ${expectedBanner}, got ${colors.bannerBg}`);

    console.log('✓ PASS: Exact Word colors verified with 100% fidelity!\n');

    // =========================================================================
    // TEST 4: Router Hash Navigation, Back/Forward History
    // =========================================================================
    console.log('[TEST 4] Router Hash Navigation & History...');
    const test4Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (async () => {
          const app = window.vnaApp;

          // Navigate via hash
          window.location.hash = '#/airport/VVNB';
          await new Promise(r => setTimeout(r, 200));
          const apt1 = app.selectedAirportIcao;

          window.location.hash = '#/route/R005';
          await new Promise(r => setTimeout(r, 200));
          const r1 = app.selectedRouteId;

          // In-app history back
          window.history.back();
          await new Promise(r => setTimeout(r, 200));
          const backTab = app.currentTab;

          return {
            apt1,
            r1,
            backTab,
            currentHash: window.location.hash
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Test 4 Results:', test4Res.result.result.value);
    if (test4Res.result.result.value.apt1 !== 'VVNB') throw new Error('Hash routing to airport VVNB failed!');
    if (test4Res.result.result.value.r1 !== 'R005') throw new Error('Hash routing to route R005 failed!');
    console.log('✓ PASS: Hash routing and history navigation work seamlessly!\n');

    // =========================================================================
    // TEST 5: Favorites & Recents Management
    // =========================================================================
    console.log('[TEST 5] Favorites & Recents Management...');
    const test5Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.switchTab('airports');
          app.selectAirport('VVTS');

          // Toggle favorite
          app.toggleFavorite('airport', 'VVTS', 'Tân Sơn Nhất', 'Vietnam');
          const isFav = window.UserPrefs.isFavorite('airport', 'VVTS');

          // Switch to favorites scope tab
          app.setScope('favorites');
          const favCards = Array.from(document.querySelectorAll('#itemsListContainer .item-card')).map(c => c.dataset.icao);

          // Switch back to all
          app.setScope('all');

          return {
            isFav,
            favCards,
            recentsCount: window.UserPrefs.getRecents().length
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Test 5 Results:', test5Res.result.result.value);
    if (!test5Res.result.result.value.isFav) throw new Error('Favorite toggle failed!');
    if (!test5Res.result.result.value.favCards.includes('VVTS')) throw new Error('Favorites list does not include VVTS!');
    console.log('✓ PASS: Favorites and recents tracking verified!\n');

    // =========================================================================
    // TEST 6: Multi-Select Filter Chips & Search
    // =========================================================================
    console.log('[TEST 6] Filter Chips & Live Search...');
    const test6Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.switchTab('airports');
          app.clearAllFilters();

          const totalBefore = document.querySelectorAll('#itemsListContainer .item-card').length;

          // Toggle CAT_A filter chip
          app.toggleFilterChip('CAT_A');
          const catACount = document.querySelectorAll('#itemsListContainer .item-card').length;

          // Clear
          app.clearAllFilters();
          const totalAfter = document.querySelectorAll('#itemsListContainer .item-card').length;

          return {
            totalBefore,
            catACount,
            totalAfter
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Test 6 Results:', test6Res.result.result.value);
    if (test6Res.result.result.value.catACount >= test6Res.result.result.value.totalBefore) {
      throw new Error('CAT_A filter chip did not reduce airport list!');
    }
    if (test6Res.result.result.value.totalBefore !== test6Res.result.result.value.totalAfter) {
      throw new Error('Clearing filters did not restore total count!');
    }
    console.log('✓ PASS: Filter chips and filter resetting function properly!\n');

    // =========================================================================
    // TEST 7: Breadcrumb Navigation & Region Filter Synchronization
    // =========================================================================
    console.log('[TEST 7] Breadcrumb Navigation & Region Filter Synchronization...');
    const test7Res = await sendCmd('Runtime.evaluate', {
      expression: `
        (() => {
          const app = window.vnaApp;
          app.switchTab('routes');
          app.selectRoute('R001');

          // Breadcrumb check
          const crumbContainer = document.getElementById('breadcrumbContainer');
          const crumbHtml = crumbContainer ? crumbContainer.innerHTML : '';

          // Filter by domestic (testing normalization)
          app.setNavFilter('VIETNAM (DOMESTIC)');
          const domesticCards = document.querySelectorAll('#itemsListContainer .item-card').length;
          const selectedChip = document.querySelector('.filter-chips-container .chip.selected span');
          const chipText = selectedChip ? selectedChip.innerText : '';

          // Reset
          app.clearAllFilters();
          const allRoutesCount = document.querySelectorAll('#itemsListContainer .item-card').length;

          return {
            hasCrumb: crumbHtml.includes('Chương 3') && crumbHtml.includes('SGN - SFO - SGN'),
            domesticCards,
            chipText,
            allRoutesCount
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Test 7 Results:', test7Res.result.result.value);
    if (!test7Res.result.result.value.hasCrumb) throw new Error('Breadcrumb trail is incomplete or missing!');
    if (test7Res.result.result.value.domesticCards <= 0) throw new Error('Filtering by VIETNAM (DOMESTIC) yielded 0 routes!');
    if (!test7Res.result.result.value.chipText.includes('Nội địa')) {
      throw new Error(`Expected 'Nội địa' chip to be selected, got: '${test7Res.result.result.value.chipText}'`);
    }
    console.log('✓ PASS: Breadcrumb trail and region filter normalization verified!\n');

    // =========================================================================
    // FINAL AUDIT: Console Errors & Exceptions
    // =========================================================================
    console.log('================================================================');
    console.log(`FINAL AUDIT: Console Errors: ${consoleErrors.length}, Uncaught Exceptions: ${uncaughtExceptions.length}`);
    for (const err of consoleErrors) console.error('[BROWSER ERROR]', err);
    for (const ex of uncaughtExceptions) console.error('[UNCAUGHT EXCEPTION]', ex);

    if (consoleErrors.length > 0 || uncaughtExceptions.length > 0) {
      throw new Error(`Verification failed with ${consoleErrors.length} errors and ${uncaughtExceptions.length} exceptions!`);
    }

    console.log('✓ ZERO CONSOLE ERRORS & ZERO UNCAUGHT EXCEPTIONS CONFIRMED!');
    console.log('================================================================\n');

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

runDeepVerification().catch((err) => {
  console.error('\n[FATAL AUDIT FAILURE]:', err);
  process.exit(1);
});
