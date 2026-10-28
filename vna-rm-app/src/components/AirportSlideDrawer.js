/**
 * VNA Route Manual v4.0 - Airport Slide-over Drawer
 * Smooth right-sliding detail panel displaying full Chapter 4 assessment table
 * and related Chapter 3 flight routes without losing reading context.
 */

import { Chapter4TableView } from './Chapter4TableView.js';

export class AirportSlideDrawer {
  /**
   * @param {Object} options
   * @param {Map<string, Object>} options.airportMap
   * @param {Object} options.airportRouteIndex
   * @param {Map<string, Object>} options.routeMap
   * @param {(routeId: string) => void} options.onSelectRoute
   * @param {(imageItem: Object, allImages: Array) => void} options.onImageClick
   */
  constructor(options = {}) {
    this.airportMap = options.airportMap || new Map();
    this.airportRouteIndex = options.airportRouteIndex || {};
    this.routeMap = options.routeMap || new Map();
    this.onSelectRoute = options.onSelectRoute || (() => {});
    this.onImageClick = options.onImageClick || (() => {});

    this.tableRenderer = new Chapter4TableView({
      onImageClick: (img, all) => this.onImageClick(img, all)
    });

    this.drawerEl = null;
    this.backdropEl = null;
    this.isPinned = false;
    this.history = [];
    this.historyIdx = -1;
    this.currentIcao = null;

    this.initElements();
    this.attachEvents();
  }

  updateData(airportMap, routeIndex, routeMap) {
    this.airportMap = airportMap;
    this.airportRouteIndex = routeIndex;
    this.routeMap = routeMap;
  }

  initElements() {
    let backdrop = document.getElementById('airportDrawerBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'airportDrawerBackdrop';
      backdrop.className = 'drawer-backdrop';
      document.body.appendChild(backdrop);
    }
    this.backdropEl = backdrop;

    let drawer = document.getElementById('airportSlideDrawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'airportSlideDrawer';
      drawer.className = 'slide-over-drawer';
      drawer.innerHTML = `
        <div class="drawer-header">
          <div class="drawer-title-area">
            <span class="drawer-airport-code" id="drawerAirportCode">----</span>
            <div class="drawer-airport-title">
              <span class="drawer-airport-name" id="drawerAirportName">Tên sân bay</span>
              <span class="drawer-airport-meta" id="drawerAirportMeta">Quốc gia • Danh mục</span>
            </div>
          </div>

          <div class="drawer-controls">
            <button class="btn btn-outline btn-sm" id="drawerFullPageBtn" title="Mở toàn trang tại Chương 4">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              <span>Mở toàn trang</span>
            </button>
            <button class="btn btn-outline btn-sm" id="drawerBackBtn" title="Quay lại">◀</button>
            <button class="btn btn-outline btn-sm" id="drawerFwdBtn" title="Tiến tới">▶</button>
            <button class="btn btn-ghost btn-sm" id="drawerCloseBtn" style="font-size:20px; line-height:1;" title="Đóng (ESC)">&times;</button>
          </div>
        </div>

        <div class="drawer-body" id="drawerBodyScroll">
          <div id="drawerRelatedRoutesContainer"></div>
          <div id="drawerAirportTableContainer"></div>
        </div>
      `;
      document.body.appendChild(drawer);
    }
    this.drawerEl = drawer;
  }

