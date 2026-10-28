/**
 * VNA Route Manual v4.0 - Airport Hover Card (Floating Quick-Preview Popover)
 * Displays essential airport metrics on mouse hover with boundary collision detection.
 * Conforms strictly to VNA UI Styleguide (Light Theme, Soft Badges, Word ADQ).
 */

export class AirportHoverCard {
  /**
   * @param {Object} options
   * @param {Map<string, Object>} options.airportMap
   * @param {(icao: string) => void} options.onSelectAirport
   */
  constructor(options = {}) {
    this.airportMap = options.airportMap || new Map();
    this.onSelectAirport = options.onSelectAirport || (() => {});
    this.hoverTimer = null;
    this.activeIcao = null;
    this.container = null;

    this.initElement();
    this.attachGlobalListeners();
  }

  updateAirportMap(map) {
    this.airportMap = map;
  }

  initElement() {
    let el = document.getElementById('airportHoverPopover');
    if (!el) {
      el = document.createElement('div');
      el.id = 'airportHoverPopover';
      el.className = 'airport-hover-popover';
      document.body.appendChild(el);
    }
    this.container = el;
  }

  attachGlobalListeners() {
    document.addEventListener('mouseover', (e) => {
      const chip = e.target.closest('.airport-chip-link');
      if (chip && chip.dataset.icao) {
        const icao = chip.dataset.icao.toUpperCase();
        this.scheduleShow(chip, icao);
      }
    });

    document.addEventListener('mouseout', (e) => {
      const chip = e.target.closest('.airport-chip-link');
      if (chip) {
        this.cancel();
      }
    });

    // Hide if user scrolls
    window.addEventListener('scroll', () => this.hide(), { passive: true });
    const mainPanel = document.getElementById('mainContentPanel');
    if (mainPanel) {
      mainPanel.addEventListener('scroll', () => this.hide(), { passive: true });
    }
  }

  scheduleShow(targetEl, icao) {
    this.cancel();
    this.hoverTimer = setTimeout(() => {
      this.show(targetEl, icao);
    }, 140);
  }

  cancel() {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.hide();
  }

  hide() {
    if (this.container) {
      this.container.classList.remove('active');
    }
    this.activeIcao = null;
  }

  show(targetEl, icao) {
    const apt = this.airportMap.get(icao);
    if (!apt) return;

    this.activeIcao = icao;
    this.renderContent(apt);

    // Calculate smart positioning
    const rect = targetEl.getBoundingClientRect();
    const popoverWidth = 320;
    const padding = 12;

    let left = rect.left;
    let top = rect.bottom + 6;

    // Boundary check right
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;

    // Boundary check bottom
    if (top + 200 > window.innerHeight - padding) {
      top = rect.top - 200 - 6;
      if (top < padding) top = padding;
    }

    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    this.container.classList.add('active');
  }

  renderContent(apt) {
    const catClass = `tag-cat-${(apt.category || 'A').toLowerCase()}`;
    const cls = apt.classification || {};
    const runways = (apt.runways && apt.runways.length > 0)
      ? apt.runways.slice(0, 3).map(r => `${r.rwy} (${r.length}m)`).join(', ')
      : 'Tham chiếu LIDO';

    this.container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div>
          <div style="font-family:var(--font-mono); font-size:16px; font-weight:700; color:var(--vna-primary);">
            ${escapeHtml(apt.icao)} <span style="font-size:13px; color:var(--text-secondary);">/ ${escapeHtml(apt.iata || '---')}</span>
          </div>
          <div style="font-size:13px; font-weight:600; color:var(--text-primary); margin-top:2px;">
            ${escapeHtml(apt.name || 'Aerodrome')}
          </div>
          <div style="font-size:11.5px; color:var(--text-secondary);">
            ${escapeHtml(apt.country || 'N/A')}
          </div>
        </div>
        <span class="card-tag ${catClass}">CAT ${escapeHtml(apt.category || 'A')}</span>
      </div>

      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <span class="badge badge-soft-gray">RFFS: ${escapeHtml(apt.rffsCategory || 'N/A')}</span>
        <span class="badge badge-soft-gray">ELEV: ${escapeHtml(apt.elevation || 'N/A')}</span>
      </div>

      <!-- Fleet ADQ Strip -->
      <div style="font-size:11px; font-weight:700; color:var(--text-secondary); margin-bottom:4px;">Đội tàu bay khai thác (ADQ):</div>
      <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:4px; text-align:center; font-size:10px; font-family:var(--font-mono); margin-bottom:10px;">
        <div style="background:var(--gray-2); padding:3px 2px; border-radius:3px;">ATR<br><strong style="color:${cls.ATR === 'ADQ' ? 'var(--word-green-adq)' : 'inherit'};">${cls.ATR || '-'}</strong></div>
        <div style="background:var(--gray-2); padding:3px 2px; border-radius:3px;">A320<br><strong style="color:${cls.A320 === 'ADQ' ? 'var(--word-green-adq)' : 'inherit'};">${cls.A320 || '-'}</strong></div>
        <div style="background:var(--gray-2); padding:3px 2px; border-radius:3px;">A321<br><strong style="color:${cls.A321 === 'ADQ' ? 'var(--word-green-adq)' : 'inherit'};">${cls.A321 || '-'}</strong></div>
        <div style="background:var(--gray-2); padding:3px 2px; border-radius:3px;">A350<br><strong style="color:${cls.A350 === 'ADQ' ? 'var(--word-green-adq)' : 'inherit'};">${cls.A350 || '-'}</strong></div>
        <div style="background:var(--gray-2); padding:3px 2px; border-radius:3px;">B787<br><strong style="color:${cls.B787 === 'ADQ' ? 'var(--word-green-adq)' : 'inherit'};">${cls.B787 || '-'}</strong></div>
      </div>

      <div style="font-size:11.5px; color:var(--text-secondary); border-top:1px solid var(--stroke-1); padding-top:6px; margin-bottom:8px;">
        <strong>Đường băng:</strong> ${escapeHtml(runways)}
      </div>

      <div style="text-align:right;">
        <span style="font-size:11px; font-weight:600; color:var(--vna-primary);">Bấm để mở bảng chi tiết Chương 4 →</span>
      </div>
    `;

    this.container.onclick = () => {
      this.hide();
      this.onSelectAirport(apt.icao);
    };
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
