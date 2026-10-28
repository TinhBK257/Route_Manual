/**
 * VNA Route Manual v4.0 - Hash Router & History Navigation
 * Supports deep linking (#/airport/VVTS, #/route/R001, #/airport/VVDB/sec-7),
 * browser Back/Forward with scroll restoration, and in-app navigation buttons.
 */

export class HashRouter {
  /**
   * @param {Object} options
   * @param {(route: {type: string, id: string, section: string, state: Object}) => void} options.onRouteChange
   */
  constructor(options = {}) {
    this.onRouteChange = options.onRouteChange || (() => {});
    this.isNavigatingInternal = false;

    window.addEventListener('popstate', (e) => {
      this.handlePopState(e);
    });

    window.addEventListener('hashchange', (e) => {
      if (!this.isNavigatingInternal) {
        this.handleHashChange();
      }
    });
  }

  /**
   * Parses current window hash into structured object.
   * Format: #/route/R001, #/airport/VVTS, #/airport/VVTS/sec-7, #/ops/policy
   */
  parseHash(hash = window.location.hash) {
    if (!hash || hash === '#/' || hash === '#') {
      return null;
    }

    const clean = hash.replace(/^#\/?/, '');
    const parts = clean.split('/').map(p => decodeURIComponent(p).trim());
    if (parts.length === 0 || !parts[0]) return null;

    const rawType = parts[0].toLowerCase();
    let type = rawType;
    if (rawType === 'route' || rawType === 'routes') type = 'route';
    else if (rawType === 'airport' || rawType === 'airports') type = 'airport';
    else if (rawType === 'ops' || rawType === 'doc') type = 'ops';
    else if (rawType === 'region') type = 'region';

    const id = parts[1] || '';
    const section = parts[2] || '';

    return { type, id, section, raw: hash };
  }

  /**
   * Navigates to a new hash location using history.pushState or replaceState.
   */
  navigate(type, id, section = '', options = {}) {
    let hash = '';
    if (type === 'ops') {
      hash = `#/ops/${encodeURIComponent(id || 'policy')}`;
    } else if (type === 'route') {
      hash = `#/route/${encodeURIComponent(id)}`;
    } else if (type === 'airport') {
      hash = section ? `#/airport/${encodeURIComponent(id)}/${encodeURIComponent(section)}` : `#/airport/${encodeURIComponent(id)}`;
    } else if (type === 'region') {
      hash = `#/region/${encodeURIComponent(id)}`;
    }

    if (!hash) return;

    this.isNavigatingInternal = true;
    const currentState = window.history.state || {};
    const newState = {
      ...options.state,
      type,
      id,
      section,
      scrollTop: options.scrollTop || 0,
      timestamp: Date.now()
    };

    if (options.replace || window.location.hash === hash) {
      window.history.replaceState(newState, '', hash);
    } else {
      window.history.pushState(newState, '', hash);
    }

    setTimeout(() => {
      this.isNavigatingInternal = false;
    }, 50);
  }

  /**
   * Saves current scroll position into the active history state.
   */
  saveCurrentScroll(scrollTop) {
    const currentState = window.history.state || {};
    window.history.replaceState({ ...currentState, scrollTop }, '', window.location.hash);
  }

  handlePopState(e) {
    const parsed = this.parseHash();
    const state = e.state || {};
    this.onRouteChange({
      ...(parsed || { type: state.type || null, id: state.id || null, section: state.section || '' }),
      state,
      fromHistory: true
    });
  }

  handleHashChange() {
    const parsed = this.parseHash();
    if (parsed) {
      this.onRouteChange({
        ...parsed,
        state: window.history.state || {},
        fromHistory: false
      });
    }
  }
}
