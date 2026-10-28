/**
 * VNA Route Manual v4.0 - Main Application Coordinator
 * Implements strict VNA UI Styleguide Light Interface,
 * Central showDetail handler, Sticky Entity Header & TOC Bar with scroll-spy,
 * History navigation, Hash routing, Recents/Favorites, and Print support.
 */

import {
  openDatabase,
  getParsedDataset,
  saveParsedDataset,
  saveRawDocxFile,
  getMediaBlobUrl,
  clearIndexedDbCache
} from './db/idbStore.js';

import { DEFAULT_SEED_DATA } from './db/seedData.js';
import { parseChapter3Xml } from './parsers/chapter3Parser.js';
import { parseChapter4Xml } from './parsers/chapter4Parser.js';

import { SidebarNav } from './components/SidebarNav.js';
import { Chapter3TableView } from './components/Chapter3TableView.js';
import { Chapter4TableView } from './components/Chapter4TableView.js';
import { AirportHoverCard } from './components/AirportHoverCard.js';
import { AirportSlideDrawer } from './components/AirportSlideDrawer.js';
import { ImageLightboxModal } from './components/ImageLightboxModal.js';
import { UserPrefs } from './utils/userPrefs.js';
import { HashRouter } from './utils/router.js';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class VnaRouteManualApp {
  constructor() {
    this.routes = [];
    this.airports = [];
    this.routeMap = new Map();
    this.airportMap = new Map();
    this.airportRouteIndex = {};
    this.supplementarySections = [];

    this.currentTab = 'routes'; // 'routes' | 'airports' | 'ops'
    this.selectedRouteId = null;
    this.selectedAirportIcao = null;
    this.ch3ViewMode = 'single'; // 'single' | 'region'

    // Components
    this.sidebarNav = null;
    this.ch3Renderer = null;
    this.ch4Renderer = null;
    this.hoverCard = null;
    this.slideDrawer = null;
    this.lightbox = null;
    this.router = null;

    // Scroll spy
    this.tocObserver = null;
  }

  async init() {
    console.log('[VNA RM v4.0] Initializing application...');

    // 1. Initialize Lightbox Modal
    this.lightbox = new ImageLightboxModal({
      getBlobUrlFn: async (mediaPath) => {
        return await getMediaBlobUrl(mediaPath);
      }
    });

    // 2. Initialize Table Renderers & Interactive Overlays
    this.hoverCard = new AirportHoverCard({
      airportMap: this.airportMap,
      onSelectAirport: (icao) => this.slideDrawer.open(icao)
    });

    this.slideDrawer = new AirportSlideDrawer({
      airportMap: this.airportMap,
      airportRouteIndex: this.airportRouteIndex,
      routeMap: this.routeMap,
      onSelectRoute: (rId) => this.showDetail('route', rId),
      onImageClick: (img, all) => this.lightbox.open(img, all)
    });

    this.ch3Renderer = new Chapter3TableView({
      airportMap: this.airportMap,
      onModeChange: (mode) => {
        this.ch3ViewMode = mode;
        if (this.selectedRouteId && this.routeMap.has(this.selectedRouteId)) {
          this.showDetail('route', this.selectedRouteId);
        }
      }
    });

    this.ch4Renderer = new Chapter4TableView({
      onImageClick: (img, all) => this.lightbox.open(img, all)
    });

    this.sidebarNav = new SidebarNav({
      routes: this.routes,
      airports: this.airports,
      onSelectRoute: (rId) => this.showDetail('route', rId),
      onSelectAirport: (icao) => this.showDetail('airport', icao)
    });

    // 3. Initialize Hash Router
    this.router = new HashRouter({
      onRouteChange: (routeData) => this.handleRouteNavigation(routeData)
    });

    // 4. Load Dataset (IndexedDB first, else fallback to seed data)
    await this.loadInitialDataset();

    // 5. Attach Global DOM Events & Shortcuts
    this.attachDomEvents();

    // 6. Handle initial route from Hash or Last selection
    this.handleInitialNavigation();
  }

  async loadInitialDataset() {
    const statusPill = document.getElementById('idbStatusPill');
    const statusText = document.getElementById('idbStatusText');

    try {
      const cached = await getParsedDataset();
      if (cached && cached.ch3 && cached.ch4 && cached.ch4.airports && cached.ch4.airports.length > 0) {
        console.log(`[IndexedDB] Loaded cached dataset: ${cached.ch3.routes.length} routes, ${cached.ch4.airports.length} airports.`);
        this.applyDataset(cached.ch3, cached.ch4);

        if (statusPill && statusText) {
          statusPill.classList.remove('needs-data');
          statusText.innerText = `Đã nạp ${this.routes.length} chặng · ${this.airports.length} sân bay`;
        }
        return;
      }
    } catch (e) {
      console.warn('[IndexedDB] Could not read cache:', e);
    }

    // Fallback to default seed data
    console.log('[Dataset] Loading default seed dataset...');
    const seedCh3 = {
      routes: DEFAULT_SEED_DATA.routes,
      routesCount: DEFAULT_SEED_DATA.routes.length,
      regions: [
        { name: 'North American', routeCount: 1 },
        { name: 'Europe', routeCount: 3 },
        { name: 'Australia', routeCount: 2 },
        { name: 'Mid-East', routeCount: 1 },
        { name: 'Northeast Asia', routeCount: 2 },
        { name: 'Southeast Asia', routeCount: 2 },
        { name: 'Domestic', routeCount: 5 }
      ],
      airportRouteIndex: {}
    };

    const seedCh4 = {
      airports: DEFAULT_SEED_DATA.airports,
      stats: { airportsCount: DEFAULT_SEED_DATA.airports.length, imagesCount: 0 },
      supplementarySections: []
    };

    this.applyDataset(seedCh3, seedCh4);

    if (statusPill && statusText) {
      statusPill.classList.add('needs-data');
      statusText.innerText = `Đang dùng dữ liệu mẫu (${this.airports.length} sân bay · ${this.routes.length} chặng)`;
    }
  }

  applyDataset(ch3Data, ch4Data) {
    this.routes = ch3Data.routes || [];
    this.airports = ch4Data.airports || [];
    this.supplementarySections = ch4Data.supplementarySections || [];

    // Rebuild Maps
    this.routeMap.clear();
    for (const r of this.routes) {
      this.routeMap.set(r.id, r);
    }

    this.airportMap.clear();
    for (const a of this.airports) {
      this.airportMap.set(a.icao.toUpperCase(), a);
    }

    // Cross reference index
    this.airportRouteIndex = ch3Data.airportRouteIndex || this.computeRouteIndex(this.routes);

    // Update Components
    this.hoverCard.updateAirportMap(this.airportMap);
    this.slideDrawer.updateData(this.airportMap, this.airportRouteIndex, this.routeMap);
    this.ch3Renderer.updateAirportMap(this.airportMap);
    this.sidebarNav.updateData(this.routes, this.airports);

    // Update Topbar Badges
    const routesBadge = document.getElementById('tabRoutesCount');
    const aptsBadge = document.getElementById('tabAirportsCount');
    if (routesBadge) routesBadge.innerText = this.routes.length;
    if (aptsBadge) aptsBadge.innerText = this.airports.length;
  }

  computeRouteIndex(routes) {
    const index = {};
    for (const r of routes) {
      for (const leg of (r.legs || [])) {
        if (leg.dep) this.addIndexEntry(index, leg.dep, r.id, 'dep');
        if (leg.arr) this.addIndexEntry(index, leg.arr, r.id, 'arr');
        for (const alt of (leg.destAlternates || [])) {
          this.addIndexEntry(index, alt, r.id, 'dest-alt');
        }
      }
      for (const enr of (r.enrouteAlternates || [])) {
        this.addIndexEntry(index, enr, r.id, 'enr-alt');
      }
    }
    return index;
  }

  addIndexEntry(index, icao, routeId, role) {
    const code = icao.toUpperCase();
    if (!index[code]) {
      index[code] = { dep: new Set(), arr: new Set(), destAlt: new Set(), enrAlt: new Set(), allRoutes: new Set() };
    }
    if (role === 'dep') index[code].dep.add(routeId);
    else if (role === 'arr') index[code].arr.add(routeId);
    else if (role === 'dest-alt') index[code].destAlt.add(routeId);
    else if (role === 'enr-alt') index[code].enrAlt.add(routeId);
    index[code].allRoutes.add(routeId);
  }

  handleInitialNavigation() {
    const parsed = this.router.parseHash();
    if (parsed && parsed.id) {
      this.handleRouteNavigation(parsed);
      return;
    }

    // Check last selection
    const last = UserPrefs.getLastSelection();
    if (last && last.type && last.id) {
      this.showDetail(last.type, last.id, { fromHistory: false });
      return;
    }

    // Default to first route or first airport
    if (this.routes.length > 0) {
      this.showDetail('route', this.routes[0].id);
    } else if (this.airports.length > 0) {
      this.showDetail('airport', this.airports[0].icao);
    }
  }

  handleRouteNavigation(routeData) {
    const { type, id, section, state, fromHistory } = routeData;
    if (!type) return;

    if (type === 'ops') {
      this.switchTab('ops');
      this.showOpsSection(id || 'policy');
      return;
    }

    if (type === 'route') {
      if (this.routeMap.has(id)) {
        this.showDetail('route', id, {
          fromHistory,
          scrollTop: state ? state.scrollTop : 0,
          targetSection: section
        });
      } else {
        this.showToast(`Không tìm thấy chặng bay: ${id}`);
        if (this.routes.length > 0) this.showDetail('route', this.routes[0].id);
      }
    } else if (type === 'airport') {
      const upper = (id || '').toUpperCase();
      if (this.airportMap.has(upper)) {
        this.showDetail('airport', upper, {
          fromHistory,
          scrollTop: state ? state.scrollTop : 0,
          targetSection: section
        });
      } else {
        this.showToast(`Không tìm thấy sân bay: ${upper}`);
        if (this.airports.length > 0) this.showDetail('airport', this.airports[0].icao);
      }
    }
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update Nav Tab Buttons
    document.querySelectorAll('.nav-tab').forEach(el => {
      if (el.dataset.tab === tab) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    if (tab === 'routes') {
      this.sidebarNav.setTab('routes');
      const targetId = this.selectedRouteId || (this.routes[0] && this.routes[0].id);
      if (targetId) this.showDetail('route', targetId);
    } else if (tab === 'airports') {
      this.sidebarNav.setTab('airports');
      const targetIcao = this.selectedAirportIcao || (this.airports[0] && this.airports[0].icao);
      if (targetIcao) this.showDetail('airport', targetIcao);
    } else if (tab === 'ops') {
      this.renderOpsView();
    }
  }

  /**
   * CENTRAL DETAIL HANDLER
   * Resets scroll to top, highlights sidebar card, updates breadcrumbs & URL hash,
   * renders sticky entity header + sticky TOC bar.
   */
  showDetail(entityType, id, options = {}) {
    const mainPanel = document.getElementById('mainContentPanel');
    if (!mainPanel) return;

    // Clean previous scroll spy observer
    if (this.tocObserver) {
      this.tocObserver.disconnect();
      this.tocObserver = null;
    }

    if (entityType === 'route') {
      const route = this.routeMap.get(id);
      if (!route) return;

      this.currentTab = 'routes';
      this.selectedRouteId = route.id;
      this.sidebarNav.setTab('routes');
      this.sidebarNav.setActive(route.id);

      // Render View
      this.renderRouteDetail(route, options);

      // Add to recents
      UserPrefs.addRecent('route', route.id, route.cityPair, route.region);
      this.sidebarNav.updateScopeCounts();

      // Update URL hash
      if (!options.fromHistory) {
        this.router.navigate('route', route.id, options.targetSection || '');
      }

      // Update Breadcrumb
      this.updateBreadcrumb({ type: 'route', entity: route });

    } else if (entityType === 'airport') {
      const cleanIcao = id.toUpperCase();
      const apt = this.airportMap.get(cleanIcao);
      if (!apt) return;

      this.currentTab = 'airports';
      this.selectedAirportIcao = cleanIcao;
      this.sidebarNav.setTab('airports');
      this.sidebarNav.setActive(cleanIcao);

      // Render View
      this.renderAirportDetail(apt, options);

      // Add to recents
      UserPrefs.addRecent('airport', cleanIcao, `${apt.name} (${cleanIcao})`, apt.country);
      this.sidebarNav.updateScopeCounts();

      // Update URL hash
      if (!options.fromHistory) {
        this.router.navigate('airport', cleanIcao, options.targetSection || '');
      }

      // Update Breadcrumb
      this.updateBreadcrumb({ type: 'airport', entity: apt });
    }

    // Scroll Reset
    if (options.scrollTop !== undefined && options.scrollTop > 0) {
      mainPanel.scrollTo({ top: options.scrollTop, behavior: 'instant' });
    } else {
      mainPanel.scrollTo({ top: 0, behavior: 'instant' });
    }

    // Target section scrolling if specified
    if (options.targetSection) {
      setTimeout(() => {
        this.scrollToSection(options.targetSection);
      }, 80);
    }
  }

  renderRouteDetail(route, options = {}) {
    const mainPanel = document.getElementById('mainContentPanel');
    const isFav = UserPrefs.isFavorite('route', route.id);

    // Sticky Entity Header for Route
    const stickyHeaderHtml = `
      <div class="sticky-entity-header" id="stickyEntityHeader">
        <div class="entity-identity-group">
          <span class="entity-code-badge">${escapeHtml(route.number ? `${route.number}. ` : '')}${escapeHtml(route.cityPair)}</span>
          <div class="entity-title-meta">
            <span class="entity-main-title">${escapeHtml(route.areaOperation || 'Mạng đường bay quốc tế & nội địa')}</span>
            <span class="entity-sub-meta">
              <span>${escapeHtml(route.region)}</span>
              <span>•</span>
              <span>RVSM: <strong>${escapeHtml(route.rvsm || 'Required')}</strong></span>
            </span>
          </div>
        </div>

        <div class="header-action-buttons">
          <button type="button" class="btn btn-outline btn-sm" id="btnFavEntity" onclick="window.vnaApp.toggleFavorite('route', '${route.id}', '${escapeHtml(route.cityPair)}', '${escapeHtml(route.region)}')">
            <span style="color:${isFav ? 'var(--vna-gold-d1)' : 'inherit'};">${isFav ? '★' : '☆'}</span>
            <span>${isFav ? 'Đã lưu' : 'Yêu thích'}</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.printCurrentDoc()" title="In / Lưu PDF A4">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            <span>In / PDF</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.copyShareLink()" title="Sao chép liên kết chia sẻ">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>
    `;

    // Filter all routes in same region for continuous view
    const allRoutesInRegion = this.routes.filter(r => r.region === route.region);

    // Sticky TOC pill bar for Continuous Mode
    let tocBarHtml = '';
    if (this.ch3ViewMode === 'region' && allRoutesInRegion.length > 1) {
      const pills = allRoutesInRegion.map(r => `
        <button type="button" class="toc-pill ${r.id === route.id ? 'active' : ''}" data-target="route-${r.id}" onclick="window.vnaApp.scrollToSection('route-${r.id}')">
          <span>${escapeHtml(r.number ? `${r.number}. ` : '')}${escapeHtml(r.cityPair)}</span>
        </button>
      `).join('');

      tocBarHtml = `<div class="quick-jump-toc-bar" id="quickJumpTocBar">${pills}</div>`;
    }

    mainPanel.innerHTML = `
      ${stickyHeaderHtml}
      ${tocBarHtml}
      ${this.ch3Renderer.render(route, allRoutesInRegion)}
    `;

    const stickyHeader = document.getElementById('stickyEntityHeader');
    const tocBar = document.getElementById('quickJumpTocBar');
    if (stickyHeader) {
      const hHeight = stickyHeader.offsetHeight;
      document.documentElement.style.setProperty('--sticky-header-height', `${hHeight}px`);
      if (tocBar) {
        tocBar.style.top = `${hHeight - 18}px`;
      }
    }

    if (this.ch3ViewMode === 'region') {
      this.initScrollSpy('[id^="route-"]');
    }
  }

  renderAirportDetail(airport, options = {}) {
    const mainPanel = document.getElementById('mainContentPanel');
    const isFav = UserPrefs.isFavorite('airport', airport.icao);
    const catClass = `tag-cat-${(airport.category || 'A').toLowerCase()}`;
    const cls = airport.classification || {};

    // Sticky Entity Header for Airport
    const stickyHeaderHtml = `
      <div class="sticky-entity-header" id="stickyEntityHeader">
        <div class="entity-identity-group">
          <span class="entity-code-badge">${escapeHtml(airport.icao)} <span style="font-size:15px; color:var(--text-secondary);">/ ${escapeHtml(airport.iata || '---')}</span></span>
          <div class="entity-title-meta">
            <span class="entity-main-title">${escapeHtml(airport.name || 'Aerodrome')}</span>
            <span class="entity-sub-meta">
              <span>${escapeHtml(airport.country || 'N/A')}</span>
              <span>•</span>
              <span class="card-tag ${catClass}">CAT ${escapeHtml(airport.category || 'A')}</span>
              <span>•</span>
              <span>RFFS ${escapeHtml(airport.rffsCategory || 'N/A')}</span>
              <span>•</span>
              <span>ELEV ${escapeHtml(airport.elevation || 'N/A')}</span>
            </span>
          </div>

          <!-- Fleet ADQ Strip -->
          <div class="fleet-strip" title="Phân loại tàu bay">
            <span class="fleet-pill ${cls.ATR === 'ADQ' ? 'is-adq' : ''}">ATR</span>
            <span class="fleet-pill ${cls.A320 === 'ADQ' ? 'is-adq' : ''}">A320</span>
            <span class="fleet-pill ${cls.A321 === 'ADQ' ? 'is-adq' : ''}">A321</span>
            <span class="fleet-pill ${cls.A350 === 'ADQ' ? 'is-adq' : ''}">A350</span>
            <span class="fleet-pill ${cls.B787 === 'ADQ' ? 'is-adq' : ''}">B787</span>
          </div>
        </div>

        <div class="header-action-buttons">
          <button type="button" class="btn btn-outline btn-sm" id="btnFavEntity" onclick="window.vnaApp.toggleFavorite('airport', '${airport.icao}', '${escapeHtml(airport.name)}', '${escapeHtml(airport.country)}')">
            <span style="color:${isFav ? 'var(--vna-gold-d1)' : 'inherit'};">${isFav ? '★' : '☆'}</span>
            <span>${isFav ? 'Đã lưu' : 'Yêu thích'}</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.printCurrentDoc()" title="In / Lưu PDF A4">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            <span>In / PDF</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.copyShareLink()" title="Sao chép liên kết chia sẻ">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
            <span>Chia sẻ</span>
          </button>
        </div>
      </div>
    `;

    // Sticky TOC Pill Bar (Sections 1-10 + Attachments)
    const sections = this.ch4Renderer.detectSections(airport);
    const tocPillsHtml = sections.map((sec, idx) => `
      <button type="button" class="toc-pill ${idx === 0 ? 'active' : ''}" data-target="${sec.id}" onclick="window.vnaApp.scrollToSection('${sec.id}')">
        <span>${escapeHtml(sec.label)}</span>
      </button>
    `).join('');

    const tocBarHtml = `
      <div class="quick-jump-toc-bar" id="quickJumpTocBar">
        ${tocPillsHtml}
      </div>
    `;

    mainPanel.innerHTML = `
      ${stickyHeaderHtml}
      ${tocBarHtml}
      <div class="doc-page-container">
        ${this.ch4Renderer.render(airport)}
      </div>
    `;

    // Dynamically sync TOC bar top offset with sticky header height
    const stickyHeader = document.getElementById('stickyEntityHeader');
    const tocBar = document.getElementById('quickJumpTocBar');
    if (stickyHeader) {
      const hHeight = stickyHeader.offsetHeight;
      document.documentElement.style.setProperty('--sticky-header-height', `${hHeight}px`);
      if (tocBar) {
        tocBar.style.top = `${hHeight - 18}px`;
      }
    }

    // Initialize Scroll-Spy on Section Rows
    this.initScrollSpy('[id^="sec-"]');
  }

  scrollToSection(sectionId) {
    const target = document.getElementById(sectionId);
    if (!target) return;

    const mainPanel = document.getElementById('mainContentPanel');
    if (mainPanel) {
      const mainRect = mainPanel.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const stickyHeader = document.getElementById('stickyEntityHeader');
      const tocBar = document.getElementById('quickJumpTocBar');
      const offsetTop = (stickyHeader ? stickyHeader.offsetHeight : 54) + (tocBar ? tocBar.offsetHeight : 0) + 12;
      const scrollY = mainPanel.scrollTop + (targetRect.top - mainRect.top) - offsetTop;
      mainPanel.scrollTo({ top: Math.max(0, scrollY), behavior: 'auto' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Update active TOC pill
    const tocBar = document.getElementById('quickJumpTocBar');
    if (tocBar) {
      tocBar.querySelectorAll('.toc-pill').forEach(pill => {
        if (pill.dataset.target === sectionId) {
          pill.classList.add('active');
          pill.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        } else {
          pill.classList.remove('active');
        }
      });
    }

    // Update hash without polluting history stack
    if (this.currentTab === 'airports' && this.selectedAirportIcao) {
      this.router.navigate('airport', this.selectedAirportIcao, sectionId, { replace: true });
    } else if (this.currentTab === 'routes') {
      const routeId = sectionId.startsWith('route-') ? sectionId.replace('route-', '') : sectionId;
      if (this.routeMap.has(routeId)) {
        this.selectedRouteId = routeId;
        this.sidebarNav.setActive(routeId);
        this.router.navigate('route', routeId, '', { replace: true });
      }
    }
  }

  initScrollSpy(selector) {
    const mainPanel = document.getElementById('mainContentPanel');
    const tocBar = document.getElementById('quickJumpTocBar');
    if (!mainPanel || !tocBar) return;

    const targets = mainPanel.querySelectorAll(selector);
    if (targets.length === 0) return;

    this.tocObserver = new IntersectionObserver((entries) => {
      const intersecting = entries.filter(e => e.isIntersecting);
      let activeTargetId = null;

      if (intersecting.length > 0) {
        // Pick the topmost intersecting entry currently in view
        intersecting.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        activeTargetId = intersecting[0].target.id;
      }

      if (activeTargetId) {
        tocBar.querySelectorAll('.toc-pill').forEach(pill => {
          if (pill.dataset.target === activeTargetId) {
            pill.classList.add('active');
            pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          } else {
            pill.classList.remove('active');
          }
        });
      }
    }, {
      root: mainPanel,
      rootMargin: '-140px 0px -55% 0px',
      threshold: 0
    });

    targets.forEach(el => this.tocObserver.observe(el));
  }

  updateBreadcrumb(context = {}) {
    const container = document.getElementById('breadcrumbContainer');
    if (!container) return;

    if (context.inDrawer && context.drawerIcao) {
      container.innerHTML = `
        <span class="crumb-item" onclick="window.vnaApp.switchTab('routes')">Chương 3</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item" onclick="window.vnaApp.slideDrawer.close()">${escapeHtml(this.selectedRouteId || 'Chặng bay')}</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item active">${escapeHtml(context.drawerIcao)} (Chi tiết)</span>
      `;
      return;
    }

    if (this.currentTab === 'routes') {
      const route = this.routeMap.get(this.selectedRouteId);
      if (!route) {
        container.innerHTML = `<span class="crumb-item active">Chương 3: Bảng Đường Bay</span>`;
        return;
      }
      container.innerHTML = `
        <span class="crumb-item" onclick="window.vnaApp.switchTab('routes')">Chương 3</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item" onclick="window.vnaApp.setNavFilter('${escapeHtml(route.region)}')">${escapeHtml(route.region)}</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item active">${escapeHtml(route.cityPair)}</span>
      `;
    } else if (this.currentTab === 'airports') {
      const apt = this.airportMap.get(this.selectedAirportIcao);
      if (!apt) {
        container.innerHTML = `<span class="crumb-item active">Chương 4: Đánh Giá Sân Bay</span>`;
        return;
      }
      container.innerHTML = `
        <span class="crumb-item" onclick="window.vnaApp.switchTab('airports')">Chương 4</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item">${escapeHtml(apt.country || 'N/A')}</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item active">${escapeHtml(apt.icao)} (${escapeHtml(apt.name)})</span>
      `;
    } else if (this.currentTab === 'ops') {
      container.innerHTML = `
        <span class="crumb-item" onclick="window.vnaApp.switchTab('ops')">Tài Liệu Bổ Sung</span>
        <span class="crumb-sep">›</span>
        <span class="crumb-item active">Hướng Dẫn Khai Thác</span>
      `;
    }
  }

  toggleFavorite(type, id, label, subtitle) {
    const isNowFav = UserPrefs.toggleFavorite(type, id, label, subtitle);
    this.sidebarNav.renderList();
    this.sidebarNav.updateScopeCounts();

    const btn = document.getElementById('btnFavEntity');
    if (btn) {
      const star = btn.querySelector('span:first-child');
      const text = btn.querySelector('span:last-child');
      if (star && text) {
        star.innerText = isNowFav ? '★' : '☆';
        star.style.color = isNowFav ? 'var(--vna-gold-d1)' : 'inherit';
        text.innerText = isNowFav ? 'Đã lưu' : 'Yêu thích';
      }
    }

    this.showToast(isNowFav ? `Đã thêm ${id} vào danh sách Yêu thích` : `Đã bỏ ${id} khỏi danh sách Yêu thích`);
  }

  toggleFilterChip(filterId) {
    this.sidebarNav.toggleFilter(filterId);
  }

  setScope(scope) {
    this.sidebarNav.setScope(scope);
  }

  clearAllFilters() {
    this.sidebarNav.clearAllFilters();
  }

  setNavFilter(filterId) {
    if (this.sidebarNav) {
      this.sidebarNav.activeFilters.clear();
      let matchedId = filterId;
      for (const defId of ['North American', 'Europe', 'Australia', 'Mid-East', 'Northeast Asia', 'Southeast Asia', 'Domestic']) {
        if (defId.toLowerCase() === filterId.toLowerCase() || 
            filterId.toLowerCase().includes(defId.toLowerCase()) ||
            defId.toLowerCase().includes(filterId.toLowerCase())) {
          matchedId = defId;
          break;
        }
      }
      this.sidebarNav.activeFilters.add(matchedId);
      this.sidebarNav.renderFilters();
      this.sidebarNav.renderList();
    }
  }

  switchCh3ViewMode(mode) {
    this.ch3ViewMode = mode;
    this.ch3Renderer.viewMode = mode;
    const route = this.routeMap.get(this.selectedRouteId);
    if (route) this.showDetail('route', route.id);
  }

  copyShareLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Đã sao chép liên kết chia sẻ vào bộ nhớ tạm!');
    });
  }

  printCurrentDoc() {
    window.print();
  }

  historyBack() {
    window.history.back();
  }

  historyForward() {
    window.history.forward();
  }

  selectRoute(routeId, options = {}) {
    return this.showDetail('route', routeId, options);
  }

  selectAirport(icao, options = {}) {
    return this.showDetail('airport', icao, options);
  }

  selectRouteFromDrawer(routeId) {
    this.slideDrawer.close();
    this.showDetail('route', routeId);
  }

  openLightbox(imageItem, allImages) {
    this.lightbox.open(imageItem, allImages);
  }

  copyRouteBrief(routeId) {
    const route = this.routeMap.get(routeId);
    if (!route) return;

    const legsText = (route.legs || []).map(l => `  • ${l.dep} -> ${l.arr} (${l.routeName}) | Alternates: ${(l.destAlternates || []).join(', ')}`).join('\n');
    const enrouteAlts = (route.enrouteAlternates && route.enrouteAlternates.length > 0)
      ? route.enrouteAlternates.join(', ')
      : (route.enrouteAlternatesRaw || 'NIL');
    const depressVal = route.depressurization || (route.metadata && route.metadata['Depressurization Procedure']) || '';
    const depressText = depressVal ? `Depressurization Procedure: ${depressVal.replace(/\n/g, ' ')}\n` : '';

    const brief = `VNA ROUTE BRIEF: ${route.cityPair} (${route.id})\n` +
      `Region: ${route.region} | Area: ${route.areaOperation || 'N/A'}\n` +
      `Preferred Enroute Alternate Airport: ${enrouteAlts}\n` +
      `RVSM: ${route.rvsm || 'Required'}\n` +
      `EDTO: ${route.edto || 'N/A'}\n` +
      `PBN: ${route.pbn || 'N/A'}\n` +
      `Datalink: ${route.datalink || 'CPDLC/ ADS-C, ADS-B'}\n` +
      depressText +
      `Flight Level: ${(route.flightLevel || 'N/A').replace(/\n/g, ' ')}\n` +
      `Legs:\n${legsText}\n` +
      `Restrictions: ${(route.restriction || 'NIL').replace(/\n/g, ' ')}`;

    navigator.clipboard.writeText(brief).then(() => {
      this.showToast('Đã sao chép tóm tắt chặng bay vào Clipboard!');
    });
  }

  // Upload modal handlers
  openUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.add('active');
  }

  closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.remove('active');
  }

  handleDrop(e) {
    e.preventDefault();
    const zone = document.getElementById('fileDropZone');
    if (zone) zone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.includes('chapter 3') || lower.includes('ch3') || lower.includes('route')) {
        const dt = new DataTransfer();
        dt.items.add(f);
        document.getElementById('fileCh3Input').files = dt.files;
      } else if (lower.includes('chapter 4') || lower.includes('ch4') || lower.includes('airport')) {
        const dt = new DataTransfer();
        dt.items.add(f);
        document.getElementById('fileCh4Input').files = dt.files;
      }
    }
    const log = document.getElementById('parseStatusLog');
    if (log) log.innerText = `Đã chọn: ${Array.from(files).map(f => f.name).join(', ')}`;
  }

  async startParseFiles() {
    const fileCh3 = document.getElementById('fileCh3Input').files[0];
    const fileCh4 = document.getElementById('fileCh4Input').files[0];

    if (!fileCh3 && !fileCh4) {
      alert('Vui lòng chọn hoặc kéo thả ít nhất 1 file .docx (Chương 3 hoặc Chương 4)!');
      return;
    }

    if (typeof window.JSZip === 'undefined') {
      alert('Thư viện JSZip chưa được tải. Vui lòng kiểm tra kết nối mạng.');
      return;
    }

    const progContainer = document.getElementById('parseProgressContainer');
    const progBar = document.getElementById('parseProgressBar');
    const statusLog = document.getElementById('parseStatusLog');

    progContainer.style.display = 'block';
    progBar.style.width = '10%';
    statusLog.innerText = 'Đang khởi tạo JSZip và giải nén các tệp OOXML...';

    let parsedCh3 = null;
    let parsedCh4 = null;

    try {
      if (fileCh3) {
        progBar.style.width = '25%';
        statusLog.innerText = `Đang đọc và phân tích ${fileCh3.name} (Chương 3)...`;

        const ch3Buffer = await fileCh3.arrayBuffer();
        await saveRawDocxFile('CHAPTER 3_NEW_AMD.docx', ch3Buffer);

        const ch3Zip = await window.JSZip.loadAsync(ch3Buffer);
        const docXmlEntry = ch3Zip.file('word/document.xml');
        if (!docXmlEntry) throw new Error('Không tìm thấy word/document.xml trong file Chương 3.');

        const docXmlStr = await docXmlEntry.async('string');
        parsedCh3 = parseChapter3Xml(docXmlStr);
        progBar.style.width = '50%';
        statusLog.innerText = `Chương 3 xong: ${parsedCh3.routes.length} chặng bay hợp lệ.`;
      }

      if (fileCh4) {
        progBar.style.width = '60%';
        statusLog.innerText = `Đang phân tích ${fileCh4.name} (Chương 4: 278 sân bay, 328 sơ đồ)...`;

        const ch4Buffer = await fileCh4.arrayBuffer();
        await saveRawDocxFile('CHAPTER 4_REV04.docx', ch4Buffer);

        const ch4Zip = await window.JSZip.loadAsync(ch4Buffer);
        const docXmlEntry = ch4Zip.file('word/document.xml');
        if (!docXmlEntry) throw new Error('Không tìm thấy word/document.xml trong file Chương 4.');

        const docXmlStr = await docXmlEntry.async('string');

        let relsXmlStr = '';
        const relsEntry = ch4Zip.file('word/_rels/document.xml.rels');
        if (relsEntry) {
          relsXmlStr = await relsEntry.async('string');
        }

        parsedCh4 = parseChapter4Xml(docXmlStr, relsXmlStr);
        progBar.style.width = '85%';
        statusLog.innerText = `Chương 4 xong: ${parsedCh4.airports.length} sân bay, ${parsedCh4.stats.imagesCount} sơ đồ đính kèm.`;
      }

      progBar.style.width = '95%';
      statusLog.innerText = 'Đang lưu trữ dữ liệu vào IndexedDB cache...';

      const finalCh3 = parsedCh3 || { routes: this.routes, airportRouteIndex: this.airportRouteIndex };
      const finalCh4 = parsedCh4 || { airports: this.airports, supplementarySections: this.supplementarySections };

      await saveParsedDataset(finalCh3, finalCh4);
      this.applyDataset(finalCh3, finalCh4);

      progBar.style.width = '100%';
      statusLog.innerText = `Thành công! Đã nạp ${this.routes.length} đường bay & ${this.airports.length} sân bay.`;

      const statusPill = document.getElementById('idbStatusPill');
      const statusText = document.getElementById('idbStatusText');
      if (statusPill && statusText) {
        statusPill.classList.remove('needs-data');
        statusText.innerText = `Đã nạp ${this.routes.length} chặng · ${this.airports.length} sân bay`;
      }

      setTimeout(() => {
        this.closeUploadModal();
        this.switchTab(this.currentTab);
        this.showToast(`Phân tích thành công ${this.routes.length} đường bay & ${this.airports.length} sân bay!`);
      }, 700);

    } catch (err) {
      console.error('Lỗi phân tích file docx:', err);
      statusLog.innerText = `Lỗi: ${err.message}`;
      progBar.style.background = 'var(--danger)';
    }
  }

  async clearCache() {
    if (confirm('Bạn có chắc muốn xóa toàn bộ bộ đệm IndexedDB và quay về dữ liệu mặc định?')) {
      await clearIndexedDbCache();
      await this.loadInitialDataset();
      this.switchTab(this.currentTab);
      this.showToast('Đã xóa bộ đệm IndexedDB thành công!');
    }
  }

  showToast(message) {
    const toast = document.getElementById('appToast');
    const msg = document.getElementById('toastMsg');
    if (toast && msg) {
      msg.innerText = message;
      toast.classList.add('active');
      setTimeout(() => toast.classList.remove('active'), 3200);
    }
  }

  renderOpsView() {
    const container = document.getElementById('mainContentPanel');
    const leftContainer = document.getElementById('itemsListContainer');
    const counter = document.getElementById('listCounterText');

    if (counter) counter.innerText = 'Tài liệu bổ sung: 6 mục';

    if (leftContainer) {
      leftContainer.innerHTML = `
        <div class="item-card active" onclick="window.vnaApp.showOpsSection('policy')">
          <div class="card-title">3.1 & 3.2 Quy định chung & Chính sách</div>
          <div class="card-subtitle">Dispatch & Route Guide compliance</div>
        </div>
        <div class="item-card" onclick="window.vnaApp.showOpsSection('pos_report')">
          <div class="card-title">3.4 Báo cáo vị trí (Position Fixing)</div>
          <div class="card-subtitle">Quy tắc 5° / 10° kinh vĩ độ & FIR</div>
        </div>
        <div class="item-card" onclick="window.vnaApp.showOpsSection('enroute_charts')">
          <div class="card-title">3.5 Bản đồ đường dài & Mạng đường bay</div>
          <div class="card-subtitle">LIDO mPilot, Đường bay RNAV Q9, W27, W28</div>
        </div>
        <div class="item-card" onclick="window.vnaApp.showOpsSection('ch4_intro')">
          <div class="card-title">4.1 Giới thiệu Sân bay & VAR 14.100</div>
          <div class="card-subtitle">Yêu cầu tiêu chuẩn sân bay khai thác</div>
        </div>
        <div class="item-card" onclick="window.vnaApp.showOpsSection('vvdb_eosid')">
          <div class="card-title">VVDB Vòng lượn khẩn cấp EOSID Điện Biên</div>
          <div class="card-subtitle">Quy trình rẽ tránh địa hình vùng núi</div>
        </div>
        <div class="item-card" onclick="window.vnaApp.showOpsSection('ch4_minima')">
          <div class="card-title">4.3 Bảng Tiêu chuẩn Khí hậu & Minima (6 bảng)</div>
          <div class="card-subtitle">Airport Facilities, LVO, Narrow Runways</div>
        </div>
      `;
    }

    this.showOpsSection('policy');
  }

  showOpsSection(sectionId) {
    const container = document.getElementById('mainContentPanel');
    if (!container) return;

    if (sectionId === 'policy') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">3.1 GENERAL</h3>
            <p style="margin-bottom:14px;">The purpose of this chapter is to provide supplemental information pertaining to domestic and international routes operated by Vietnam Airlines. It covers standard city pairs, navigation specifications, communication requirements, and alternate aerodrome policies.</p>
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">3.2 POLICY</h3>
            <p style="margin-bottom:14px;">All routes operated by VNA will be up-to-date and appropriate for the proposed type of operation. A route guide is maintained to ensure that the flight crew will have, for each flight, information relating to communication facilities, navigation aids, aerodromes, and minimum flight altitudes.</p>
            <div style="background:var(--vna-primary-l5); border-left:4px solid var(--vna-primary); padding:12px 16px; border-radius:4px; color:var(--vna-primary-d3);">
              <strong>Quy tắc bắt buộc đối với tổ bay:</strong> Vietnam Airlines cung cấp kế hoạch bay cá nhân (OFP) và các ký hiệu mô tả đường bay cho từng chuyến bay. Trong trường hợp có bất kỳ sự khác biệt nào giữa kế hoạch bay và tài liệu này, <strong>tổ bay phải tuyệt đối tuân thủ thông tin được cung cấp trong kế hoạch bay (Flight Plan)</strong>.
            </div>
          </div>
        </div>
      `;
    } else if (sectionId === 'pos_report') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">Quy chuẩn khoảng cách báo cáo vị trí</h3>
            <ul style="padding-left:22px; margin-bottom:16px;">
              <li>Thông thường, các điểm báo cáo vị trí trên biển/đại dương được đặt cách nhau <strong>5 độ vĩ độ hoặc kinh độ</strong>.</li>
              <li>Tàu bay bay qua 10 độ vĩ độ/kinh độ trong <strong>1 giờ 20 phút hoặc ít hơn</strong> chỉ cần báo cáo tại các khoảng cách <strong>10 độ</strong>.</li>
            </ul>
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">Thủ tục đặc thù tại các FIR khu vực</h3>
            <ul style="padding-left:22px;">
              <li><strong>Australian FIR:</strong> Phải báo cáo vị trí trên tần số CTA/FIA tiếp theo 15 phút trước khi rời khỏi vùng trời TIBA.</li>
              <li><strong>Fukuoka, Incheon, Manila & Taipei FIRs:</strong> Báo cáo vị trí bắt buộc cho tất cả chuyến bay quá cảnh (Overflights).</li>
            </ul>
          </div>
        </div>
      `;
    } else if (sectionId === 'enroute_charts') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <p style="margin-bottom:14px;">Hiện tại, Vietnam Airlines sử dụng nhà cung cấp <strong>LIDO</strong> cho các dịch vụ Bản đồ bay. Tổ bay tham chiếu sơ đồ chi tiết trên <strong>Lido mPilot (EFB1)</strong> và <strong>eRoute Manual (EFB2, EFB3)</strong>.</p>
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">Đường bay RNAV Q9, W27, W28 (Đội bay A350 & B787)</h3>
            <p>Hệ thống đường bay tối ưu hóa hiệu suất trong vùng trời Việt Nam có sẵn trong cơ sở dữ liệu dẫn đường cho đội tàu bay thân rộng nhằm tiết kiệm nhiên liệu và rút ngắn thời gian bay trên trục vàng Bắc - Nam (HAN - SGN - DAD).</p>
          </div>
        </div>
      `;
    } else if (sectionId === 'ch4_intro') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <p style="margin-bottom:14px;">Chương 4 cung cấp dữ liệu đánh giá toàn bộ 278 sân bay đến và sân bay dự bị nhằm đáp ứng yêu cầu pháp lý của <strong>VAR 14.100</strong> (Quy chế An toàn Hàng không Việt Nam) và SOP công ty.</p>
            <div style="background:var(--warning-bg); border-left:4px solid var(--warning); padding:12px 16px; border-radius:4px; color:#B45309;">
              <strong>CẢNH BÁO:</strong> Khi có sự khác biệt giữa tài liệu này với AIP quốc gia hoặc NOTAM khai thác mới nhất, thông tin trong tài liệu hàng không chính thức (AIP/NOTAM) sẽ có giá trị ưu tiên thi hành.
            </div>
          </div>
        </div>
      `;
    } else if (sectionId === 'vvdb_eosid') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <div style="background:var(--danger-bg); border:1px solid rgba(249,82,82,0.35); padding:12px 16px; border-radius:4px; color:var(--danger); margin-bottom:16px;">
              <strong>MỆNH LỆNH AN TOÀN BẮT BUỘC:</strong> Đối với sân bay Điện Biên (VVDB), việc tuân thủ quy trình rẽ khẩn cấp khi hỏng động cơ (EOSID) là bắt buộc tuyệt đối do địa hình thung lũng hiểm trở (MSA 9.190 FT).
            </div>
            <h3 style="color:var(--vna-primary); margin-bottom:10px;">Thủ tục khi Go-Around / Hỏng động cơ:</h3>
            <ul style="padding-left:22px; margin-bottom:14px;">
              <li><strong>RWY 17:</strong> Thực hiện theo biểu đồ EOSID trong LIDO mPilot. Rẽ ngay theo hướng quy định để tránh sườn núi phía Đông.</li>
              <li><strong>RWY 35:</strong> Rẽ theo quy định, duy trì góc dốc leo cao tối thiểu (minimum climb gradient).</li>
            </ul>
            <p><strong>Tiêu chuẩn cơ trưởng:</strong> Cơ trưởng (Captain) phải là Người cầm lái (Pilot Flying - PF) cho toàn bộ các lần cất cánh và hạ cánh tại Điện Biên. Cấm tuyệt đối lăn bánh bằng 1 động cơ (Single-engine taxi).</p>
          </div>
        </div>
      `;
    } else if (sectionId === 'ch4_minima') {
      container.innerHTML = `
        <div class="doc-page-container">
          <div class="paper-card" style="line-height:1.7; font-size:14px;">
            <p style="margin-bottom:14px;">Các bảng tiêu chuẩn nằm sau sân bay số 278 (ZYTX) trong tài liệu gốc:</p>
            <ol style="padding-left:22px; display:flex; flex-direction:column; gap:8px;">
              <li><strong>4.3 AIRPORT FACILITIES:</strong> Bảng phân loại trang thiết bị hỗ trợ dẫn đường và đèn hiệu sân bay.</li>
              <li><strong>4.4 WEATHER MINIMA:</strong> Tiêu chuẩn trần mây và tầm nhìn (RVR/VIS) cho tiếp cận CAT I, CAT II, CAT III.</li>
              <li><strong>4.5 LOW VISIBILITY OPERATIONS (LVO):</strong> Quy định khai thác trong điều kiện tầm nhìn hạn chế.</li>
              <li><strong>4.6 OPERATIONS ON NARROW RUNWAYS:</strong> Hướng dẫn khai thác đường băng hẹp (&lt; 45m) cho A350 và B787.</li>
              <li><strong>4.7 TERMINAL CHARTS & SUPPLIERS:</strong> Danh mục sơ đồ sân bay do LIDO cung cấp.</li>
            </ol>
          </div>
        </div>
      `;
    }
  }

  attachDomEvents() {
    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== document.getElementById('mainSearchInput')) {
        e.preventDefault();
        const input = document.getElementById('mainSearchInput');
        if (input) {
          input.focus();
          input.select();
        }
      }
      if (e.key === 'Escape') {
        const uploadModal = document.getElementById('uploadModal');
        if (uploadModal && uploadModal.classList.contains('active')) {
          this.closeUploadModal();
        }
      }
    });

    // Save scroll position into history state periodically
    const mainPanel = document.getElementById('mainContentPanel');
    if (mainPanel) {
      let scrollTimer = null;
      mainPanel.addEventListener('scroll', () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          this.router.saveCurrentScroll(mainPanel.scrollTop);
        }, 150);
      }, { passive: true });
    }
  }
}

// Instantiate and expose globally on window
window.vnaApp = new VnaRouteManualApp();

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.vnaApp.init();
  });
} else {
  window.vnaApp.init();
}
