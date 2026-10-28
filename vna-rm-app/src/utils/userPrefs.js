/**
 * VNA Route Manual v4.0 - User Preferences & Local Persistence
 * Manages Recents (last 20 items), Favorites, active filters, and last selection.
 */

const STORAGE_KEYS = {
  RECENTS: 'vnaRm.recents',
  FAVORITES: 'vnaRm.favorites',
  FILTERS: 'vnaRm.filters',
  LAST_SELECTION: 'vnaRm.last'
};

const MAX_RECENTS = 20;

function safeGet(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[UserPrefs] Failed reading ${key}:`, e);
    return defaultVal;
  }
}

function safeSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.warn(`[UserPrefs] Failed writing ${key}:`, e);
  }
}

export class UserPrefs {
  /**
   * Adds an entity to recents (deduplicated, newest first, max 20).
   * @param {'route' | 'airport'} type
   * @param {string} id
   * @param {string} label
   * @param {string} [subtitle]
   */
  static addRecent(type, id, label, subtitle = '') {
    if (!type || !id) return;
    const cleanId = String(id).trim();
    const data = safeGet(STORAGE_KEYS.RECENTS, { v: 1, items: [] });
    let items = (data.items || []).filter(item => !(item.type === type && item.id === cleanId));
    items.unshift({
      type,
      id: cleanId,
      label: label || cleanId,
      subtitle: subtitle || '',
      ts: Date.now()
    });
    if (items.length > MAX_RECENTS) {
      items = items.slice(0, MAX_RECENTS);
    }
    safeSet(STORAGE_KEYS.RECENTS, { v: 1, items });
    this.saveLastSelection(type, cleanId);
  }

  static getRecents() {
    const data = safeGet(STORAGE_KEYS.RECENTS, { v: 1, items: [] });
    return data.items || [];
  }

  static clearRecents() {
    safeSet(STORAGE_KEYS.RECENTS, { v: 1, items: [] });
  }

  /**
   * Checks whether an entity is favorited.
   */
  static isFavorite(type, id) {
    if (!type || !id) return false;
    const cleanId = String(id).trim();
    const data = safeGet(STORAGE_KEYS.FAVORITES, { v: 1, items: [] });
    return (data.items || []).some(item => item.type === type && item.id === cleanId);
  }

  /**
   * Toggles favorite status. Returns true if now favorited, false if removed.
   */
  static toggleFavorite(type, id, label, subtitle = '') {
    if (!type || !id) return false;
    const cleanId = String(id).trim();
    const data = safeGet(STORAGE_KEYS.FAVORITES, { v: 1, items: [] });
    let items = data.items || [];
    const idx = items.findIndex(item => item.type === type && item.id === cleanId);
    let isNowFav = false;

    if (idx >= 0) {
      items.splice(idx, 1);
      isNowFav = false;
    } else {
      items.unshift({
        type,
        id: cleanId,
        label: label || cleanId,
        subtitle: subtitle || '',
        ts: Date.now()
      });
      isNowFav = true;
    }

    safeSet(STORAGE_KEYS.FAVORITES, { v: 1, items });
    return isNowFav;
  }

  static getFavorites() {
    const data = safeGet(STORAGE_KEYS.FAVORITES, { v: 1, items: [] });
    return data.items || [];
  }

  static saveLastSelection(type, id) {
    if (!type || !id) return;
    safeSet(STORAGE_KEYS.LAST_SELECTION, { type, id: String(id).trim(), ts: Date.now() });
  }

  static getLastSelection() {
    return safeGet(STORAGE_KEYS.LAST_SELECTION, null);
  }

  static saveActiveFilters(tab, filters) {
    const allFilters = safeGet(STORAGE_KEYS.FILTERS, {});
    allFilters[tab] = filters;
    safeSet(STORAGE_KEYS.FILTERS, allFilters);
  }

  static getActiveFilters(tab, defaultFilters = []) {
    const allFilters = safeGet(STORAGE_KEYS.FILTERS, {});
    return allFilters[tab] || defaultFilters;
  }
}

if (typeof window !== 'undefined') {
  window.UserPrefs = UserPrefs;
}
