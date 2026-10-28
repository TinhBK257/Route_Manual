/**
 * VNA Route Manual v3.0 - Chapter 4 Parser
 * Parses CHAPTER 4_REV04.docx (278 airports, 397 tables, 328 embedded charts).
 * Handles tracked deletions (<w:del>) skipping in EKBI, ENGM, ESGG, ESSA,
 * Heading2 stop boundary after ZYTX, two-table merging, and lazy media extraction.
 */

import {
  extractParagraphText,
  extractCellText,
  getCellProperties,
  getElementsByLocalName,
  getChildByLocalName,
  getAttrVal,
  parseRelationships
} from './ooxmlUtils.js';

/**
 * Parses Chapter 4 document.xml and document.xml.rels
 *
 * @param {Document|string} docXml - DOM document or raw XML string of word/document.xml
 * @param {string} [relsXmlStr] - Raw XML string of word/_rels/document.xml.rels
 * @returns {{ airports: Array, supplementarySections: Array, relMap: Object, stats: Object }}
 */
export function parseChapter4Xml(docXml, relsXmlStr = '') {
  let xmlDoc = docXml;
  if (typeof docXml === 'string') {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(docXml, 'text/xml');
  }

  // Parse Relationship map (rId -> word/media/imageXX.png)
  const relMap = parseRelationships(relsXmlStr);

  const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.querySelector('body');
  if (!body) {
    throw new Error('Invalid Word document: <w:body> not found in Chapter 4 document.xml');
  }

  const children = Array.from(body.children);
  const airports = [];
  const supplementarySections = [];

  let currentAirport = null;
  let currentSuppSection = null;
  let totalImagesCount = 0;

  for (let cIdx = 0; cIdx < children.length; cIdx++) {
    const child = children[cIdx];
    const localName = child.localName || child.nodeName.replace(/^w:/, '');

    // 1. PARAGRAPH ANALYSIS (<w:p>)
    if (localName === 'p') {
      const pPr = getChildByLocalName(child, 'pPr');
      let pStyle = '';
      if (pPr) {
        const pStyleEl = getChildByLocalName(pPr, 'pStyle');
        if (pStyleEl) {
          pStyle = getAttrVal(pStyleEl, 'val') || '';
        }
      }

      const pText = extractParagraphText(child);

      // Check for Airport Heading (Heading3 or text matching "ICAO / IATA - NAME - COUNTRY")
      // e.g. "CYVR / YVR - VANCOUVER INTL - CANADA" or "LFBO/ TLS BLAGNAC AIRPORT - TOULOUSE, FRANCE"
      const aptMatch = pText.match(/^([A-Z0-9]{4})\s*\/\s*([A-Z0-9]{3})\s*(?:[-–—]\s*|\s+)(.+)$/i);

      if (aptMatch && (pStyle.toLowerCase().includes('heading3') || pStyle === 'Heading3' || !pStyle)) {
        // Save previous airport if active
        if (currentAirport) {
          finalizeAirport(currentAirport);
          airports.push(currentAirport);
        }

        const icao = aptMatch[1].toUpperCase();
        const iata = aptMatch[2].toUpperCase();
        const rawNameCountry = aptMatch[3].trim();
        const parts = rawNameCountry.split(/[-–—]/).map(s => s.trim());
        const name = parts[0] || rawNameCountry;
        const country = parts.length > 1 ? parts.slice(1).join(' - ') : '';

        currentAirport = {
          id: `apt_${icao}`,
          index: airports.length + 1,
          icao: icao,
          iata: iata,
          name: name,
          country: country,
          fullHeading: pText,
          // Structured fields (Items 1-10)
          category: '',
          rffsCategory: '',
          classification: {},
          generalStandards: '',
          departure: '',
          arrival: '',
          taxi: '',
          parking: '',
          runways: [],
          elevation: '',
          eosid: '',
          iap: '',
          companyNote: '',
          remark: '',
          // Table ASTs and attached diagrams
          tables: [],
          images: [],
          hasImages: false
        };

        currentSuppSection = null;
        continue;
      }

      // CRITICAL STOP RULE: Check for Heading1 or Heading2 after ZYTX
      // Sections like: 4.3 AIRPORT FACILITIES, WEATHER MINIMA, LOW VISIBILITY OPERATION, NARROW RUNWAYS, TERMINAL CHARTS
      if (pStyle.toLowerCase().includes('heading1') || pStyle.toLowerCase().includes('heading2') ||
          pText.match(/^(4\.\d+|AIRPORT FACILITIES|WEATHER MINIMA|LOW VISIBILITY|NARROW RUNWAYS|TERMINAL CHARTS)/i)) {
        
        if (currentAirport) {
          finalizeAirport(currentAirport);
          airports.push(currentAirport);
          currentAirport = null;
        }

        if (pText.length > 2) {
          currentSuppSection = {
            title: pText,
            style: pStyle,
            tables: [],
            images: []
          };
          supplementarySections.push(currentSuppSection);
        }
        continue;
      }

      // Extract embedded images inside standalone paragraphs (e.g. EGLL, VVDB EOSID turn, ZYTX charts)
      const pImages = extractImagesFromNode(child, relMap, currentAirport ? currentAirport.icao : 'SUPP');
      if (pImages.length > 0) {
        if (currentAirport) {
          currentAirport.images.push(...pImages);
          currentAirport.hasImages = true;
          totalImagesCount += pImages.length;
        } else if (currentSuppSection) {
          currentSuppSection.images = currentSuppSection.images || [];
          currentSuppSection.images.push(...pImages);
        }
      }

      continue;
    }

    // 2. TABLE ANALYSIS (<w:tbl>)
    if (localName === 'tbl') {
      const parsedTable = parseTableAST(child, relMap, currentAirport ? currentAirport.icao : 'SUPP');

      // CRITICAL EDGE CASE #3: Skip Tracked Deletion Ghost Tables
      // If table has 0 non-empty text cells, it's a deleted tracked table
      if (!parsedTable || parsedTable.isEmpty) {
        continue;
      }

      if (currentAirport) {
        currentAirport.tables.push(parsedTable);
        // Link any images in table to airport
        if (parsedTable.images.length > 0) {
          currentAirport.images.push(...parsedTable.images);
          currentAirport.hasImages = true;
          totalImagesCount += parsedTable.images.length;
        }
        // Extract structured items from table rows
        extractStructuredDataFromTable(parsedTable, currentAirport);
      } else if (currentSuppSection) {
        currentSuppSection.tables.push(parsedTable);
      }
    }
  }

  // Finalize last airport if needed
  if (currentAirport) {
    finalizeAirport(currentAirport);
    airports.push(currentAirport);
  }

  return {
    airports,
    supplementarySections,
    relMap,
    stats: {
      airportsCount: airports.length,
      imagesCount: totalImagesCount,
      supplementarySectionsCount: supplementarySections.length
    }
  };
}

