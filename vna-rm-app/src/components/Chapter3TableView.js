/**
 * VNA Route Manual v4.0 - Chapter 3 Table View
 * Renders 100% Word-faithful Route Tables (5 columns) with exact proportions,
 * dark #262626 banners, checkbox EDTO rendering, interactive airport links,
 * and support for both Single Route Mode and Continuous Region Document Mode.
 */

import { linkifyCityPairHeader, linkifyAirportList, createAirportLinkHtml } from '../utils/airportLinker.js';

export class Chapter3TableView {
  /**
   * @param {Object} options
   * @param {Map<string, Object>} options.airportMap
   * @param {(mode: string) => void} options.onModeChange
   */
  constructor(options = {}) {
    this.airportMap = options.airportMap || new Map();
    this.viewMode = 'single'; // 'single' | 'region'
    this.activeRouteId = null;
    this.activeRegion = null;
    this.onModeChange = options.onModeChange || (() => {});
  }

  updateAirportMap(map) {
    this.airportMap = map;
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.onModeChange(mode);
  }

  /**
   * Renders Chapter 3 view into container based on current mode.
   *
   * @param {Object} route - Selected route object
   * @param {Array<Object>} allRoutesInRegion - All routes in current region (for continuous mode)
   * @returns {string} HTML string
   */
  render(route, allRoutesInRegion = []) {
    if (!route) {
      return `<div style="padding:40px; text-align:center; color:var(--text-secondary);">Vui lòng chọn một chặng bay trong danh sách để xem tài liệu đường bay.</div>`;
    }

    this.activeRouteId = route.id;
    this.activeRegion = route.region;

    const modeToggleBar = this.renderModeToggleBar(route);
    const legendBar = this.renderRoleLegendBar();

    if (this.viewMode === 'single') {
      return `
        <div class="doc-page-container">
          ${modeToggleBar}
          <div class="paper-card">
            ${legendBar}
            ${this.renderSingleRouteTable(route)}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="doc-page-container">
          ${modeToggleBar}
          <div class="paper-card">
            ${legendBar}
            ${this.renderRegionContinuousDocument(route.region, allRoutesInRegion, route.id)}
          </div>
        </div>
      `;
    }
  }

  renderModeToggleBar(route) {
    const isSingle = this.viewMode === 'single';
    return `
      <div class="ch3-view-mode-bar">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="color:var(--vna-primary);"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <span style="font-weight:700; color:var(--text-primary); font-size:13.5px;">Chương 3: Bảng Đường Bay — ${escapeHtml(route.region)}</span>
        </div>

        <div class="mode-toggle-group">
          <div class="btn-group">
            <button type="button" class="btn-group-item ${isSingle ? 'active' : ''}" onclick="window.vnaApp.switchCh3ViewMode('single')">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16m-7 6h7"/></svg>
              <span>Xem 1 Chặng (${escapeHtml(route.cityPair)})</span>
            </button>
            <button type="button" class="btn-group-item ${!isSingle ? 'active' : ''}" onclick="window.vnaApp.switchCh3ViewMode('region')">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              <span>Cuộn Cả Khu Vực (${escapeHtml(route.region)})</span>
            </button>
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.vnaApp.copyRouteBrief('${route.id}')" title="Sao chép tóm tắt chặng bay" style="margin-left:8px;">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span>Sao chép</span>
          </button>
        </div>
      </div>
    `;
  }

  renderRoleLegendBar() {
    return `
      <div class="ch3-role-legend-bar">
        <span style="font-weight:700; color:var(--text-primary);">Ký hiệu mã sân bay:</span>
        <span class="role-legend-item">
          <span class="role-swatch" style="background-color:var(--role-dep);"></span>
          <span>Khởi hành (DEP)</span>
        </span>
        <span class="role-legend-item">
          <span class="role-swatch" style="background-color:var(--role-arr);"></span>
          <span>Đến (ARR)</span>
        </span>
        <span class="role-legend-item">
          <span class="role-swatch" style="background-color:var(--role-dest-alt);"></span>
          <span>Dự bị đích (DEST ALT)</span>
        </span>
        <span class="role-legend-item">
          <span class="role-swatch" style="background-color:var(--role-enr-alt);"></span>
          <span>Dự bị đường dài (ENR ALT)</span>
        </span>
      </div>
    `;
  }

  /**
   * Renders the 4-column Word table header banner.
   */
  renderHeaderBannerTable() {
    return `
      <table class="ch3-region-banner-table">
        <colgroup>
          <col class="col-banner-no">
          <col class="col-banner-pair">
          <col class="col-banner-route">
          <col class="col-banner-alt">
        </colgroup>
        <thead>
          <tr>
            <th>No</th>
            <th>City pairs</th>
            <th>Standard routes DB name</th>
            <th>Preferred destination alternate airports</th>
          </tr>
        </thead>
      </table>
    `;
  }

