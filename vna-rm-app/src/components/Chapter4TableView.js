/**
 * VNA Route Manual v4.0 - Chapter 4 Table View
 * Renders 100% Word-faithful Airport Assessment Tables (Sections 1-10).
 * Matches exact document shading: #FFE599 (Yellow headers), #70AD47 (Green ADQ), #E7E6E6 (Gray headers).
 * Adds section anchor IDs on specific cells for sticky TOC quick jump and scroll-spy.
 * Seamlessly handles two-table continuation, auxiliary tables, and safety notes.
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

    // Standard sections 1-8 always present in Chapter 4 airport tables
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

    if (airport.notes && airport.notes.length > 0) {
      sections.push({ num: 'note', id: `sec-${airport.icao}-notes`, label: '⚠️ Quy trình an toàn' });
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
      const seenSections = new Set();
      tablesHtml = airport.tables.map((tbl, tIdx) => {
        const isContinuation = tIdx > 0 && this.isContinuationTable(tbl);
        const isAuxTable = tIdx > 0 && !isContinuation;
        const auxTitle = isAuxTable ? this.getAuxTableTitle(tbl) : '';

        return `
          ${auxTitle ? `<div class="ch4-aux-table-title">${escapeHtml(auxTitle)}</div>` : ''}
          ${this.renderTableFromAST(tbl, airport, seenSections)}
        `;
      }).join('<div style="height:12px;"></div>');
    } else {
      tablesHtml = this.renderSynthesizedWordTable(airport);
    }

    const notesHtml = this.renderAirportNotes(airport);

    return `
      <div class="ch4-table-card">
        <div style="padding:20px;">
          ${attachmentsBar}
          ${tablesHtml}
          ${notesHtml}
        </div>
      </div>
    `;
  }

  renderAttachmentsBar(airport) {
    if (!airport.images || airport.images.length === 0) return '';

    const pills = airport.images.map((img, idx) => {
      const diagNum = img.diagramNumber || (idx + 1);
      const escapedImg = JSON.stringify(img).replace(/"/g, '&quot;');
      const allImgs = JSON.stringify(airport.images).replace(/"/g, '&quot;');
      return `
        <button type="button" class="image-hyperlink-pill" onclick="window.vnaApp.openLightbox(${escapedImg}, ${allImgs})">
          <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          <span>Sơ đồ #${diagNum} (${escapeHtml(img.filename)})</span>
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

  isContinuationTable(tbl) {
    if (!tbl || !tbl.rows || tbl.rows.length === 0) return false;
    const firstRow = tbl.rows[0];
    const firstRowText = firstRow.cells.map(c => c.text || '').join(' ').toUpperCase();
    return firstRowText.includes('TAKE-OFF') || firstRowText.includes('ELEVATION') ||
           firstRowText.includes('EOSID') || firstRowText.includes('RWY') ||
           firstRowText.includes('TAXI') || firstRowText.includes('DEPARTURE') ||
           firstRowText.includes('ARRIVAL') || firstRowText.includes('PARKING') ||
           firstRowText.includes('IAP') || firstRowText.includes('COMPANY NOTE') ||
           firstRowText.includes('REMARK');
  }

  getAuxTableTitle(tbl) {
    const firstRow = tbl.rows[0];
    const firstRowText = firstRow.cells.map(c => c.text || '').join(' ').trim();
    if (firstRowText.toLowerCase().includes('noise monitoring')) {
      return '(*) Noise Monitoring Terminal at Heathrow Airport';
    }
    return `(*) Bảng dữ liệu bổ sung (${firstRow.cells[0]?.text || 'Chi tiết'})`;
  }

  /**
   * Renders standalone paragraphs / safety procedures outside tables.
   */
  renderAirportNotes(airport) {
    if (!airport.notes || airport.notes.length === 0) return '';

    const validNotes = airport.notes.filter(n => (n.text && n.text.trim().length > 0) || (n.images && n.images.length > 0));
    if (validNotes.length === 0) return '';

    const noteItemsHtml = validNotes.map(n => {
      const rawText = (n.text || '').trim();
      const isAlert = rawText.includes('mandatory') || rawText.includes('MỆNH LỆNH AN TOÀN') || rawText.includes('special engine-out') || rawText.includes('EOSID');

      let imgPills = '';
      if (n.images && n.images.length > 0) {
        imgPills = n.images.map(img => {
          const matched = (airport.images || []).find(ai => ai.rId === img.rId || (img.mediaPath && ai.mediaPath === img.mediaPath));
          const diagNum = matched?.diagramNumber || 1;
          const escapedImg = JSON.stringify(matched || img).replace(/"/g, '&quot;');
          const allImgs = JSON.stringify(airport.images || [img]).replace(/"/g, '&quot;');
          return `
            <div style="margin-top:6px;">
              <button type="button" class="image-hyperlink-pill" onclick="window.vnaApp.openLightbox(${escapedImg}, ${allImgs})">
                <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span>Xem sơ đồ #${diagNum} (${escapeHtml(img.filename)})</span>
              </button>
            </div>
          `;
        }).join('');
      }

      if (isAlert) {
        return `
          <div class="ch4-note-alert">
            <div>${escapeHtml(rawText)}</div>
            ${imgPills}
          </div>
        `;
      }

      return `
        <div class="ch4-note-item">
          <div>${escapeHtml(rawText)}</div>
          ${imgPills}
        </div>
      `;
    }).join('');

    return `
      <div class="ch4-notes-card" id="sec-${airport.icao}-notes">
        <div style="font-size:12.5px; font-weight:700; color:var(--vna-primary); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Ghi chú khai thác & Quy trình an toàn bổ sung:</span>
        </div>
        ${noteItemsHtml}
      </div>
    `;
  }

  /**
   * Renders table directly from parsed Table AST preserving exact cells, colors, and line breaks.
   */
  renderTableFromAST(tableAst, airport, seenSections = new Set()) {
    let rowsHtml = '';

    for (const row of tableAst.rows) {
      let cellsHtml = '';

      for (const cell of row.cells) {
        if (cell.isHiddenByRowspan) continue;

        const colspanAttr = cell.colspan > 1 ? `colspan="${cell.colspan}"` : '';
        const rowspanAttr = cell.rowspan > 1 ? `rowspan="${cell.rowspan}"` : '';

        const rawText = cell.text || '';
        const upperText = rawText.toUpperCase();

        // Detect section number for anchor id (handles both numbered "1. Category" and unnumbered "AIRPORT CATEGORY")
        const secNum = detectSectionNumber(rawText);
        let cellIdAttr = '';
        if (secNum && !seenSections.has(secNum)) {
          seenSections.add(secNum);
          cellIdAttr = `id="sec-${airport.icao}-${secNum}"`;
        }

        // Classify style based on shading fill and text content
        let cellClass = '';
        if (cell.bgColor === '#FFE599' || upperText.includes('AIRPORT CATEGORY') || upperText.includes('AIRPORT CLASSIFICATION') ||
            upperText.includes('GENERAL STANDARDS') || upperText.includes('TAKE-OFF AND LANDING')) {
          cellClass = 'ch4-yellow-header';
        } else if (cell.bgColor === '#70AD47' || upperText === 'ADQ' || upperText === 'ADEQ' || upperText === 'AQD') {
          cellClass = 'ch4-green-adq';
        } else if (cell.bgColor === '#E7E6E6' || (upperText.includes('RWY') && upperText.includes('LENGTH'))) {
          cellClass = 'ch4-gray-subhead';
        }

        // Image pills inside cell
        let imagePills = '';
        if (cell.images && cell.images.length > 0) {
          imagePills = cell.images.map((img) => {
            const matched = (airport.images || []).find(ai => ai.rId === img.rId || (img.mediaPath && ai.mediaPath === img.mediaPath));
            const diagNum = matched?.diagramNumber || 1;
            const escapedImg = JSON.stringify(matched || img).replace(/"/g, '&quot;');
            const allImgs = JSON.stringify(airport.images || [img]).replace(/"/g, '&quot;');
            return `
              <div style="margin-top:6px;">
                <button type="button" class="image-hyperlink-pill" onclick="window.vnaApp.openLightbox(${escapedImg}, ${allImgs})">
                  <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span>Xem sơ đồ #${diagNum}</span>
                </button>
              </div>
            `;
          }).join('');
        }

        const formattedText = escapeHtml(rawText).replace(/\n/g, '<br>');

        cellsHtml += `
          <td ${colspanAttr} ${rowspanAttr} ${cellIdAttr} class="${cellClass}" style="text-align:${cell.align || 'left'};">
            ${formattedText}
            ${imagePills}
          </td>
        `;
      }

      rowsHtml += `<tr>${cellsHtml}</tr>`;
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
        <tr>
          <td colspan="3" class="ch4-yellow-header" id="sec-${airport.icao}-1">1. AIRPORT CATEGORY</td>
          <td colspan="4" class="ch4-yellow-header" id="sec-${airport.icao}-2">2. RFFS CATEGORY</td>
        </tr>
        <tr>
          <td colspan="3" style="font-size:13px; font-weight:700; text-align:center;">${escapeHtml(airport.category || 'A')}</td>
          <td colspan="4" style="font-size:13px; font-weight:700; text-align:center;">${escapeHtml(airport.rffsCategory || 'N/A')}</td>
        </tr>

        <!-- 3. AIRPORT CLASSIFICATION -->
        <tr>
          <td colspan="7" class="ch4-yellow-header" id="sec-${airport.icao}-3">3. AIRPORT CLASSIFICATION</td>
        </tr>
        <tr>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">ATR</td>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A320</td>
          <td style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A321</td>
          <td colspan="2" style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">A350</td>
          <td colspan="2" style="font-weight:700; text-align:center; background:#FFF2CC; color:#0D0D0D;">B787</td>
        </tr>
        <tr>
          <td class="${(cls.ATR === 'ADQ' || cls.ATR === 'ADEQ' || cls.ATR === 'AQD') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.ATR || '-')}</td>
          <td class="${(cls.A320 === 'ADQ' || cls.A320 === 'ADEQ' || cls.A320 === 'AQD') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A320 || '-')}</td>
          <td class="${(cls.A321 === 'ADQ' || cls.A321 === 'ADEQ' || cls.A321 === 'AQD') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A321 || '-')}</td>
          <td colspan="2" class="${(cls.A350 === 'ADQ' || cls.A350 === 'ADEQ' || cls.A350 === 'AQD') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.A350 || '-')}</td>
          <td colspan="2" class="${(cls.B787 === 'ADQ' || cls.B787 === 'ADEQ' || cls.B787 === 'AQD') ? 'ch4-green-adq' : ''}">${escapeHtml(cls.B787 || '-')}</td>
        </tr>

        <!-- 4. GENERAL STANDARDS -->
        <tr>
          <td colspan="7" class="ch4-yellow-header" id="sec-${airport.icao}-4">4. GENERAL STANDARDS</td>
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
        <tr>
          <td colspan="7" class="ch4-yellow-header" id="sec-${airport.icao}-5">5. TAKE-OFF AND LANDING DISTANCES AVAILABLE</td>
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
        <tr>
          <td class="ch4-label" id="sec-${airport.icao}-6">6. Obstacle data / Elevation</td>
          <td colspan="6" style="font-size:12.5px; font-weight:600; color:var(--vna-primary);">${escapeHtml(airport.elevation || 'Refer LIDO Charts')}</td>
        </tr>

        <!-- 7. Engine Out SID (EOSID) -->
        <tr>
          <td class="ch4-label" id="sec-${airport.icao}-7">7. EOSID</td>
          <td colspan="6" style="font-size:12.5px; color:var(--text-primary);">${escapeHtml(airport.eosid || 'AVBL in LIDO mPilot')}</td>
        </tr>

        <!-- 8. Instrument approach procedures (IAP) -->
        <tr>
          <td class="ch4-label" id="sec-${airport.icao}-8">8. IAP</td>
          <td colspan="6" style="font-size:12.5px; color:var(--text-primary);">${escapeHtml(airport.iap || 'CAT I/II/III ILS, RNP/RNAV approaches as published')}</td>
        </tr>

        <!-- 9. Company Note -->
        <tr>
          <td class="ch4-label" id="sec-${airport.icao}-9">9. Company Note</td>
          <td colspan="6" class="ch4-note-content">${escapeHtml(airport.companyNote || 'Nil')}</td>
        </tr>

        <!-- 10. Remark -->
        <tr>
          <td class="ch4-label" id="sec-${airport.icao}-10">10. Remark</td>
          <td colspan="6" class="ch4-note-content">${escapeHtml(airport.remark || 'Nil')}</td>
        </tr>
      </table>
    `;
  }
}

/**
 * Detects section number from text (1..10) for both numbered and unnumbered Word headers.
 */
function detectSectionNumber(rawText) {
  if (!rawText) return null;
  const upper = rawText.toUpperCase().trim();

  // 1. Explicit numbering (e.g. "1. AIRPORT CATEGORY" or "1) AIRPORT CATEGORY")
  const m = upper.match(/^\s*(\d{1,2})\s*[.)\s]\s*(.+)/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 10) return num;
  }

  // 2. Keyword detection for unnumbered headers
  if (upper.includes('AIRPORT CATEGORY')) return 1;
  if (upper.includes('RFFS CATEGORY')) return 2;
  if (upper.includes('AIRPORT CLASSIFICATION') || upper === 'CLASSIFICATION') return 3;
  if (upper.includes('GENERAL STANDARDS')) return 4;
  if (upper.includes('TAKE-OFF AND LANDING') || (upper.includes('RWY') && upper.includes('LENGTH') && upper.includes('WIDTH'))) return 5;
  if (upper.startsWith('ELEVATION') || upper.includes('OBSTACLE DATA')) return 6;
  if (upper.startsWith('EOSID') || upper.includes('ENGINE OUT SID')) return 7;
  if (upper.startsWith('IAP') || upper.includes('INSTRUMENT APPROACH')) return 8;
  if (upper.startsWith('COMPANY NOTE') || upper.includes('COMPANY NOTE')) return 9;
  if (upper.startsWith('REMARK') || upper.includes('REMARK')) return 10;

  return null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