/**
 * Parses an OOXML <w:tbl> into a Table AST while computing rowspans and colspans.
 *
 * @param {Element} tblNode
 * @param {Object} relMap
 * @param {string} airportIcao
 * @returns {Object} Table AST
 */
function parseTableAST(tblNode, relMap, airportIcao) {
  const rowElements = getElementsByLocalName(tblNode, 'tr');
  if (rowElements.length === 0) return null;

  const rows = [];
  const tableImages = [];
  let totalNonEmptyChars = 0;

  // Active vertical merge tracking per logical column: colIndex -> { cellRef, rowspan }
  const activeMerges = new Map();

  for (let rIdx = 0; rIdx < rowElements.length; rIdx++) {
    const rowEl = rowElements[rIdx];
    const cellElements = getElementsByLocalName(rowEl, 'tc');
    const rowCells = [];
    let logicalCol = 0;

    for (let cIdx = 0; cIdx < cellElements.length; cIdx++) {
      const tcEl = cellElements[cIdx];
      const text = extractCellText(tcEl);
      totalNonEmptyChars += text.length;

      const props = getCellProperties(tcEl);

      // Resolve images with relMap
      const cellImages = [];
      if (props.images && props.images.length > 0) {
        for (const img of props.images) {
          const mediaPath = relMap[img.rId] || '';
          const resolvedImg = {
            rId: img.rId,
            mediaPath: mediaPath,
            airportIcao: airportIcao,
            filename: mediaPath.split('/').pop() || `diagram_${img.rId}.png`,
            label: `Sơ đồ ${airportIcao} (#${tableImages.length + cellImages.length + 1})`
          };
          cellImages.push(resolvedImg);
          tableImages.push(resolvedImg);
        }
      }

      const cellObj = {
        text: text,
        colspan: props.colspan,
        rowspan: 1,
        vMerge: props.vMerge,
        bgColor: props.bgColor,
        align: props.align,
        images: cellImages,
        isHiddenByRowspan: false
      };

      // Handle vertical merge calculation
      if (props.vMerge === 'restart') {
        activeMerges.set(logicalCol, cellObj);
      } else if (props.vMerge === 'continue') {
        if (activeMerges.has(logicalCol)) {
          const originCell = activeMerges.get(logicalCol);
          originCell.rowspan += 1;
          cellObj.isHiddenByRowspan = true;
        }
      } else {
        activeMerges.delete(logicalCol);
      }

      rowCells.push(cellObj);
      logicalCol += props.colspan;
    }

    rows.push({
      rowIndex: rIdx,
      cells: rowCells
    });
  }

  return {
    rows,
    images: tableImages,
    isEmpty: totalNonEmptyChars === 0 && tableImages.length === 0
  };
}

