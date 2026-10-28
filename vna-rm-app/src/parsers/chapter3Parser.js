/**
 * VNA Route Manual v3.0 - Chapter 3 Parser
 * Parses CHAPTER 3_NEW_AMD.docx (flight route tables across 7 regions).
 * Resolves Table 18 empty template trap, FORMCHECKBOX EDTO ticks,
 * multi-leg triangular routes, and exact Word table layouts.
 */

import {
  extractParagraphText,
  extractCellText,
  getCellProperties,
  getElementsByLocalName
} from './ooxmlUtils.js';

/**
 * Parses Chapter 3 .docx file or XML document.
 *
 * @param {Document|string} docXml - DOM document or raw XML string of word/document.xml
 * @returns {Promise<{ routes: Array, regions: Array, airportRouteIndex: Object }>}
 */
export function parseChapter3Xml(docXml) {
  let xmlDoc = docXml;
  if (typeof docXml === 'string') {
    const parser = new DOMParser();
    xmlDoc = parser.parseFromString(docXml, 'text/xml');
  }

  const body = xmlDoc.getElementsByTagName('w:body')[0] || xmlDoc.querySelector('body');
  if (!body) {
    throw new Error('Invalid Word document: <w:body> not found in document.xml');
  }

  const children = Array.from(body.children);
  const routes = [];
  const regions = [];
  const regionMap = new Map();

  let currentRegion = {
    id: 'reg_gen',
    code: '3.3.2.0',
    title: 'General Routes',
    name: 'General',
    routeCount: 0
  };

  let globalRouteSeq = 1;

  for (let cIdx = 0; cIdx < children.length; cIdx++) {
    const child = children[cIdx];
    const localName = child.localName || child.nodeName.replace(/^w:/, '');

    // 1. Detect Section & Geographic Region Headings
    if (localName === 'p') {
      const pText = extractParagraphText(child);
      const regionMatch = pText.match(/^(3\.3\.2\.\d+)\s+(.+)$/);
      if (regionMatch) {
        const code = regionMatch[1];
        const rawTitle = regionMatch[2].trim();
        // Clean title (e.g. "North American routes" -> "North American")
        const cleanName = rawTitle.replace(/\s+routes$/i, '').trim();
        
        currentRegion = {
          id: `reg_${code.replace(/\./g, '_')}`,
          code: code,
          title: rawTitle,
          name: cleanName,
          fullHeading: pText,
          routeCount: 0
        };

        if (!regionMap.has(currentRegion.id)) {
          regionMap.set(currentRegion.id, currentRegion);
          regions.push(currentRegion);
        }
      }
      continue;
    }

    // 2. Parse Route Tables (<w:tbl>)
    if (localName === 'tbl') {
      const rows = getElementsByLocalName(child, 'tr');
      if (rows.length === 0) continue;

      // Check if table is just the 4-column column heading banner
      const firstRowCells = getElementsByLocalName(rows[0], 'tc');
      if (firstRowCells.length > 0) {
        const firstCellText = extractCellText(firstRowCells[0]).trim();
        if (firstCellText === 'No' || firstCellText.toLowerCase().includes('city pairs')) {
          // If only 1 or 2 rows, it's just a header banner table
          if (rows.length <= 2) continue;
        }
      }

      let rIdx = 0;
      while (rIdx < rows.length) {
        const row = rows[rIdx];
        const cells = getElementsByLocalName(row, 'tc');
        if (cells.length === 0) {
          rIdx++;
          continue;
        }

        const cell0Props = getCellProperties(cells[0]);
        const cell0Text = extractCellText(cells[0]);

        const isHeaderRow = isRouteHeaderRow(cell0Props, cell0Text, cells.length);

        if (isHeaderRow) {
          const rawTitle = cell0Text.trim();
          // Extract leading numbering e.g. "1. SGN - SFO - SGN" -> num "1", pair "SGN - SFO - SGN"
          let routeNo = String(globalRouteSeq);
          let cityPair = rawTitle;

          const numMatch = rawTitle.match(/^(\d+)[\.\s]+(.+)$/);
          if (numMatch) {
            routeNo = numMatch[1];
            cityPair = numMatch[2].trim();
          }

          rIdx++;

          const legs = [];
          const metadata = {};
          const rawTableRows = [];

          // Add title row to raw AST
          rawTableRows.push({
            type: 'title',
            text: rawTitle,
            routeNo: routeNo,
            cityPair: cityPair,
            bgColor: cell0Props.bgColor || '#262626'
          });

          // Scan all subsequent rows of this route block until next route header or table end
          while (rIdx < rows.length) {
            const nextRow = rows[rIdx];
            const nextCells = getElementsByLocalName(nextRow, 'tc');
            if (nextCells.length === 0) {
              rIdx++;
              continue;
            }

            const nextCell0Props = getCellProperties(nextCells[0]);
            const nextCell0Text = extractCellText(nextCells[0]);

            // If next row starts a new route block, stop
            if (isRouteHeaderRow(nextCell0Props, nextCell0Text, nextCells.length)) {
              break;
            }

            const cellTexts = nextCells.map(c => extractCellText(c).trim());

            // Check if this is a Leg Row:
            // Typically 5 cells: [No, Dep, Arr, Route Name, Dest Alternates]
            // Or 4 cells if cell 0 was vertically merged
            const isLegRow = (cellTexts.length >= 5 && isValidIcao(cellTexts[1]) && isValidIcao(cellTexts[2])) ||
                             (cellTexts.length === 4 && isValidIcao(cellTexts[0]) && isValidIcao(cellTexts[1]));

            if (isLegRow) {
              let depIcao, arrIcao, routeName, altStr;
              if (cellTexts.length >= 5) {
                depIcao = cellTexts[1].toUpperCase();
                arrIcao = cellTexts[2].toUpperCase();
                routeName = cellTexts[3];
                altStr = cellTexts[4];
              } else {
                depIcao = cellTexts[0].toUpperCase();
                arrIcao = cellTexts[1].toUpperCase();
                routeName = cellTexts[2];
                altStr = cellTexts[3];
              }

              const alternates = altStr
                ? altStr.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(s => isValidIcao(s))
                : [];

              const legObj = {
                dep: depIcao,
                arr: arrIcao,
                routeName: routeName,
                destAlternates: alternates,
                rawAlternatesStr: altStr || ''
              };

              legs.push(legObj);
              rawTableRows.push({
                type: 'leg',
                leg: legObj,
                rawTexts: cellTexts
              });
              rIdx++;
            } else if (cellTexts.length >= 2) {
              // Metadata Row (Label | Value)
              const rawLabel = cellTexts[0].replace(/\s+/g, ' ').trim();
              const rawValue = cellTexts[1];

              metadata[rawLabel] = rawValue;
              rawTableRows.push({
                type: 'meta',
                label: rawLabel,
                value: rawValue,
                rawTexts: cellTexts
              });
              rIdx++;
            } else {
              rIdx++;
            }
          }

          // EDGE CASE #2: Only save if route has a city pair and at least one leg
          if (cityPair && legs.length > 0) {
            const routeId = `R${String(routes.length + 1).padStart(3, '0')}`;
            
            // Extract enroute alternates into clean ICAO list
            const enrAltRaw = metadata['Preferred Enroute Alternate Airport'] ||
                              metadata['Preferred Enroute alternate Airport'] ||
                              metadata['Preferred Enroute Alternate Airports'] || '';
            const enrouteAlternates = enrAltRaw
              ? enrAltRaw.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(s => isValidIcao(s))
              : [];

            // Extract depressurization procedure (e.g. Europe routes)
            const depressVal = (metadata['Depressurization Procedure'] ||
                               metadata['Depressurization procedure'] ||
                               metadata['Depressurisation Procedure'] ||
                               metadata['Depressurisation procedure'] ||
                               metadata['Depressurization Procedures'] ||
                               metadata['Depressurisation Procedures'] ||
                               metadata['Depressurization'] ||
                               metadata['Depressurisation'] ||
                               getMetaCaseInsensitive(metadata, 'depressur') ||
                               getMetaCaseInsensitive(metadata, 'escape route') ||
                               '').trim();

            if (depressVal) {
              metadata['Depressurization Procedure'] = depressVal;
            }

            const route = {
              id: routeId,
              seq: globalRouteSeq,
              number: routeNo,
              cityPair: cityPair,
              region: currentRegion.name,
              regionCode: currentRegion.code,
              regionId: currentRegion.id,
              legs: legs,
              areaOperation: metadata['Area Operation'] || '',
              enrouteAlternates: enrouteAlternates,
              enrouteAlternatesRaw: enrAltRaw,
              rvsm: metadata['RVSM'] || 'Required',
              edto: metadata['EDTO'] || '',
              pbn: metadata['PBN'] || '',
              datalink: metadata['Datalink'] || '',
              flightLevel: metadata['Flight level'] || '',
              depressurization: depressVal,
              restriction: metadata['Restriction'] || '',
              metadata: metadata,
              rawMeta: metadata,
              rawTableRows: rawTableRows
            };

            routes.push(route);
            currentRegion.routeCount++;
            globalRouteSeq++;
          }
        } else {
          rIdx++;
        }
      }
    }
  }

  // Build Cross-Reference Airport -> Routes index
  const airportRouteIndex = buildAirportRouteIndex(routes);

  return {
    routes,
    regions: regions.filter(r => r.routeCount > 0),
    airportRouteIndex,
    routesCount: routes.length
  };
}