  attachEvents() {
    this.backdropEl.onclick = () => {
      if (!this.isPinned) this.close();
    };

    this.drawerEl.querySelector('#drawerCloseBtn').onclick = () => this.close();

    this.drawerEl.querySelector('#drawerFullPageBtn').onclick = () => {
      if (this.currentIcao && window.vnaApp) {
        this.close();
        window.vnaApp.showDetail('airport', this.currentIcao);
      }
    };

    this.drawerEl.querySelector('#drawerBackBtn').onclick = () => this.navigateHistory(-1);
    this.drawerEl.querySelector('#drawerFwdBtn').onclick = () => this.navigateHistory(1);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Listen to airport click buttons anywhere to open in drawer
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.airport-chip-link');
      if (chip && chip.dataset.icao) {
        e.preventDefault();
        const icao = chip.dataset.icao.toUpperCase();
        this.open(icao);
      }
    });
  }

  isOpen() {
    return this.drawerEl && this.drawerEl.classList.contains('active');
  }

  open(icao) {
    const cleanIcao = icao.toUpperCase();
    const apt = this.airportMap.get(cleanIcao);
    if (!apt) {
      console.warn(`[SlideDrawer] Airport ${cleanIcao} not found in database.`);
      if (window.vnaApp && typeof window.vnaApp.showToast === 'function') {
        window.vnaApp.showToast(`Sân bay ${cleanIcao} chưa được nạp. Hãy nạp file CHAPTER 4_REV04.docx để xem.`);
      }
      return;
    }

    // Add to history
    if (this.history[this.historyIdx] !== cleanIcao) {
      this.history = this.history.slice(0, this.historyIdx + 1);
      this.history.push(cleanIcao);
      this.historyIdx = this.history.length - 1;
    }

    this.currentIcao = cleanIcao;
    this.renderAirport(apt);

    this.drawerEl.classList.add('active');
    this.backdropEl.classList.add('active');

    // Reset drawer scroll to top
    const bodyScroll = this.drawerEl.querySelector('#drawerBodyScroll');
    if (bodyScroll) {
      bodyScroll.scrollTo({ top: 0, behavior: 'instant' });
    }

    // Update breadcrumb with drawer trail
    if (window.vnaApp && typeof window.vnaApp.updateBreadcrumb === 'function') {
      window.vnaApp.updateBreadcrumb({ inDrawer: true, drawerIcao: cleanIcao });
    }
  }

  close() {
    if (this.drawerEl) this.drawerEl.classList.remove('active');
    if (this.backdropEl) this.backdropEl.classList.remove('active');

    // Reset breadcrumb
    if (window.vnaApp && typeof window.vnaApp.updateBreadcrumb === 'function') {
      window.vnaApp.updateBreadcrumb({ inDrawer: false });
    }
  }

  navigateHistory(direction) {
    const newIdx = this.historyIdx + direction;
    if (newIdx >= 0 && newIdx < this.history.length) {
      this.historyIdx = newIdx;
      const targetIcao = this.history[newIdx];
      const apt = this.airportMap.get(targetIcao);
      if (apt) {
        this.currentIcao = targetIcao;
        this.renderAirport(apt);
      }
    }
  }

  renderAirport(apt) {
    const codeEl = this.drawerEl.querySelector('#drawerAirportCode');
    const nameEl = this.drawerEl.querySelector('#drawerAirportName');
    const metaEl = this.drawerEl.querySelector('#drawerAirportMeta');
    const backBtn = this.drawerEl.querySelector('#drawerBackBtn');
    const fwdBtn = this.drawerEl.querySelector('#drawerFwdBtn');

    codeEl.innerText = `${apt.icao} / ${apt.iata || '---'}`;
    nameEl.innerText = apt.name || 'Unknown Aerodrome';
    metaEl.innerText = `${apt.country || 'N/A'} • CAT ${apt.category || 'A'} • RFFS ${apt.rffsCategory || 'N/A'}`;

    backBtn.disabled = this.historyIdx <= 0;
    fwdBtn.disabled = this.historyIdx >= this.history.length - 1;

    // Render Related Routes
    this.renderRelatedRoutes(apt.icao);

    // Render Full Chapter 4 Table
    const tableContainer = this.drawerEl.querySelector('#drawerAirportTableContainer');
    tableContainer.innerHTML = this.tableRenderer.render(apt);
  }

  renderRelatedRoutes(icao) {
    const container = this.drawerEl.querySelector('#drawerRelatedRoutesContainer');
    if (!container) return;

    const data = this.airportRouteIndex[icao.toUpperCase()];
    if (!data || !data.allRoutes || data.allRoutes.size === 0) {
      container.innerHTML = `
        <div style="font-size:12px; color:var(--text-secondary); background:#FFFFFF; padding:10px 14px; border:1px solid var(--stroke-1); border-radius:var(--radius-md);">
          Sân bay này hiện không có đường bay trực tiếp trong Chương 3 (hoạt động như sân bay dự bị hoặc quá cảnh).
        </div>
      `;
      return;
    }

    const routeBadges = Array.from(data.allRoutes).map(rId => {
      const r = this.routeMap.get(rId);
      const label = r ? `${r.id}: ${r.cityPair}` : rId;
      return `
        <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.selectRouteFromDrawer('${rId}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    }).join(' ');

    container.innerHTML = `
      <div style="background:#FFFFFF; border:1px solid var(--stroke-1); border-radius:var(--radius-md); padding:12px 14px;">
        <div style="font-size:12px; font-weight:700; color:var(--vna-primary); margin-bottom:8px;">
          Các chặng bay liên quan trong Chương 3 (${data.allRoutes.size}):
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${routeBadges}</div>
      </div>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