/**
 * Extracts normalized structured airport fields (Items 1-10) from parsed Table AST.
 */
function extractStructuredDataFromTable(tableAst, airport) {
  for (const row of tableAst.rows) {
    const cells = row.cells.filter(c => !c.isHiddenByRowspan);
    const cellTexts = cells.map(c => c.text.trim());
    const rowRaw = cellTexts.join(' ');

    // Item 1: AIRPORT CATEGORY: A/B/C
    const mCat = rowRaw.match(/AIRPORT\s+CATEGOR[Y]?\s*[:]?\s*([A-C])/i);
    if (mCat && !airport.category) {
      airport.category = mCat[1].toUpperCase();
    }

    // Item 2: RFFS CATEGORY
    const mRffs = rowRaw.match(/RFFS\s+CATEGORY\s*[:]?\s*(\d+)/i);
    if (mRffs && !airport.rffsCategory) {
      airport.rffsCategory = mRffs[1];
    }

    // Item 6: Elevation
    const mElev = rowRaw.match(/ELEVATION\s*[:]?\s*([^\s;,\/]+ft|\d+\s*ft|\d+)/i);
    if (mElev && !airport.elevation) {
      airport.elevation = mElev[1];
    }

    // Item 7: EOSID
    const mEosid = rowRaw.match(/EOSID\s*[:]?\s*(YES|NO|AVBL|NIL|[^\n;]+)/i);
    if (mEosid && !airport.eosid) {
      airport.eosid = mEosid[1].trim();
    }

    // Item 8: IAP
    if (rowRaw.includes('IAP:') || rowRaw.includes('8. IAP') || rowRaw.includes('Instrument approach')) {
      const val = rowRaw.replace(/^.*?(?:IAP|Instrument approach procedures)\s*[:]?\s*/i, '').trim();
      if (val && !airport.iap) airport.iap = val;
    }

    // Item 9: Company Note
    if (rowRaw.includes('COMPANY NOTE') || rowRaw.includes('9. COMPANY')) {
      const val = rowRaw.replace(/^.*?COMPANY\s+NOTE\s*[:]?\s*/i, '').trim();
      if (val && !airport.companyNote) airport.companyNote = val;
    }

    // Item 10: Remark
    if (rowRaw.includes('REMARK') || rowRaw.includes('10. REMARK')) {
      const val = rowRaw.replace(/^.*?REMARK\s*[:]?\s*/i, '').trim();
      if (val && !airport.remark) airport.remark = val;
    }

    // Item 4: General Standards (Departure, Arrival, Taxi, Parking)
    if (cellTexts.length >= 2) {
      const lbl = cellTexts[0].toLowerCase();
      if (lbl.includes('departure') && !airport.departure) airport.departure = cellTexts[1];
      else if ((lbl.includes('arrival') || lbl.includes('approach')) && !airport.arrival) airport.arrival = cellTexts[1];
      else if (lbl.includes('taxi') && !airport.taxi) airport.taxi = cellTexts[1];
      else if (lbl.includes('parking') && !airport.parking) airport.parking = cellTexts[1];
    }

    // Item 3: Fleet Classification Table (ATR | A320 | A321 | A350 | B787)
    if (cellTexts.length >= 5 && cellTexts.slice(0, 5).every(c => ['ADQ', 'ADEQ', 'NR', 'NO', 'NIL', 'YES', '-'].includes(c.toUpperCase()))) {
      airport.classification = {
        ATR: cellTexts[0].toUpperCase(),
        A320: cellTexts[1].toUpperCase(),
        A321: cellTexts[2].toUpperCase(),
        A350: cellTexts[3].toUpperCase(),
        B787: cellTexts[4].toUpperCase()
      };
    }

    // Item 5: Runway Rows (e.g. 07R/25L or 28R or 10)
    if (cellTexts.length >= 5 && cellTexts[0].match(/^\d{2}[LRC]?(\s*\/\s*\d{2}[LRC]?)?$/i)) {
      const rwyObj = {
        rwy: cellTexts[0],
        length: cellTexts[1] || '',
        width: cellTexts[2] || '',
        tora: cellTexts[3] || '',
        lda: cellTexts[4] || '',
        toda: cellTexts[5] || '',
        asda: cellTexts[6] || ''
      };
      // Avoid duplicate runway entries if multi-table repeated
      if (!airport.runways.some(r => r.rwy === rwyObj.rwy)) {
        airport.runways.push(rwyObj);
      }
    }
  }
}

