/**
 * VNA Route Manual v4.0 - Sidebar Navigation Component
 * Fast search and multi-select filtering for 176+ Routes (7 Regions) and 278 Airports.
 * Supports Scope Tabs (Tất cả / Gần đây / Yêu thích), multi-filter chips, and star favorites.
 */

import { UserPrefs } from '../utils/userPrefs.js';

export class SidebarNav {
  /**
   * @param {Object} options
   * @param {Array<Object>} options.routes
   * @param {Array<Object>} options.airports
   * @param {(routeId: string) => void} options.onSelectRoute
   * @param {(icao: string) => void} options.onSelectAirport
   */
  constructor(options = {}) {
    this.routes = options.routes || [];
    this.airports = options.airports || [];
    this.onSelectRoute = options.onSelectRoute || (() => {});
    this.onSelectAirport = options.onSelectAirport || (() => {});

    this.currentTab = 'routes'; // 'routes' | 'airports'
    this.currentScope = 'all';  // 'all' | 'recents' | 'favorites'
    this.searchQuery = '';
    this.activeFilters = new Set();
    this.isAscending = true;
    this.activeId = null;

    this.container = null;
    this.listContainer = null;
    this.counterEl = null;
    this.filterChipsContainer = null;
    this.searchInput = null;

    this.initElements();
    this.attachEvents();
  }

  updateData(routes, airports) {
    this.routes = routes;
    this.airports = airports;
    this.renderFilters();
    this.renderList();
    this.updateScopeCounts();
  }

  setTab(tab) {
    this.currentTab = tab;
    this.activeFilters.clear();
    this.searchQuery = '';
    if (this.searchInput) this.searchInput.value = '';

    // Update switcher tabs UI
    const ch3Btn = document.getElementById('sidebarTabCh3');
    const ch4Btn = document.getElementById('sidebarTabCh4');
    if (ch3Btn && ch4Btn) {
      if (tab === 'routes') {
        ch3Btn.classList.add('active');
        ch4Btn.classList.remove('active');
      } else {
        ch3Btn.classList.remove('active');
        ch4Btn.classList.add('active');
      }
    }

    this.renderFilters();
    this.renderList();
    this.updateScopeCounts();
  }