/**
 * Detects whether a table row is a route header row.
 * Handles all 7 geographic region shading colors and filters out template blanks and banner rows.
 */
function isRouteHeaderRow(props, text, cellCount) {
  if (!text) return false;
  const clean = text.replace(/-/g, '').trim();
  if (!clean) return false;
  const lower = text.toLowerCase();
  if (lower === 'no' || lower.includes('city pairs') || lower.includes('standard routes') || lower.includes('destination area operation')) {
    return false;
  }
  return (props.colspan >= 4 || cellCount === 1) && (text.includes('-') || props.bgColor != null);
}

/**
 * Validates whether a token is a plausible 4-letter ICAO code.
 */
function isValidIcao(token) {
  if (!token) return false;
  const clean = token.trim();
  return /^[A-Z]{4}$/i.test(clean);
}

/**
 * Builds an index of airports referencing routes where the airport is DEP, ARR, DEST ALT, or ENR ALT.
 */
function buildAirportRouteIndex(routes) {
  const index = {};

  for (const r of routes) {
    // Legs
    for (const leg of r.legs) {
      if (leg.dep) addEntry(index, leg.dep, r.id, 'dep');
      if (leg.arr) addEntry(index, leg.arr, r.id, 'arr');
      for (const alt of leg.destAlternates) {
        addEntry(index, alt, r.id, 'dest-alt');
      }
    }
    // Enroute alternates
    for (const enr of r.enrouteAlternates) {
      addEntry(index, enr, r.id, 'enr-alt');
    }
  }

  return index;
}

function addEntry(index, icao, routeId, role) {
  const code = icao.toUpperCase();
  if (!index[code]) {
    index[code] = {
      dep: new Set(),
      arr: new Set(),
      destAlt: new Set(),
      enrAlt: new Set(),
      allRoutes: new Set()
    };
  }

  if (role === 'dep') index[code].dep.add(routeId);
  else if (role === 'arr') index[code].arr.add(routeId);
  else if (role === 'dest-alt') index[code].destAlt.add(routeId);
  else if (role === 'enr-alt') index[code].enrAlt.add(routeId);
  index[code].allRoutes.add(routeId);
}

function getMetaCaseInsensitive(meta, query) {
  if (!meta) return '';
  const q = query.toLowerCase();
  for (const k of Object.keys(meta)) {
    if (k.toLowerCase().includes(q)) {
      return meta[k];
    }
  }
  return '';
}
