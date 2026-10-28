/**
 * VNA Route Manual v3.0 - OOXML Parser Utilities
 * Handles safe text extraction, tracked deletions (<w:del>) skipping,
 * FORMCHECKBOX conversion to ☑/☐, and table cell attribute parsing.
 */

/**
 * Recursively extracts visible, non-deleted text from an OOXML DOM node.
 * Skips <w:del>, <w:delText>, and <w:instrText>.
 * Converts <w:checkBox> into ☑ or ☐.
 *
 * @param {Node} node
 * @returns {string}
 */
export function extractSafeText(node) {
  if (!node) return '';

  const localName = node.localName || node.nodeName.replace(/^w:/, '');

  // Skip tracked deletions, instructions, drawings, and properties
  if (localName === 'del' || localName === 'delText' || localName === 'instrText' ||
      localName === 'drawing' || localName === 'pict' || localName === 'shape' ||
      localName === 'rPr' || localName === 'pPr' || localName === 'tcPr') {
    return '';
  }

  // Handle Word Form Checkbox (<w:ffData><w:checkBox>...)
  if (localName === 'checkBox') {
    return parseWordCheckbox(node);
  }

  // Handle standard Word text elements
  if (localName === 't') {
    return node.textContent || '';
  }
  if (localName === 'tab') {
    return '\t';
  }
  if (localName === 'br' || localName === 'cr') {
    return '\n';
  }

  // Recursively process child nodes
  let text = '';
  const children = node.childNodes;
  if (children && children.length > 0) {
    for (let i = 0; i < children.length; i++) {
      text += extractSafeText(children[i]);
    }
  }
  return text;
}

/**
 * Inspects a <w:checkBox> element to determine whether it is checked (☑) or unchecked (☐).
 * Checks both <w:checked> and <w:default> elements.
 *
 * @param {Element} checkBoxNode
 * @returns {string} '☑ ' or '☐ '
 */
function parseWordCheckbox(checkBoxNode) {
  let isChecked = false;

  // Search child nodes for <w:checked> or <w:default>
  const checkedEl = getChildByLocalName(checkBoxNode, 'checked');
  if (checkedEl) {
    const val = getAttrVal(checkedEl, 'val');
    // In Word OOXML, <w:checked/> without val attribute or val != "0" means checked
    if (val === null || val === '1' || val === 'true' || val === '') {
      isChecked = true;
    }
  } else {
    // If not explicitly set via checked, check default value
    const defaultEl = getChildByLocalName(checkBoxNode, 'default');
    if (defaultEl) {
      const val = getAttrVal(defaultEl, 'val');
      if (val === '1' || val === 'true') {
        isChecked = true;
      }
    }
  }

  return isChecked ? '☑ ' : '☐ ';
}

/**
 * Helper to get child element by localName ignoring XML namespace prefix.
 */
export function getChildByLocalName(parent, targetLocalName) {
  if (!parent || !parent.children) return null;
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const local = child.localName || child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
    if (local === targetLocalName) return child;
  }
  return null;
}

/**
 * Helper to find all descendants by localName ignoring namespace prefix.
 */
export function getElementsByLocalName(parent, targetLocalName) {
  if (!parent) return [];
  const results = [];
  const walk = (node) => {
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const local = child.localName || child.nodeName.replace(/^[a-zA-Z0-9]+:/, '');
        if (local === targetLocalName) results.push(child);
        walk(child);
      }
    }
  };
  walk(parent);
  return results;
}

/**
 * Gets attribute value ignoring namespace prefix (e.g. w:val -> val).
 */
export function getAttrVal(el, attrName) {
  if (!el || !el.attributes) return null;
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    const local = attr.localName || attr.name.replace(/^[a-zA-Z0-9]+:/, '');
    if (local === attrName) return attr.value;
  }
  return null;
}

/**
 * Extracts and cleans text from a paragraph node (<w:p>).
 * Standardizes typography dashes (–, —, −) to standard hyphen (-).
 *
 * @param {Element} pNode
 * @returns {string}
 */