  setScope(scope) {
    this.currentScope = scope;
    document.querySelectorAll('.scope-tab-btn').forEach(btn => {
      if (btn.dataset.scope === scope) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.renderList();
  }

  initElements() {
    this.container = document.getElementById('sidebarNavContainer');
    this.listContainer = document.getElementById('itemsListContainer');
    this.counterEl = document.getElementById('listCounterText');
    this.filterChipsContainer = document.getElementById('filterChipsContainer');
    this.searchInput = document.getElementById('mainSearchInput');
  }

  attachEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        const clearBtn = document.getElementById('searchClearBtn');
        if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
        this.renderList();
      });
    }

    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        this.searchQuery = '';
        if (this.searchInput) this.searchInput.value = '';
        clearBtn.style.display = 'none';
        this.renderList();
      };
    }

    const sortBtn = document.getElementById('sortToggleBtn');
    if (sortBtn) {
      sortBtn.onclick = () => {
        this.isAscending = !this.isAscending;
        sortBtn.innerText = this.isAscending ? 'Sắp xếp: A-Z ▴' : 'Sắp xếp: Z-A ▾';
        this.renderList();
      };
    }

    // Clear filters action
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
      clearFiltersBtn.onclick = () => this.clearAllFilters();
    }
  }

  clearAllFilters() {
    this.activeFilters.clear();
    this.searchQuery = '';
    if (this.searchInput) this.searchInput.value = '';
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    this.renderFilters();
    this.renderList();
  }

  renderFilters() {
    if (!this.filterChipsContainer) return;

    let filterDefs = [];
    if (this.currentTab === 'routes') {
      filterDefs = [
        { id: 'North American', label: 'Bắc Mỹ' },
        { id: 'Europe', label: 'Châu Âu' },
        { id: 'Australia', label: 'Úc' },
        { id: 'Mid-East', label: 'Trung Đông' },
        { id: 'Northeast Asia', label: 'Đông Bắc Á' },
        { id: 'Southeast Asia', label: 'Đông Nam Á' },
        { id: 'Domestic', label: 'Nội địa' }
      ];
    } else {
      filterDefs = [
        { id: 'CAT_A', label: 'CAT A' },
        { id: 'CAT_B', label: 'CAT B' },
        { id: 'CAT_C', label: 'CAT C' },
        { id: 'ADQ_A350', label: 'ADQ A350' },
        { id: 'ADQ_B787', label: 'ADQ B787' },
        { id: 'HAS_IMAGES', label: '📎 Có sơ đồ' }
      ];
    }

    this.filterChipsContainer.innerHTML = filterDefs.map(f => {
      const isSelected = this.activeFilters.has(f.id) || 
        Array.from(this.activeFilters).some(af => 
          af.toLowerCase() === f.id.toLowerCase() ||
          af.toLowerCase().includes(f.id.toLowerCase()) || 
          f.id.toLowerCase().includes(af.toLowerCase())
        );
      return `
        <button type="button" class="chip ${isSelected ? 'selected' : ''}" data-filter="${f.id}" onclick="window.vnaApp.toggleFilterChip('${f.id}')">
          ${isSelected ? '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>' : ''}
          <span>${f.label}</span>
        </button>
      `;
    }).join('');
  }

  toggleFilter(filterId) {
    if (this.activeFilters.has(filterId)) {
      this.activeFilters.delete(filterId);
    } else {
      this.activeFilters.add(filterId);
    }
    this.renderFilters();
    this.renderList();
  }

  updateScopeCounts() {
    const recents = UserPrefs.getRecents();
    const favorites = UserPrefs.getFavorites();

    const recentsCountEl = document.getElementById('scopeRecentsCount');
    const favCountEl = document.getElementById('scopeFavCount');

    if (recentsCountEl) {
      const matchRecents = recents.filter(r => (this.currentTab === 'routes' ? r.type === 'route' : r.type === 'airport'));
      recentsCountEl.innerText = matchRecents.length;
    }
    if (favCountEl) {
      const matchFavs = favorites.filter(f => (this.currentTab === 'routes' ? f.type === 'route' : f.type === 'airport'));
      favCountEl.innerText = matchFavs.length;
    }
  }

  renderList() {
    if (!this.listContainer) return;

    if (this.currentTab === 'routes') {
      this.renderRoutesList();
    } else {
      this.renderAirportsList();
    }
  }

  renderRoutesList() {
    let items = [...this.routes];
    const totalCount = this.routes.length;

    // Apply Scope Filter
    if (this.currentScope === 'recents') {
      const recents = UserPrefs.getRecents().filter(r => r.type === 'route');
      const recentIds = new Set(recents.map(r => r.id));
      items = items.filter(r => recentIds.has(r.id));
    } else if (this.currentScope === 'favorites') {
      const favorites = UserPrefs.getFavorites().filter(f => f.type === 'route');
      const favIds = new Set(favorites.map(f => f.id));
      items = items.filter(r => favIds.has(r.id));
    }

    // Apply Filter Chips (Regions)
    if (this.activeFilters.size > 0) {
      items = items.filter(r => {
        for (const f of this.activeFilters) {
          const fLower = f.toLowerCase();
          const rLower = (r.region || '').toLowerCase();
          if (rLower.includes(fLower) || fLower.includes(rLower)) {
            return true;
          }
          if (fLower === 'domestic' && (rLower.includes('vietnam') || rLower.includes('nội địa'))) {
            return true;
          }
        }
        return false;
      });
    }

    // Apply Search Query
    if (this.searchQuery) {
      const q = this.searchQuery;
      items = items.filter(r => {
        const cityMatch = (r.cityPair || '').toLowerCase().includes(q);
        const idMatch = (r.id || '').toLowerCase().includes(q);
        const legMatch = (r.legs || []).some(l => 
          l.dep.toLowerCase().includes(q) || 
          l.arr.toLowerCase().includes(q) || 
          (l.routeName || '').toLowerCase().includes(q) ||
          (l.destAlternates || []).some(a => a.toLowerCase().includes(q))
        );
        const enrMatch = (r.enrouteAlternates || []).some(a => a.toLowerCase().includes(q));
        const depressVal = (r.depressurization || (r.metadata && r.metadata['Depressurization Procedure']) || '').toLowerCase();
        const depressMatch = Boolean(depressVal) && (
          depressVal.includes(q) ||
          'depressurization depressurisation procedure escape route chapter 9 giảm áp giam ap'.includes(q) ||
          q.includes('depress') ||
          q.includes('giảm áp') ||
          q.includes('giam ap') ||
          q.includes('escape')
        );
        const metaMatch = (r.areaOperation || '').toLowerCase().includes(q) ||
                          (r.flightLevel || '').toLowerCase().includes(q) ||
                          (r.restriction || '').toLowerCase().includes(q) ||
                          depressMatch;
        return cityMatch || idMatch || legMatch || enrMatch || metaMatch;
      });
    }

    // Sort
    items.sort((a, b) => {
      const cmp = (a.cityPair || '').localeCompare(b.cityPair || '');
      return this.isAscending ? cmp : -cmp;
    });

    if (this.counterEl) {
      const hasFilter = this.activeFilters.size > 0 || this.searchQuery || this.currentScope !== 'all';
      this.counterEl.innerHTML = `Hiển thị <strong>${items.length}</strong> / ${totalCount} chặng ${hasFilter ? '<a href="javascript:void(0)" class="clear-filters-link" onclick="window.vnaApp.clearAllFilters()">(Xóa lọc)</a>' : ''}`;
    }

    if (items.length === 0) {
      let emptyMsg = 'Không tìm thấy chặng bay nào phù hợp.';
      if (this.currentScope === 'favorites') emptyMsg = 'Bạn chưa đánh dấu chặng bay nào vào danh sách Yêu thích. Bấm biểu tượng ☆ để lưu.';
      else if (this.currentScope === 'recents') emptyMsg = 'Chưa có chặng bay nào trong lịch sử gần đây.';

      this.listContainer.innerHTML = `
        <div style="padding:32px 16px; text-align:center; color:var(--text-secondary); font-size:13px; line-height:1.6;">
          ${emptyMsg}
        </div>
      `;
      return;
    }

    this.listContainer.innerHTML = items.map(r => {
      const isActive = r.id === this.activeId;
      const isFav = UserPrefs.isFavorite('route', r.id);
      const legSummary = (r.legs || []).map(l => `
        <span class="badge badge-soft-primary" style="font-family:var(--font-mono); font-size:11px;">${l.dep}</span>
        <span style="font-size:10px; color:var(--text-tertiary);">→</span>
        <span class="badge badge-soft-primary" style="font-family:var(--font-mono); font-size:11px;">${l.arr}</span>
      `).join(' ');

      const altCount = (r.legs || []).reduce((acc, l) => acc + (l.destAlternates ? l.destAlternates.length : 0), 0);

      return `
        <div class="item-card ${isActive ? 'active' : ''}" data-route-id="${r.id}" onclick="window.vnaApp.showDetail('route', '${r.id}')">
          <div class="card-header-line">
            <span class="card-title">${escapeHtml(r.number ? `${r.number}. ` : '')}${escapeHtml(r.cityPair)}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="card-tag tag-region">${escapeHtml(r.region)}</span>
              <button type="button" class="card-fav-btn ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); window.vnaApp.toggleFavorite('route', '${r.id}', '${escapeHtml(r.cityPair)}', '${escapeHtml(r.region)}')" title="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">
                ${isFav ? '★' : '☆'}
              </button>
            </div>
          </div>

          <div class="card-subtitle">
            ${escapeHtml(r.areaOperation || 'Toàn cầu')} • RVSM: ${escapeHtml(r.rvsm || 'Required')}
          </div>

          <div class="card-chips-group">
            ${legSummary}
            <span style="font-size:11px; color:var(--text-secondary); margin-left:auto;">
              ${altCount} Dự bị
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderAirportsList() {
    let items = [...this.airports];
    const totalCount = this.airports.length;

    // Apply Scope Filter
    if (this.currentScope === 'recents') {
      const recents = UserPrefs.getRecents().filter(r => r.type === 'airport');
      const recentIds = new Set(recents.map(r => r.id));
      items = items.filter(a => recentIds.has(a.icao));
    } else if (this.currentScope === 'favorites') {
      const favorites = UserPrefs.getFavorites().filter(f => f.type === 'airport');
      const favIds = new Set(favorites.map(f => f.id));
      items = items.filter(a => favIds.has(a.icao));
    }

    // Apply Filter Chips (CAT, ADQ, Images)
    if (this.activeFilters.size > 0) {
      items = items.filter(a => {
        let matches = true;
        for (const f of this.activeFilters) {
          if (f === 'CAT_A' && a.category !== 'A') matches = false;
          if (f === 'CAT_B' && a.category !== 'B') matches = false;
          if (f === 'CAT_C' && a.category !== 'C') matches = false;
          if (f === 'ADQ_A350') {
            const cls = a.classification || {};
            if (cls.A350 !== 'ADQ' && cls.A350 !== 'ADEQ') matches = false;
          }
          if (f === 'ADQ_B787') {
            const cls = a.classification || {};
            if (cls.B787 !== 'ADQ' && cls.B787 !== 'ADEQ') matches = false;
          }
          if (f === 'HAS_IMAGES') {
            const hasImg = a.imagesCount > 0 || (a.images && a.images.length > 0);
            if (!hasImg) matches = false;
          }
        }
        return matches;
      });
    }

    // Apply Search Query
    if (this.searchQuery) {
      const q = this.searchQuery;
      items = items.filter(a => {
        return (a.icao || '').toLowerCase().includes(q) ||
               (a.iata || '').toLowerCase().includes(q) ||
               (a.name || '').toLowerCase().includes(q) ||
               (a.country || '').toLowerCase().includes(q) ||
               (a.category || '').toLowerCase().includes(q);
      });
    }

    // Sort
    items.sort((a, b) => {
      const cmp = (a.icao || '').localeCompare(b.icao || '');
      return this.isAscending ? cmp : -cmp;
    });

    if (this.counterEl) {
      const hasFilter = this.activeFilters.size > 0 || this.searchQuery || this.currentScope !== 'all';
      this.counterEl.innerHTML = `Hiển thị <strong>${items.length}</strong> / ${totalCount} sân bay ${hasFilter ? '<a href="javascript:void(0)" class="clear-filters-link" onclick="window.vnaApp.clearAllFilters()">(Xóa lọc)</a>' : ''}`;
    }

    if (items.length === 0) {
      let emptyMsg = 'Không tìm thấy sân bay nào phù hợp.';
      if (this.currentScope === 'favorites') emptyMsg = 'Bạn chưa đánh dấu sân bay nào vào danh sách Yêu thích. Bấm biểu tượng ☆ để lưu.';
      else if (this.currentScope === 'recents') emptyMsg = 'Chưa có sân bay nào trong lịch sử gần đây.';

      this.listContainer.innerHTML = `
        <div style="padding:32px 16px; text-align:center; color:var(--text-secondary); font-size:13px; line-height:1.6;">
          ${emptyMsg}
        </div>
      `;
      return;
    }

    this.listContainer.innerHTML = items.map(a => {
      const isActive = a.icao === this.activeId;
      const isFav = UserPrefs.isFavorite('airport', a.icao);
      const catClass = `tag-cat-${(a.category || 'A').toLowerCase()}`;
      const hasImg = a.imagesCount > 0 || (a.images && a.images.length > 0);
      const imgCount = a.imagesCount || (a.images ? a.images.length : 0);

      const rwys = (a.runways && a.runways.length > 0)
        ? a.runways.slice(0, 2).map(r => r.rwy).join(', ')
        : 'LIDO';

      return `
        <div class="item-card ${isActive ? 'active' : ''}" data-icao="${a.icao}" onclick="window.vnaApp.showDetail('airport', '${a.icao}')">
          <div class="card-header-line">
            <span class="card-title">
              <span style="font-family:var(--font-mono); font-weight:700;">${escapeHtml(a.icao)}</span>
              <span style="font-size:12px; font-weight:600; color:var(--text-secondary);">/ ${escapeHtml(a.iata || '---')}</span>
            </span>
            <div style="display:flex; gap:5px; align-items:center;">
              ${hasImg ? `<span class="badge badge-soft-primary" title="Có ${imgCount} sơ đồ đính kèm">📎 ${imgCount}</span>` : ''}
              <span class="card-tag ${catClass}">CAT ${escapeHtml(a.category || 'A')}</span>
              <button type="button" class="card-fav-btn ${isFav ? 'is-fav' : ''}" onclick="event.stopPropagation(); window.vnaApp.toggleFavorite('airport', '${a.icao}', '${escapeHtml(a.name)}', '${escapeHtml(a.country)}')" title="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">
                ${isFav ? '★' : '☆'}
              </button>
            </div>
          </div>

          <div class="card-subtitle" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${escapeHtml(a.name || 'Aerodrome')} • ${escapeHtml(a.country || 'N/A')}
          </div>

          <div class="card-chips-group">
            <span class="badge badge-soft-gray">RFFS ${escapeHtml(a.rffsCategory || 'N/A')}</span>
            <span class="badge badge-soft-gray">RWY ${rwys}</span>
            <span class="badge badge-soft-gray">ELEV ${escapeHtml(a.elevation || 'N/A')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  setActive(id) {
    this.activeId = id;
    if (!this.listContainer) return;
    this.listContainer.querySelectorAll('.item-card').forEach(card => {
      const isCardActive = (card.dataset.routeId === id || card.dataset.icao === id);
      if (isCardActive) {
        card.classList.add('active');
        card.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } else {
        card.classList.remove('active');
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
