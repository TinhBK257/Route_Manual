/**
 * VNA Route Manual v3.0 - IndexedDB Storage Layer
 * Manages client-side persistence for parsed Chapter 3 & 4 data,
 * raw docx ArrayBuffers, and lazy on-demand image Blob extraction.
 */

const DB_NAME = 'VNA_RouteManual_DB_v3';
const DB_VERSION = 1;

const STORES = {
  DATASETS: 'parsed_datasets',
  RAW_FILES: 'raw_docx_files',
  MEDIA_BLOBS: 'media_blobs'
};

// In-memory runtime cache for extracted Blob URLs
const memoryBlobUrlCache = new Map();

/**
 * Opens and initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.DATASETS)) {
        db.createObjectStore(STORES.DATASETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.RAW_FILES)) {
        db.createObjectStore(STORES.RAW_FILES, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORES.MEDIA_BLOBS)) {
        db.createObjectStore(STORES.MEDIA_BLOBS, { keyPath: 'path' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves parsed Chapter 3 & Chapter 4 data to IndexedDB.
 *
 * @param {Object} ch3Data
 * @param {Object} ch4Data
 * @returns {Promise<void>}
 */
export async function saveParsedDataset(ch3Data, ch4Data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DATASETS], 'readwrite');
    const store = tx.objectStore(STORES.DATASETS);

    const record = {
      id: 'active_dataset',
      version: '3.0',
      updatedAt: new Date().toISOString(),
      ch3: ch3Data,
      ch4: ch4Data
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves the stored parsed dataset from IndexedDB.
 *
 * @returns {Promise<Object|null>}
 */
export async function getParsedDataset() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.DATASETS], 'readonly');
      const store = tx.objectStore(STORES.DATASETS);
      const req = store.get('active_dataset');

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to read cached dataset:', err);
    return null;
  }
}

/**
 * Stores a raw docx ArrayBuffer to IndexedDB.
 *
 * @param {string} name - e.g. 'CHAPTER 4_REV04.docx'
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<void>}
 */
export async function saveRawDocxFile(name, arrayBuffer) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.RAW_FILES], 'readwrite');
    const store = tx.objectStore(STORES.RAW_FILES);

    const record = {
      name: name,
      buffer: arrayBuffer,
      size: arrayBuffer.byteLength,
      updatedAt: new Date().toISOString()
    };

    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves a stored raw docx ArrayBuffer.
 *
 * @param {string} name
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getRawDocxFile(name) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.RAW_FILES], 'readonly');
      const store = tx.objectStore(STORES.RAW_FILES);
      const req = store.get(name);

      req.onsuccess = () => {
        if (req.result && req.result.buffer) {
          resolve(req.result.buffer);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not retrieve raw file:', err);
    return null;
  }
}

/**
 * Lazy On-Demand Image Blob Extraction:
 * Extracts a specific image from the Chapter 4 docx ZIP archive on-demand,
 * caches it as a Blob URL, and returns the URL for display.
 *
 * @param {string} mediaPath - e.g. "word/media/image12.png"
 * @param {JSZip} [activeZipInstance] - Optional already-loaded JSZip instance
 * @returns {Promise<string>} Blob URL (e.g. blob:http://localhost/...)
 */
export async function getMediaBlobUrl(mediaPath, activeZipInstance = null) {
  if (!mediaPath) return '';

  // 1. Check in-memory cache first (fastest)
  if (memoryBlobUrlCache.has(mediaPath)) {
    return memoryBlobUrlCache.get(mediaPath);
  }

  // 2. Check IndexedDB media store
  try {
    const db = await openDatabase();
    const cachedRecord = await new Promise((resolve) => {
      const tx = db.transaction([STORES.MEDIA_BLOBS], 'readonly');
      const store = tx.objectStore(STORES.MEDIA_BLOBS);
      const req = store.get(mediaPath);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (cachedRecord && cachedRecord.blob) {
      const blobUrl = URL.createObjectURL(cachedRecord.blob);
      memoryBlobUrlCache.set(mediaPath, blobUrl);
      return blobUrl;
    }
  } catch (e) {
    console.warn('[IndexedDB] Error checking media cache:', e);
  }

  // 3. Extract from JSZip instance on demand
  let zip = activeZipInstance;
  if (!zip) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('JSZip library is required for unpacking images from .docx archive.');
    }
    const rawBuffer = await getRawDocxFile('CHAPTER 4_REV04.docx');
    if (!rawBuffer) {
      throw new Error(`Raw document CHAPTER 4_REV04.docx is not cached in IndexedDB. Please re-upload.`);
    }
    zip = await window.JSZip.loadAsync(rawBuffer);
  }

  const zipEntry = zip.file(mediaPath);
  if (!zipEntry) {
    console.warn(`[IndexedDB] Media entry ${mediaPath} not found in zip archive.`);
    return '';
  }

  // Determine MIME type from extension
  const ext = mediaPath.split('.').pop().toLowerCase();
  const mimeMap = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    emf: 'image/x-emf',
    wmf: 'image/x-wmf'
  };
  const mimeType = mimeMap[ext] || 'application/octet-stream';

  const blob = await zipEntry.async('blob');
  const typedBlob = new Blob([blob], { type: mimeType });
  const blobUrl = URL.createObjectURL(typedBlob);

  memoryBlobUrlCache.set(mediaPath, blobUrl);

  // Store Blob in IndexedDB in the background
  try {
    const db = await openDatabase();
    const tx = db.transaction([STORES.MEDIA_BLOBS], 'readwrite');
    const store = tx.objectStore(STORES.MEDIA_BLOBS);
    store.put({
      path: mediaPath,
      blob: typedBlob,
      mimeType: mimeType,
      size: typedBlob.size
    });
  } catch (err) {
    console.warn('[IndexedDB] Background media cache store error:', err);
  }

  return blobUrl;
}

/**
 * Clears all cached datasets and images from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearIndexedDbCache() {
  memoryBlobUrlCache.clear();
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.DATASETS, STORES.RAW_FILES, STORES.MEDIA_BLOBS], 'readwrite');
    tx.objectStore(STORES.DATASETS).clear();
    tx.objectStore(STORES.RAW_FILES).clear();
    tx.objectStore(STORES.MEDIA_BLOBS).clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
