/**
 * VNA Route Manual v3.0 - Airport Code Linker
 * Automatically identifies ICAO (4-letter) and IATA (3-letter) airport tokens
 * in table cells, titles, and text, converting them into interactive button links.
 */

// Common words and abbreviations to exclude from 3/4-letter airport code matching
const EXCLUDED_TOKENS = new Set([
  'FL300', 'FL310', 'FL340', 'FL390', 'FL400', 'FL410', 'FL280', 'FL290', 'FL240', 'FL250',
  'RVSM', 'EDTO', 'CPDLC', 'ADSC', 'PBCS', 'ADSB', 'RNAV', 'RNP4', 'RNP10', 'RNAV2', 'RNAV5',
  'GND', 'MAX', 'MIN', 'NIL', 'YES', 'NO', 'AUTO', 'TRUE', 'FEET', 'ELEV', 'RWY', 'TORA',
  'TODA', 'ASDA', 'INFO', 'DOCS', 'PAGE', 'ITEM', 'PART', 'AREA', 'FROM', 'WITH', 'OVER',
  'WEST', 'EAST', 'ONLY', 'ALSO', 'HURR', 'TYPH', 'FIR', 'OCA', 'NOTE', 'NOTE1', 'NOTE2',
  'LIDO', 'EFB1', 'EFB2', 'EFB3', 'VNA', 'VAR', 'SOP', 'ICAO', 'IATA', 'CAT', 'RFFS', 'EOSID',
  'PACOTS', 'BOUND', 'M890', 'A593', 'G86', 'W27', 'W28', 'AND', 'THE', 'FOR', 'CITY',
  'MUST', 'LAND', 'TAXI', 'ZONE', 'TIME', 'EACH', 'WILL', 'HAVE', 'DROP', 'STOP', 'PARK',
  'RATE', 'PLAN', 'PATH', 'WARN', 'DATE', 'NAME', 'CODE', 'TYPE', 'SECT', 'STEP', 'UNIT',
  'CREW', 'FLGT', 'NORM', 'PEAK', 'REST', 'TEST', 'USER', 'VIEW', 'SHOW', 'OPEN', 'SAVE',
  'COPY', 'HELP', 'EXIT', 'NULL', 'WIND', 'COLD', 'TEMP', 'FOOT', 'BOTH', 'SOME', 'MORE',
  'LESS', 'INTO', 'WHEN', 'THEN', 'SUCH', 'THAN', 'THAT', 'THIS', 'THEY', 'THEM', 'DOWN',
  'BACK', 'LAST', 'LONG', 'VERY', 'WELL', 'WHAT', 'MAKE', 'GOOD'
]);

// Common IATA to ICAO mappings for top VNA network stations
const KNOWN_IATA_TO_ICAO = {
  'SGN': 'VVTS', 'HAN': 'VVNB', 'DAD': 'VVDN', 'CXR': 'VVCR', 'PQC': 'VVPQ', 'VCA': 'VVCA',
  'HPH': 'VVCI', 'VII': 'VVVH', 'UIH': 'VVPC', 'THD': 'VVTX', 'DIN': 'VVDB', 'BMV': 'VVBM',
  'PXU': 'VVPK', 'TBB': 'VVTH', 'VCL': 'VVCA', 'DLI': 'VVDL', 'VKG': 'VVKG', 'CAH': 'VVCM',
  'SFO': 'KSFO', 'LAX': 'KLAX', 'OAK': 'KOAK', 'SJC': 'KSJC', 'SEA': 'KSEA', 'YVR': 'CYVR',
  'CDG': 'LFPG', 'LHR': 'EGLL', 'FRA': 'EDDF', 'AMS': 'EHAM', 'MUC': 'EDDM', 'MXP': 'LIMC',
  'SVO': 'UUEE', 'LED': 'ULLI', 'KZN': 'UWKD', 'CPH': 'EKCH',
  'SYD': 'YSSY', 'MEL': 'YMML', 'PER': 'YPPH', 'BNE': 'YBBN',
  'NRT': 'RJAA', 'HND': 'RJTT', 'KIX': 'RJBB', 'FUK': 'RJFF', 'NGO': 'RJGG', 'OKA': 'ROAH',
  'ICN': 'RKSI', 'GMP': 'RKSS', 'PUS': 'RKPK', 'CJU': 'RKPC', 'MWX': 'RKJB',
  'TPE': 'RCTP', 'KHH': 'RCKH', 'HKG': 'VHHH', 'MFM': 'VMMC', 'PEK': 'ZBAA', 'PKX': 'ZBAD',
  'PVG': 'ZSPD', 'SHA': 'ZSSS', 'CAN': 'ZGGG', 'CTU': 'ZUUU', 'KMG': 'ZPPP', 'XIY': 'ZLXY',
  'SIN': 'WSSS', 'BKK': 'VTBS', 'DMK': 'VTBD', 'KUL': 'WMKK', 'MNL': 'RPLL', 'CGK': 'WIII',
  'DPS': 'WADD', 'PNH': 'VDPP', 'REP': 'VDSR', 'SAI': 'VDSA', 'VTE': 'VLVT', 'LPQ': 'VLLB',
  'RGN': 'VYYY', 'DEL': 'VIDP', 'BOM': 'VABB', 'AMD': 'VAAH', 'BLR': 'VOBL', 'HYD': 'VOHS'
};