  /**
   * Renders a single route table matching 100% Word document structure.
   */
  renderSingleRouteTable(route, options = {}) {
    const isFlashing = options.highlight === true;
    const bannerTitle = linkifyCityPairHeader(`${route.number ? `${route.number}. ` : ''}${route.cityPair}`, this.airportMap);

    // Build Leg Rows
    const legRowsHtml = (route.legs || []).map((leg, idx) => {
      const depLink = createAirportLinkHtml(leg.dep, leg.dep, 'dep');
      const arrLink = createAirportLinkHtml(leg.arr, leg.arr, 'arr');
      const alternatesHtml = (leg.destAlternates && leg.destAlternates.length > 0)
        ? linkifyAirportList(leg.destAlternates.join(', '), 'dest-alt', this.airportMap)
        : '<span style="color:var(--text-secondary);">Nil</span>';

      return `
        <tr class="ch3-row-leg">
          <td class="cell-no">${idx + 1}</td>
          <td class="cell-dep">${depLink}</td>
          <td class="cell-arr">${arrLink}</td>
          <td class="cell-route">${escapeHtml(leg.routeName || '-')}</td>
          <td class="cell-dest-alt">${alternatesHtml}</td>
        </tr>
      `;
    }).join('');

    // Metadata rows
    const enrouteAltsHtml = (route.enrouteAlternates && route.enrouteAlternates.length > 0)
      ? linkifyAirportList(route.enrouteAlternates.join(', '), 'enr-alt', this.airportMap)
      : '<span style="color:var(--text-secondary);">Nil</span>';

    const getDepressValue = (r) => {
      if (r.depressurization) return r.depressurization;
      const meta = r.metadata || r.rawMeta;
      if (!meta) return '';
      if (meta['Depressurization Procedure']) return meta['Depressurization Procedure'];
      if (meta['Depressurisation Procedure']) return meta['Depressurisation Procedure'];
      if (meta['Depressurization procedure']) return meta['Depressurization procedure'];
      if (meta['Depressurisation procedure']) return meta['Depressurisation procedure'];
      for (const [k, v] of Object.entries(meta)) {
        const kLower = k.toLowerCase();
        if (kLower.includes('depressur') || kLower.includes('escape route')) {
          return v;
        }
      }
      return '';
    };

    const depressVal = getDepressValue(route).trim();

    return `
      <div class="ch3-table-wrapper ${isFlashing ? 'highlight-flash' : ''}" id="route-${route.id}">
        ${this.renderHeaderBannerTable()}
        <table class="ch3-word-table">
          <colgroup>
            <col class="col-no">
            <col class="col-dep">
            <col class="col-arr">
            <col class="col-route">
            <col class="col-alt">
          </colgroup>
          <tbody>
            <!-- Route Dark Title Row -->
            <tr class="ch3-row-title">
              <td colspan="5">${bannerTitle}</td>
            </tr>

            <!-- Legs -->
            ${legRowsHtml}

            <!-- Area of Operation -->
            <tr class="ch3-row-meta">
              <td class="meta-label">Area Operation</td>
              <td colspan="4" class="meta-value">${escapeHtml(route.areaOperation || 'N/A')}</td>
            </tr>

            <!-- Preferred En-route Alternates -->
            <tr class="ch3-row-meta">
              <td class="meta-label">Preferred Enroute Alternate Airport</td>
              <td colspan="4" class="meta-value">${enrouteAltsHtml}</td>
            </tr>

            <!-- RVSM -->
            <tr class="ch3-row-meta">
              <td class="meta-label">RVSM</td>
              <td colspan="4" class="meta-value">${escapeHtml(route.rvsm || 'Required')}</td>
            </tr>

            <!-- EDTO -->
            <tr class="ch3-row-meta">
              <td class="meta-label">EDTO</td>
              <td colspan="4" class="meta-value"><span class="edto-checkbox-tick">${escapeHtml(route.edto || 'N/A')}</span></td>
            </tr>

            <!-- PBN -->
            <tr class="ch3-row-meta">
              <td class="meta-label">PBN</td>
              <td colspan="4" class="meta-value">${escapeHtml(route.pbn || 'N/A')}</td>
            </tr>

            <!-- Datalink (matching official Word document, no fabricated Voice fields) -->
            <tr class="ch3-row-meta">
              <td class="meta-label">Datalink</td>
              <td colspan="4" class="meta-value">${escapeHtml(route.datalink || 'CPDLC/ ADS-C, ADS-B')}</td>
            </tr>

            <!-- Depressurization Procedure (Between Datalink and Flight level) -->
            ${depressVal ? `
              <tr class="ch3-row-meta">
                <td class="meta-label">Depressurization Procedure</td>
                <td colspan="4" class="meta-value">${escapeHtml(depressVal).replace(/\n/g, '<br>')}</td>
              </tr>
            ` : ''}

            <!-- Flight Level -->
            <tr class="ch3-row-meta">
              <td class="meta-label">Flight level</td>
              <td colspan="4" class="meta-value">${escapeHtml(route.flightLevel || 'N/A')}</td>
            </tr>

            <!-- Restrictions -->
            ${route.restriction ? `
              <tr class="ch3-row-meta">
                <td class="meta-label">Restriction</td>
                <td colspan="4" class="meta-value" style="font-size:12px; line-height:1.5;">${escapeHtml(route.restriction).replace(/\n/g, '<br>')}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders the entire region continuously.
   */
  renderRegionContinuousDocument(regionName, routesList, targetRouteId) {
    if (!routesList || routesList.length === 0) {
      return `<div style="padding:30px; text-align:center; color:var(--text-secondary);">Không có dữ liệu đường bay cho khu vực ${escapeHtml(regionName)}.</div>`;
    }

    const tablesHtml = routesList.map(r => this.renderSingleRouteTable(r, { highlight: r.id === targetRouteId })).join('');

    return `
      <div>
        <div style="font-size:16px; font-weight:800; color:var(--vna-primary); margin-bottom:14px; padding-bottom:8px; border-bottom:2px solid var(--vna-primary);">
          TOÀN BỘ KHU VỰC: ${escapeHtml(regionName).toUpperCase()} (${routesList.length} CHẶNG BAY)
        </div>
        ${tablesHtml}
      </div>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
