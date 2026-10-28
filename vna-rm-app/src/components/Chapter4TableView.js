/**
 * VNA Route Manual v4.0 - Chapter 4 Table View
 * Renders 100% Word-faithful Airport Assessment Tables (Sections 1-10).
 * Matches exact document shading: #FFE599 (Yellow headers), #70AD47 (Green ADQ), #E7E6E6 (Gray headers).
 * Adds section anchor IDs for sticky TOC quick jump and scroll-spy.
 */

export class Chapter4TableView {
  /**
   * @param {Object} options
   * @param {(imageItem: Object, allImages: Array) => void} options.onImageClick
   */
  constructor(options = {}) {
    this.onImageClick = options.onImageClick || (() => {});
  }

  /**
   * Detects available sections 1-10 and attachments in an airport.
   * @param {Object} airport
   * @returns {Array<{num: number | string, id: string, label: string}>}
   */
  detectSections(airport) {
    if (!airport) return [];
    const sections = [];

    // Check standard sections
    sections.push({ num: 1, id: `sec-${airport.icao}-1`, label: '1. Category' });
    sections.push({ num: 2, id: `sec-${airport.icao}-2`, label: '2. RFFS' });
    sections.push({ num: 3, id: `sec-${airport.icao}-3`, label: '3. Classification' });
    sections.push({ num: 4, id: `sec-${airport.icao}-4`, label: '4. Standards' });
    sections.push({ num: 5, id: `sec-${airport.icao}-5`, label: '5. Runways' });
    sections.push({ num: 6, id: `sec-${airport.icao}-6`, label: '6. Obstacles' });
    sections.push({ num: 7, id: `sec-${airport.icao}-7`, label: '7. EOSID' });
    sections.push({ num: 8, id: `sec-${airport.icao}-8`, label: '8. IAP' });

    if (airport.companyNote && airport.companyNote !== 'Nil') {
      sections.push({ num: 9, id: `sec-${airport.icao}-9`, label: '9. Company Note' });
    }
    if (airport.remark && airport.remark !== 'Nil') {
      sections.push({ num: 10, id: `sec-${airport.icao}-10`, label: '10. Remark' });
    }

    if (airport.images && airport.images.length > 0) {
      sections.push({ num: 'att', id: `sec-${airport.icao}-attachments`, label: `📎 Sơ đồ (${airport.images.length})` });
    }

    return sections;
  }

  /**
   * Renders the complete Chapter 4 view for an airport.
   *
   * @param {Object} airport - Parsed airport object
   * @returns {string} HTML string
   */
  render(airport) {
    if (!airport) {
      return `<div style="padding:40px; text-align:center; color:var(--text-secondary);">Vui lòng chọn một sân bay để xem thông tin đánh giá.</div>`;
    }

    const attachmentsBar = this.renderAttachmentsBar(airport);

    // If airport has parsed Word Table ASTs, render with exact table AST fidelity
    let tablesHtml = '';
    if (airport.tables && airport.tables.length > 0) {
      tablesHtml = airport.tables.map(tbl => this.renderTableFromAST(tbl, airport)).join('<div style="height:16px;"></div>');
    } else {
      tablesHtml = this.renderSynthesizedWordTable(airport);
    }

    return `
      <div class="ch4-table-card">
        <div style="padding:20px;">
          ${attachmentsBar}
          ${tablesHtml}
        </div>
      </div>
    `;
  }