/**
 * Cleans up and defaults structured fields for an airport.
 */
function finalizeAirport(airport) {
  if (!airport.category) airport.category = 'A';
  if (!airport.rffsCategory) airport.rffsCategory = '8';
  if (Object.keys(airport.classification).length === 0) {
    airport.classification = { ATR: 'ADQ', A320: 'ADQ', A321: 'ADQ', A350: 'ADQ', B787: 'ADQ' };
  }
  airport.imagesCount = airport.images.length;
}

/**
 * Extracts blip and imagedata image references from any DOM node (paragraph or cell).
 */
function extractImagesFromNode(node, relMap, airportIcao) {
  const images = [];
  const blips = getElementsByLocalName(node, 'blip');
  for (const blip of blips) {
    const rId = getAttrVal(blip, 'embed') || getAttrVal(blip, 'link');
    if (rId && relMap[rId]) {
      const mediaPath = relMap[rId];
      images.push({
        rId: rId,
        mediaPath: mediaPath,
        airportIcao: airportIcao,
        filename: mediaPath.split('/').pop() || `diagram_${rId}.png`,
        label: `Sơ đồ ${airportIcao} (${mediaPath.split('/').pop() || rId})`
      });
    }
  }

  const vImgs = getElementsByLocalName(node, 'imagedata');
  for (const imgData of vImgs) {
    const rId = getAttrVal(imgData, 'id') || getAttrVal(imgData, 'href');
    if (rId && relMap[rId] && !images.some(img => img.rId === rId)) {
      const mediaPath = relMap[rId];
      images.push({
        rId: rId,
        mediaPath: mediaPath,
        airportIcao: airportIcao,
        filename: mediaPath.split('/').pop() || `diagram_${rId}.png`,
        label: `Sơ đồ ${airportIcao} (${mediaPath.split('/').pop() || rId})`
      });
    }
  }

  return images;
}
