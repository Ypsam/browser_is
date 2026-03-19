import { app, BrowserView, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import Store from 'electron-store';
import fetch from 'cross-fetch';
import { ElectronBlocker } from '@cliqz/adblocker-electron';

const isDev = !app.isPackaged;

const DEFAULT_HOME = 'https://example.com';

const store = new Store({
  name: 'browser_is',
  defaults: {
    lastUrl: DEFAULT_HOME,
    tabs: [{ id: '1', url: DEFAULT_HOME, title: 'New Tab' }],
    activeTabId: '1',
    scripts: [],
    permissions: {}, // host -> { alwaysAllow: boolean }
    adblock: {
      enabled: true
    },
    cosmetic: {
      enabled: true,
      css: ''
    },
    autoSkipAds: {
      enabled: true
    },
    proxy: {
      enabled: false,
      url: '' // e.g. socks5://127.0.0.1:1080 or http://proxy:8080
    },
    privacy: {
      blockPopups: true,
      blockNotifications: true,
      doNotTrack: true,
      stripReferer: true,
      blockThirdPartyCookies: true
    }
  }
});

// Some Windows devices/drivers crash the GPU process in Electron.
// Disabling hardware acceleration avoids a class of startup/render issues.
app.disableHardwareAcceleration();

function simpleId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function matchPattern(url, pattern) {
  // very small subset:
  // - "*://*/*" like patterns
  // - supports "*" wildcards
  // This is intentionally simple for MVP.
  if (!pattern || pattern === '*') return true;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const re = new RegExp(`^${escaped}$`, 'i');
  return re.test(url);
}

function getHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function getTabs() {
  const t = store.get('tabs');
  return Array.isArray(t) && t.length > 0 ? t : [{ id: '1', url: DEFAULT_HOME, title: 'New Tab' }];
}

function setTabs(next) {
  store.set('tabs', next);
}

function getActiveTabId() {
  return store.get('activeTabId') || (getTabs()[0]?.id ?? '1');
}

function setActiveTabId(id) {
  store.set('activeTabId', id);
}

function getScripts() {
  return store.get('scripts') || [];
}

function setScripts(next) {
  store.set('scripts', next);
}

function getPermissions() {
  return store.get('permissions') || {};
}

function setPermissions(next) {
  store.set('permissions', next);
}

function getAdblock() {
  return store.get('adblock') || { enabled: true };
}

function setAdblock(next) {
  store.set('adblock', next);
}

function getCosmetic() {
  return store.get('cosmetic') || { enabled: true, css: '' };
}

function setCosmetic(next) {
  store.set('cosmetic', next);
}

function getAutoSkipAds() {
  return store.get('autoSkipAds') || { enabled: true };
}

function setAutoSkipAds(next) {
  store.set('autoSkipAds', next);
}

function getPrivacy() {
  return (
    store.get('privacy') || {
      blockPopups: true,
      blockNotifications: true,
      doNotTrack: true,
      stripReferer: true,
      blockThirdPartyCookies: true
    }
  );
}

function setPrivacy(next) {
  store.set('privacy', next);
}

function getProxy() {
  return store.get('proxy') || { enabled: false, url: '' };
}

function setProxy(next) {
  store.set('proxy', next);
}

function applyProxy(session) {
  const cfg = getProxy();
  if (!session) return;
  try {
    if (cfg.enabled && cfg.url && String(cfg.url).trim()) {
      const rules = String(cfg.url).trim();
      session.setProxy({ proxyRules: rules, proxyBypassRules: 'localhost,127.0.0.1' });
    } else {
      session.setProxy({ proxyRules: '' });
    }
  } catch {
    // ignore
  }
}

function pickMatchedScripts(url, runAt) {
  const scripts = getScripts().filter((s) => s.enabled);
  return scripts.filter((s) => s.runAt === runAt && matchPattern(url, s.match));
}

function isDangerousScheme(url) {
  return /^(intent:|market:|tel:|sms:|mailto:|file:)/i.test(url || '');
}

function defaultCosmeticCss() {
  // Conservative generic element hiding. Users can override/add custom CSS.
  return `
/* generic "ad/sponsor/promo" containers */
[id*="ad" i],[class*="ad" i],
[id*="ads" i],[class*="ads" i],
[id*="sponsor" i],[class*="sponsor" i],
[id*="promoted" i],[class*="promoted" i],
[id*="promo" i],[class*="promo" i],
[aria-label*="ad" i],[aria-label*="sponsored" i],
iframe[src*="ads" i],iframe[id*="ad" i],iframe[class*="ad" i],
div[data-ad],section[data-ad],
.adsbygoogle { display:none !important; }
`;
}

function autoSkipAdsScript() {
  // Runs in page context. Conservative: only clicks elements that look like skip/close ad.
  // Avoids generic "continue/next" to reduce misclick.
  return `
(() => {
  if (window.__browser_is_autoskip_installed) return;
  window.__browser_is_autoskip_installed = true;

  const CLICK_TEXT = [
    '跳过', '跳過', '跳过广告', '跳過廣告',
    'Skip', 'Skip Ad', 'Skip Ads',
    '关闭', '關閉', '关闭广告', '關閉廣告',
    'Close', 'Dismiss'
  ];

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const textOf = (el) =>
    (el.innerText || el.getAttribute?.('aria-label') || el.title || el.getAttribute?.('title') || '').trim();

  const textMatches = (txt) => {
    const t = (txt || '').toLowerCase();
    return CLICK_TEXT.some((k) => t.includes(k.toLowerCase()));
  };

  const tryClick = (el) => {
    if (!el || !isVisible(el)) return false;
    const txt = textOf(el);
    if (!txt || !textMatches(txt)) return false;
    try { el.click(); return true; } catch { return false; }
  };

  const hardSelectors = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '[class*="skip" i][class*="ad" i]',
    '[aria-label*="skip" i]',
    '[class*="close" i][class*="ad" i]',
    '[aria-label*="close" i]'
  ];

  const hideOverlays = () => {
    const selectors = [
      '[class*="ad" i][class*="overlay" i]',
      '[class*="ad" i][class*="layer" i]',
      '[class*="ad" i][class*="modal" i]',
      '[id*="ad" i][id*="overlay" i]',
      '[class*="countdown" i][class*="ad" i]',
      '[id*="countdown" i][id*="ad" i]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      if (isVisible(el)) el.style.setProperty('display', 'none', 'important');
    });
  };

  const scan = () => {
    // 1) known selectors first
    for (const sel of hardSelectors) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        if (tryClick(el)) return;
      }
    }
    // 2) fallback: scan common clickable elements
    const nodes = document.querySelectorAll('button, [role="button"], a');
    for (const el of nodes) {
      if (tryClick(el)) return;
    }
    hideOverlays();
  };

  scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(scan, 900);
})();
`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: '#0b0d12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), 'electron', 'preload.cjs'),
      sandbox: true
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  // Create the "browser tab" as a BrowserView.
  // Using BrowserView keeps the renderer UI isolated.
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setBrowserView(view);

  // Proxy (VPN): route browser traffic through HTTP/SOCKS5 proxy if configured.
  const session = view.webContents.session;
  applyProxy(session);

  // Anti-hijack: block popups & suspicious schemes by default.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.setWindowOpenHandler(({ url }) => {
    const privacy = getPrivacy();
    if (privacy.blockPopups) return { action: 'deny' };
    if (isDangerousScheme(url)) return { action: 'deny' };
    return { action: 'allow' };
  });

  view.webContents.on('will-navigate', (e, url) => {
    if (isDangerousScheme(url)) {
      e.preventDefault();
    }
  });

  // Anti-trace: permissions + cookies + headers hardening.

  session.setPermissionRequestHandler((_wc, permission, callback) => {
    const privacy = getPrivacy();
    if (privacy.blockNotifications && permission === 'notifications') return callback(false);
    // Keep other permissions default-deny for MVP.
    if (permission === 'media' || permission === 'geolocation' || permission === 'midiSysex') return callback(false);
    callback(false);
  });

  const headerListener = (details, callback) => {
    const privacy = getPrivacy();
    const requestHeaders = { ...(details.requestHeaders || {}) };

    if (privacy.doNotTrack) {
      requestHeaders.DNT = '1';
      requestHeaders['Sec-GPC'] = '1';
    }

    if (privacy.stripReferer) {
      delete requestHeaders.Referer;
      delete requestHeaders.referer;
      // Also strip Origin for some non-CORS requests is risky; keep Origin.
    }

    callback({ requestHeaders });
  };

  // Keep it broad for MVP; later can scope to main frame only.
  session.webRequest.onBeforeSendHeaders(headerListener);

  // Third-party cookies: block Set-Cookie on 3p responses (best-effort).
  session.webRequest.onHeadersReceived((details, callback) => {
    const privacy = getPrivacy();
    if (!privacy.blockThirdPartyCookies) return callback({});

    try {
      const topUrl = details.resourceType === 'mainFrame' ? details.url : details.referrer;
      const topHost = topUrl ? new URL(topUrl).host : '';
      const reqHost = new URL(details.url).host;
      const thirdParty = topHost && reqHost && topHost !== reqHost && !reqHost.endsWith(`.${topHost}`);

      if (!thirdParty) return callback({});

      const headers = details.responseHeaders || {};
      // Electron normalizes header names variably; handle common keys.
      delete headers['set-cookie'];
      delete headers['Set-Cookie'];
      delete headers['Set-cookie'];
      callback({ responseHeaders: headers });
    } catch {
      callback({});
    }
  });

  // Adblock (network level). MVP: global blocker + per-app enabled flag.
  let blocker = null;
  (async () => {
    try {
      blocker = await ElectronBlocker.fromLists(fetch, [
        // EasyList + privacy + annoyance
        'https://easylist.to/easylist/easylist.txt',
        'https://easylist.to/easylist/easyprivacy.txt',
        'https://easylist.to/easylist/fanboy-annoyance.txt'
      ]);
      if (getAdblock().enabled) blocker.enableBlockingInSession(view.webContents.session);
    } catch {
      // ignore for MVP (offline etc.)
    }
  })();

  // Cosmetic filtering: hide ad containers via CSS injection.
  let cosmeticKey = null;
  async function applyCosmeticOnce() {
    const cfg = getCosmetic();
    if (!cfg.enabled) return;
    const css = `${defaultCosmeticCss()}\n${cfg.css || ''}`;
    try {
      cosmeticKey = await view.webContents.insertCSS(css, { cssOrigin: 'user' });
    } catch {
      // ignore
    }
  }

  async function clearCosmetic() {
    if (!cosmeticKey) return;
    try {
      await view.webContents.removeInsertedCSS(cosmeticKey);
    } catch {
      // ignore
    }
    cosmeticKey = null;
  }

  async function applyAutoSkipAdsOnce() {
    const cfg = getAutoSkipAds();
    if (!cfg.enabled) return;
    try {
      await view.webContents.executeJavaScript(autoSkipAdsScript(), true);
    } catch {
      // ignore
    }
  }

  let browserViewHidden = false;
  const TOOLBAR_H = 56;
  const TABBAR_H = 36;
  const TOP_H = TOOLBAR_H + TABBAR_H;
  let lastBounds = { x: 0, y: TOP_H, width: 1200, height: 724 };

  function resizeView() {
    const [w, h] = win.getContentSize();
    lastBounds = { x: 0, y: TOP_H, width: w, height: Math.max(0, h - TOP_H) };
    if (!browserViewHidden) view.setBounds(lastBounds);
  }

  resizeView();
  win.on('resize', resizeView);

  function setBrowserViewHidden(hidden) {
    browserViewHidden = !!hidden;
    if (browserViewHidden) view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    else view.setBounds(lastBounds);
  }

  const pendingRequests = new Map(); // requestId -> resolve

  function requestScriptRun(url, host, matchedScripts) {
    return new Promise((resolve) => {
      const requestId = simpleId();
      pendingRequests.set(requestId, resolve);
      win.webContents.send('script-run-request', { requestId, url, host, matchedScripts });
    });
  }

  async function maybeRunScriptsFor(runAt) {
    const url = view.webContents.getURL();
    const host = getHost(url);
    if (!url || !host) return;

    const matched = pickMatchedScripts(url, runAt);
    if (matched.length === 0) return;

    const permissions = getPermissions();
    const alwaysAllow = !!permissions?.[host]?.alwaysAllow;

    let decision = { allow: false, always: false };
    if (alwaysAllow) {
      decision = { allow: true, always: true };
    } else {
      decision = await requestScriptRun(
        url,
        host,
        matched.map((s) => ({ id: s.id, name: s.name, match: s.match, runAt: s.runAt }))
      );
    }

    if (decision?.allow && decision?.always) {
      setPermissions({
        ...permissions,
        [host]: { alwaysAllow: true }
      });
      win.webContents.send('permissions-changed', getPermissions());
    }

    if (!decision?.allow) return;

    for (const s of matched) {
      // Basic injection: wrap in IIFE boundary.
      // NOTE: This is not a full userscript sandbox; MVP only.
      const wrapped = `(() => {\n${s.code}\n})();\n//# sourceURL=browser_is_userscript_${encodeURIComponent(s.id)}.js`;
      try {
        // Execute in page context
        await view.webContents.executeJavaScript(wrapped, true);
      } catch {
        // ignore for MVP; later we can surface logs/errors
      }
    }
  }

  function emitTabs() {
    win.webContents.send('tabs-changed', { tabs: getTabs(), activeTabId: getActiveTabId() });
  }

  function updateActiveTabUrl(url) {
    const id = getActiveTabId();
    const tabs = getTabs().map((t) => (t.id === id ? { ...t, url: url || t.url } : t));
    setTabs(tabs);
    if (url) store.set('lastUrl', url);
    emitTabs();
  }

  function updateActiveTabTitle(title) {
    const id = getActiveTabId();
    const tabs = getTabs().map((t) => (t.id === id ? { ...t, title: title || t.title } : t));
    setTabs(tabs);
    emitTabs();
  }

  view.webContents.on('did-start-navigation', (_e, url, _isInPlace, isMainFrame) => {
    if (isMainFrame && url) updateActiveTabUrl(url);
    win.webContents.send('navigation', { url });
  });

  view.webContents.on('page-title-updated', (_e, title) => {
    updateActiveTabTitle(title);
  });

  view.webContents.on('dom-ready', async () => {
    await applyCosmeticOnce();
    // Enable only when ad filtering is on (network or cosmetic), to reduce surprises.
    if (getAdblock().enabled || getCosmetic().enabled) {
      await applyAutoSkipAdsOnce();
    }
    await maybeRunScriptsFor('dom-ready');
  });

  view.webContents.on('did-finish-load', async () => {
    await maybeRunScriptsFor('did-finish-load');
  });

  const initialTabs = getTabs();
  const initialActiveId = getActiveTabId();
  const initialTab = initialTabs.find((t) => t.id === initialActiveId) || initialTabs[0];
  view.webContents.loadURL(initialTab?.url || DEFAULT_HOME);

  ipcMain.handle('addTab', async () => {
    const tabs = getTabs();
    const id = simpleId();
    const newTab = { id, url: DEFAULT_HOME, title: 'New Tab' };
    setTabs([...tabs, newTab]);
    setActiveTabId(id);
    await view.webContents.loadURL(newTab.url);
    emitTabs();
    return { tabs: getTabs(), activeTabId: id };
  });

  ipcMain.handle('removeTab', async (_evt, tabId) => {
    let tabs = getTabs();
    if (tabs.length <= 1) return { tabs: getTabs(), activeTabId: getActiveTabId() };
    const wasActive = getActiveTabId() === tabId;
    tabs = tabs.filter((t) => t.id !== tabId);
    setTabs(tabs);
    if (wasActive) {
      const idx = Math.min(tabs.length - 1, 1);
      const next = tabs[idx] || tabs[0];
      setActiveTabId(next.id);
      await view.webContents.loadURL(next.url);
    }
    emitTabs();
    return { tabs: getTabs(), activeTabId: getActiveTabId() };
  });

  ipcMain.handle('setActiveTab', async (_evt, tabId) => {
    const tab = getTabs().find((t) => t.id === tabId);
    if (!tab) return { tabs: getTabs(), activeTabId: getActiveTabId() };
    setActiveTabId(tabId);
    await view.webContents.loadURL(tab.url);
    emitTabs();
    return { tabs: getTabs(), activeTabId: tabId };
  });

  ipcMain.handle('navigate', async (_evt, url) => {
    await view.webContents.loadURL(url);
    return true;
  });

  ipcMain.handle('goBack', () => {
    if (view.webContents.canGoBack()) view.webContents.goBack();
  });

  ipcMain.handle('reload', () => {
    view.webContents.reload();
  });

  ipcMain.handle('getState', () => ({
    lastUrl: store.get('lastUrl') || DEFAULT_HOME,
    tabs: getTabs(),
    activeTabId: getActiveTabId(),
    scripts: getScripts(),
    permissions: getPermissions(),
    adblock: getAdblock(),
    cosmetic: getCosmetic(),
    autoSkipAds: getAutoSkipAds(),
    proxy: getProxy(),
    privacy: getPrivacy()
  }));

  ipcMain.handle('upsertScript', (_evt, script) => {
    const scripts = getScripts();
    const next = { ...script };
    if (!next.id) next.id = simpleId();
    if (!next.name) next.name = 'Untitled Script';
    if (!next.match) next.match = '*://*/*';
    if (!next.runAt) next.runAt = 'dom-ready';
    if (typeof next.enabled !== 'boolean') next.enabled = true;
    if (!next.code) next.code = '';

    const idx = scripts.findIndex((s) => s.id === next.id);
    if (idx >= 0) scripts[idx] = next;
    else scripts.unshift(next);
    setScripts(scripts);
    win.webContents.send('scripts-changed', getScripts());
    return next;
  });

  ipcMain.handle('removeScript', (_evt, id) => {
    const scripts = getScripts().filter((s) => s.id !== id);
    setScripts(scripts);
    win.webContents.send('scripts-changed', getScripts());
    return true;
  });

  ipcMain.handle('setScriptEnabled', (_evt, { id, enabled }) => {
    const scripts = getScripts().map((s) => (s.id === id ? { ...s, enabled: !!enabled } : s));
    setScripts(scripts);
    win.webContents.send('scripts-changed', getScripts());
    return true;
  });

  ipcMain.on('script-run-response', (_evt, { requestId, allow, always }) => {
    const resolve = pendingRequests.get(requestId);
    if (!resolve) return;
    pendingRequests.delete(requestId);
    resolve({ allow: !!allow, always: !!always });
  });

  ipcMain.handle('setAdblockEnabled', async (_evt, enabled) => {
    const next = { ...getAdblock(), enabled: !!enabled };
    setAdblock(next);
    // Best-effort: if blocker loaded, toggle.
    try {
      if (blocker) {
        if (next.enabled) blocker.enableBlockingInSession(view.webContents.session);
        else blocker.disableBlockingInSession(view.webContents.session);
      }
    } catch {
      // ignore
    }
    win.webContents.send('adblock-changed', getAdblock());
    return getAdblock();
  });

  ipcMain.handle('setCosmetic', async (_evt, patch) => {
    const current = getCosmetic();
    const next = { ...current, ...(patch || {}) };
    setCosmetic(next);
    // Apply immediately to current page.
    if (!next.enabled) await clearCosmetic();
    else {
      await clearCosmetic();
      await applyCosmeticOnce();
    }
    win.webContents.send('cosmetic-changed', getCosmetic());
    return getCosmetic();
  });

  ipcMain.handle('setAutoSkipAdsEnabled', async (_evt, enabled) => {
    const next = { ...getAutoSkipAds(), enabled: !!enabled };
    setAutoSkipAds(next);
    win.webContents.send('autoskip-changed', getAutoSkipAds());
    // Apply immediately (best-effort).
    if (next.enabled && (getAdblock().enabled || getCosmetic().enabled)) {
      await applyAutoSkipAdsOnce();
    }
    return getAutoSkipAds();
  });

  ipcMain.handle('setBrowserViewHidden', (_evt, hidden) => {
    setBrowserViewHidden(hidden);
    return true;
  });

  ipcMain.handle('setProxy', async (_evt, patch) => {
    const current = getProxy();
    const next = { ...current, ...(patch || {}) };
    setProxy(next);
    applyProxy(view.webContents.session);
    win.webContents.send('proxy-changed', getProxy());
    return getProxy();
  });

  ipcMain.handle('setPrivacy', async (_evt, patch) => {
    const current = getPrivacy();
    const next = { ...current, ...(patch || {}) };
    setPrivacy(next);
    win.webContents.send('privacy-changed', getPrivacy());
    return getPrivacy();
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