/**
 * Creates an interactive HTML button element for an airport code.
 *
 * @param {string} icao - 4-letter ICAO code
 * @param {string} [displayText] - Display label (defaults to icao)
 * @param {string} [role='general'] - 'dep' | 'arr' | 'dest-alt' | 'enr-alt' | 'general'
 * @returns {string} HTML string
 */
export function createAirportLinkHtml(icao, displayText = null, role = 'general') {
  if (!icao) return '';
  const cleanIcao = icao.trim().toUpperCase();
  const label = displayText || cleanIcao;
  const roleClass = `chip-${role}`;

  return `<button type="button" class="airport-chip-link ${roleClass}" data-icao="${cleanIcao}" data-role="${role}" title="Xem chi tiết Chương 4: ${cleanIcao} (${role.toUpperCase()})">${escapeHtml(label)}</button>`;
}

/**
 * Scans a City Pair route title (e.g. "SGN - SFO - SGN" or "HAN - CDG - HAN")
 * and converts known 3-letter IATA or 4-letter ICAO codes into interactive links.
 *
 * @param {string} title - e.g. "1. SGN - SFO - SGN"
 * @param {Map<string, Object>} [airportMap] - Optional map of available airports
 * @returns {string} HTML with interactive buttons
 */
export function linkifyCityPairHeader(title, airportMap = null) {
  if (!title) return '';

  return title.replace(/\b([A-Z]{3,4})\b/g, (match, code) => {
    const upper = code.toUpperCase();
    if (EXCLUDED_TOKENS.has(upper)) return match;

    let targetIcao = upper;
    if (upper.length === 3) {
      targetIcao = KNOWN_IATA_TO_ICAO[upper] || (airportMap && findIcaoByIata(airportMap, upper)) || null;
    }

    if (targetIcao) {
      return createAirportLinkHtml(targetIcao, upper, 'general');
    }
    return match;
  });
}

/**
 * Scans an arbitrary string (e.g. Destination Alternates "KOAK, KSJC, KLAX" or Enroute Alternates)
 * and turns all 4-letter ICAO codes into interactive links.
 *
 * @param {string} text
 * @param {string} [defaultRole='dest-alt']
 * @param {Map<string, Object>} [airportMap]
 * @returns {string}
 */
export function linkifyAirportList(text, defaultRole = 'dest-alt', airportMap = null) {
  if (!text) return '';
  const cleanText = text.replace(/\s+,/g, ',');

  return cleanText.replace(/\b([A-Z]{4})\b(\s*,\s*)?/g, (match, icao, comma) => {
    const upper = icao.toUpperCase();
    if (EXCLUDED_TOKENS.has(upper)) return match;

    // For general free-form text, only linkify if confirmed in airportMap to avoid false positives
    if (defaultRole === 'general' && airportMap && airportMap.size > 0 && !airportMap.has(upper)) {
      return match;
    }

    const linkHtml = createAirportLinkHtml(upper, upper, defaultRole);
    if (comma) {
      return `<span class="alt-chip-item">${linkHtml}<span class="alt-sep">, </span></span>`;
    }
    return `<span class="alt-chip-item">${linkHtml}</span>`;
  });
}

/**
 * Helper to find ICAO code by IATA in airportMap.
 */
function findIcaoByIata(airportMap, iata) {
  if (!airportMap) return null;
  const upper = iata.toUpperCase();
  for (const [icao, apt] of airportMap.entries()) {
    if (apt.iata && apt.iata.toUpperCase() === upper) {
      return icao;
    }
  }
  return null;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