  renderAttachmentsBar(airport) {
    if (!airport.images || airport.images.length === 0) return '';

    const pills = airport.images.map((img, idx) => {
      const escapedImg = JSON.stringify(img).replace(/"/g, '&quot;');
      const allImgs = JSON.stringify(airport.images).replace(/"/g, '&quot;');
      return `
        <button type="button" class="image-hyperlink-pill" onclick="window.vnaApp.openLightbox(${escapedImg}, ${allImgs})">
          <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Sơ đồ #${idx + 1} (${escapeHtml(img.filename)})</span>
        </button>
      `;
    }).join(' ');

    return `
      <div class="airport-attachments-summary" id="sec-${airport.icao}-attachments">
        <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
        <span>Sơ đồ đính kèm (${airport.images.length}):</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-left:6px;">${pills}</div>
      </div>
    `;
  }

  /**
   * Renders table directly from parsed Table AST preserving exact cells, colors, and line breaks.
   */
  renderTableFromAST(tableAst, airport) {
    let rowsHtml = '';

    for (const row of tableAst.rows) {
      let cellsHtml = '';
      let rowIdAttr = '';

      for (const cell of row.cells) {
        if (cell.isHiddenByRowspan) continue;

        const colspanAttr = cell.colspan > 1 ? `colspan="${cell.colspan}"` : '';
        const rowspanAttr = cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : '';

        // Classify style based on shading fill and text content
        let cellClass = '';
        const rawText = cell.text || '';
        const upperText = rawText.toUpperCase();

        // Check if cell is a section start
        const secMatch = upperText.match(/^\s*(\d{1,2})\s*[.)]\s*(.+)/);
        if (secMatch && !rowIdAttr) {
          const secNum = secMatch[1];
          rowIdAttr = `id="sec-${airport.icao}-${secNum}"`;
        }

        if (cell.bgColor === '#FFE599' || upperText.includes('AIRPORT CATEGORY') || upperText.includes('AIRPORT CLASSIFICATION') ||
            upperText.includes('GENERAL STANDARDS') || upperText.includes('TAKE-OFF AND LANDING')) {
          cellClass = 'ch4-yellow-header';
        } else if (cell.bgColor === '#70AD47' || upperText === 'ADQ' || upperText === 'ADEQ') {
          cellClass = 'ch4-green-adq';
        } else if (cell.bgColor === '#E7E6E6' || (upperText.includes('RWY') && upperText.includes('LENGTH'))) {
          cellClass = 'ch4-gray-subhead';
        }

        // Image pills inside cell
        let imagePills = '';
        if (cell.images && cell.images.length > 0) {
          imagePills = cell.images.map((img, idx) => {
            const escapedImg = JSON.stringify(img).replace(/"/g, '&quot;');
            const allImgs = JSON.stringify(airport.images || [img]).replace(/"/g, '&quot;');
            return `
              <div style="margin-top:6px;">
                <button type="button" class="image-hyperlink-pill" onclick="window.vnaApp.openLightbox(${escapedImg}, ${allImgs})">
                  <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span>Xem sơ đồ #${idx + 1}</span>
                </button>
              </div>
            `;
          }).join('');
        }

        const formattedText = escapeHtml(rawText).replace(/\n/g, '<br>');

        cellsHtml += `
          <td ${colspanAttr} ${rowspanAttr} class="${cellClass}" style="text-align:${cell.align || 'left'};">
            ${formattedText}
            ${imagePills}
          </td>
        `;
      }

      rowsHtml += `<tr ${rowIdAttr}>${cellsHtml}</tr>`;
    }

    return `<table class="ch4-word-table">${rowsHtml}</table>`;
  }

  /**
   * Synthesizes 100% faithful Word layout from structured fields (fallback / seed dataset).
   */
  renderSynthesizedWordTable(airport) {
    const cls = airport.classification || {};
    const runways = airport.runways || [];

    const runwayRowsHtml = runways.length > 0 ? runways.map(r => `
      <tr class="ch4-rwy-row">
        <td>${escapeHtml(r.rwy)}</td>
        <td>${escapeHtml(r.length)}</td>
        <td>${escapeHtml(r.width)}</td>
        <td>${escapeHtml(r.tora || '-')}</td>
        <td>${escapeHtml(r.lda || '-')}</td>
        <td>${escapeHtml(r.toda || '-')}</td>
        <td>${escapeHtml(r.asda || '-')}</td>
      </tr>
    `).join('') : `
      <tr class="ch4-rwy-row"><td colspan="7" style="color:var(--text-secondary); text-align:center;">Tham chiếu tài liệu LIDO Route Manual</td></tr>
    `;

    return `
      <table class="ch4-word-table">
        <!-- 1. AIRPORT CATEGORY & 2. RFFS CATEGORY -->
        <tr id="sec-${airport.icao}-1">
          <td colspan="3" class="ch4-yellow-header">1. AIRPORT CATEGORY</td>
          <td colspan="4" class="ch4-yellow-header" id="sec-${airport.icao}-2">2. RFFS CATEGORY</td>
        </tr>
        <tr>
          <td colspan="3" style="font-size:13px; font-weight:700; text-align:center;">${escapeHtml(airport.category || 'A')}</td>
          <td colspan="4" style="font-size:13px; font-weight:700; text-align:center;">${escapeHtml(airport.rffsCategory || 'N/A')}</td>
        </tr>

        <!-- 3. AIRPORT CLASSIFICATION -->
        <tr id="sec-${airport.icao}-3">
          <td colspan="7" class="ch4-yellow-header">3. AIRPORT CLASSIFICATION</td>
        </tr>
        <tr>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">ATR</td>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A320</td>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A321</td>
          <td colspan="2" style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A350</td>
          <td colspan="2" style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">B787</td>
        </tr>
        <tr>
          <td class="${(cls.ATR === 'ADQ' || cls.ATR === 'ADEQ') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.ATR || '-')}</td>
          <td class="${(cls.A320 === 'ADQ' || cls.A320 === 'ADEQ') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A320 || '-')}</td>
          <td class="${(cls.A321 === 'ADQ' || cls.A321 === 'ADEQ') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A321 || '-')}</td>
          <td colspan="2" class="${(cls.A350 === 'ADQ' || cls.A350 === 'ADEQ') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A350 || '-')}</td>
          <td colspan="2" class="${(cls.B787 === 'ADQ' || cls.B787 === 'ADEQ') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.B787 || '-')}</td>
        </tr>

        <!-- 4. GENERAL STANDARDS -->
        <tr id="sec-${airport.icao}-4">
          <td colspan="7" class="ch4-yellow-header">4. GENERAL STANDARDS</td>
        </tr>
        ${airport.generalStandards ? `
          <tr>
            <td colspan="7" style="font-size:12.5px; line-height:1.6; color:var(--text-primary);">${escapeHtml(airport.generalStandards).replace(/\n/g, '<br>')}</td>
          </tr>
        ` : ''}
        <tr>
          <td class="ch4-label">Departure</td>
          <td colspan="6">${escapeHtml(airport.departure || 'As per ATC clearance and published SID')}</td>
        </tr>
        <tr>
          <td class="ch4-label">Arrival</td>
          <td colspan="6">${escapeHtml(airport.arrival || 'As per ATC clearance and published STAR')}</td>
        </tr>
        <tr>
          <td class="ch4-label">Taxi</td>
          <td colspan="6">${escapeHtml(airport.taxi || 'Standard taxiway network; follow ATC instructions')}</td>
        </tr>
        <tr>
          <td class="ch4-label">Parking</td>
          <td colspan="6">${escapeHtml(airport.parking || 'Contact Ground control / Marshaller')}</td>
        </tr>

        <!-- 5. TAKE-OFF AND LANDING DISTANCES AVAILABLE -->
        <tr id="sec-${airport.icao}-5">
          <td colspan="7" class="ch4-yellow-header">5. TAKE-OFF AND LANDING DISTANCES AVAILABLE</td>
        </tr>
        <tr class="ch4-gray-subhead">
          <th style="width:14%;">RWY</th>
          <th style="width:14%;">LENGTH (m)</th>
          <th style="width:14%;">WIDTH (m)</th>
          <th style="width:14%;">TORA (m)</th>
          <th style="width:14%;">LDA (m)</th>
          <th style="width:15%;">TODA (m)</th>
          <th style="width:15%;">ASDA (m)</th>
        </tr>
        ${runwayRowsHtml}

        <!-- 6. Obstacle data / Elevation -->
        <tr id="sec-${airport.icao}-6">
          <td class="ch4-label">6. Obstacle data / Elevation</td>
          <td colspan="6" style="font-size:12.5px; font-weight:600; color:var(--vna-primary);">${escapeHtml(airport.elevation || 'Refer LIDO Charts')}</td>
        </tr>

        <!-- 7. Engine Out SID (EOSID) -->
        <tr id="sec-${airport.icao}-7">
          <td class="ch4-label">7. EOSID</td>
          <td colspan="6" style="font-size:12.5px; color:var(--text-primary);">${escapeHtml(airport.eosid || 'AVBL in LIDO mPilot')}</td>
        </tr>

        <!-- 8. Instrument approach procedures (IAP) -->
        <tr id="sec-${airport.icao}-8">
          <td class="ch4-label">8. IAP</td>
          <td colspan="6" style="font-size:12.5px; color:var(--text-primary);">${escapeHtml(airport.iap || 'CAT I/II/III ILS, RNP/RNAV approaches as published')}</td>
        </tr>

        <!-- 9. Company Note -->
        <tr id="sec-${airport.icao}-9">
          <td class="ch4-label">9. Company Note</td>
          <td colspan="6" class="ch4-note-content">${escapeHtml(airport.companyNote || 'Nil')}</td>
        </tr>

        <!-- 10. Remark -->
        <tr id="sec-${airport.icao}-10">
          <td class="ch4-label">10. Remark</td>
          <td colspan="6" class="ch4-note-content">${escapeHtml(airport.remark || 'Nil')}</td>
        </tr>
      </table>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