export function extractParagraphText(pNode) {
  const raw = extractSafeText(pNode);
  return raw
    .replace(/[\u2010-\u2015\u2212\uFF0D\uFFFD]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extracts text from a table cell node (<w:tc>).
 * Preserves multi-paragraph line breaks.
 *
 * @param {Element} tcNode
 * @returns {string}
 */
export function extractCellText(tcNode) {
  if (!tcNode) return '';
  const paragraphs = getElementsByLocalName(tcNode, 'p');
  if (paragraphs.length === 0) {
    return extractSafeText(tcNode).trim();
  }
  const lines = paragraphs
    .map(p => extractParagraphText(p))
    .filter(line => line.length > 0);
  return lines.join('\n');
}

/**
 * Extracts table cell properties from <w:tcPr>:
 * - colspan (w:gridSpan)
 * - vMerge (w:vMerge: 'restart' | 'continue' | null)
 * - bgColor (w:shd/@w:fill: hex color e.g. '#FFE599')
 * - align (w:jc/@w:val: 'center' | 'right' | 'left')
 * - images (embedded drawings with rId)
 *
 * @param {Element} tcNode
 * @returns {Object}
 */
export function getCellProperties(tcNode) {
  let colspan = 1;
  let vMerge = null;
  let bgColor = null;
  let align = 'left';
  const images = [];

  const tcPr = getChildByLocalName(tcNode, 'tcPr');
  if (tcPr) {
    // Colspan from <w:gridSpan w:val="N"/>
    const gridSpanEl = getChildByLocalName(tcPr, 'gridSpan');
    if (gridSpanEl) {
      const gs = parseInt(getAttrVal(gridSpanEl, 'val') || '1', 10);
      if (!isNaN(gs) && gs > 1) colspan = gs;
    }

    // Rowspan from <w:vMerge w:val="restart|continue"/>
    const vMergeEl = getChildByLocalName(tcPr, 'vMerge');
    if (vMergeEl) {
      const val = getAttrVal(vMergeEl, 'val');
      vMerge = (val === 'restart') ? 'restart' : 'continue';
    }

    // Shading fill color from <w:shd w:fill="HEX"/>
    const shdEl = getChildByLocalName(tcPr, 'shd');
    if (shdEl) {
      const fill = getAttrVal(shdEl, 'fill');
      if (fill && fill.toLowerCase() !== 'auto' && fill.toLowerCase() !== 'none') {
        bgColor = '#' + fill.toUpperCase();
      }
    }
  }

  // Text alignment from first paragraph <w:jc w:val="center"/>
  const firstP = getChildByLocalName(tcNode, 'p');
  if (firstP) {
    const pPr = getChildByLocalName(firstP, 'pPr');
    if (pPr) {
      const jcEl = getChildByLocalName(pPr, 'jc');
      if (jcEl) {
        align = getAttrVal(jcEl, 'val') || 'left';
      }
    }
  }

  // Detect embedded images in drawing / blip / imagedata
  const blipElements = getElementsByLocalName(tcNode, 'blip');
  for (const blip of blipElements) {
    const rId = getAttrVal(blip, 'embed') || getAttrVal(blip, 'link');
    if (rId) {
      images.push({ rId });
    }
  }

  const vImageDataElements = getElementsByLocalName(tcNode, 'imagedata');
  for (const imgData of vImageDataElements) {
    const rId = getAttrVal(imgData, 'id') || getAttrVal(imgData, 'href');
    if (rId && !images.some(img => img.rId === rId)) {
      images.push({ rId });
    }
  }

  return { colspan, vMerge, bgColor, align, images };
}

/**
 * Parses relationship XML (word/_rels/document.xml.rels) into a lookup map.
 * Lookup: rId -> "word/" + target
 *
 * @param {string} relsXmlStr
 * @returns {Record<string, string>}
 */
export function parseRelationships(relsXmlStr) {
  const relMap = {};
  if (!relsXmlStr) return relMap;

  const parser = new DOMParser();
  const xml = parser.parseFromString(relsXmlStr, 'text/xml');
  const relEls = xml.getElementsByTagName('Relationship');

  for (let i = 0; i < relEls.length; i++) {
    const el = relEls[i];
    const id = el.getAttribute('Id');
    const target = el.getAttribute('Target');
    if (id && target) {
      let fullPath = target;
      if (!fullPath.startsWith('word/') && !fullPath.startsWith('/')) {
        fullPath = 'word/' + target.replace(/^\.\//, '');
      } else if (fullPath.startsWith('/')) {
        fullPath = fullPath.substring(1);
      }
      relMap[id] = fullPath;
    }
  }
  return relMap;
}
