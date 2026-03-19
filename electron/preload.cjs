const { contextBridge, ipcRenderer } = require('electron');

function on(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('browserIsApi', {
  navigate: (url) => ipcRenderer.invoke('navigate', url),
  goBack: () => ipcRenderer.invoke('goBack'),
  reload: () => ipcRenderer.invoke('reload'),

  getState: () => ipcRenderer.invoke('getState'),
  upsertScript: (script) => ipcRenderer.invoke('upsertScript', script),
  removeScript: (id) => ipcRenderer.invoke('removeScript', id),
  setScriptEnabled: (id, enabled) => ipcRenderer.invoke('setScriptEnabled', { id, enabled }),
  setAdblockEnabled: (enabled) => ipcRenderer.invoke('setAdblockEnabled', enabled),
  setCosmetic: (patch) => ipcRenderer.invoke('setCosmetic', patch),
  setAutoSkipAdsEnabled: (enabled) => ipcRenderer.invoke('setAutoSkipAdsEnabled', enabled),
  setPrivacy: (patch) => ipcRenderer.invoke('setPrivacy', patch),

  sendScriptRunDecision: ({ requestId, allow, always }) => {
    ipcRenderer.send('script-run-response', { requestId, allow, always });
  },

  onScriptsChanged: (cb) =>
    on('scripts-changed', (_evt, scripts) => {
      cb?.(scripts);
    }),

  onPermissionsChanged: (cb) =>
    on('permissions-changed', (_evt, permissions) => {
      cb?.(permissions);
    }),
  onAdblockChanged: (cb) =>
    on('adblock-changed', (_evt, adblock) => {
      cb?.(adblock);
    }),
  onCosmeticChanged: (cb) =>
    on('cosmetic-changed', (_evt, cosmetic) => {
      cb?.(cosmetic);
    }),
  onAutoSkipAdsChanged: (cb) =>
    on('autoskip-changed', (_evt, autoskip) => {
      cb?.(autoskip);
    }),
  onPrivacyChanged: (cb) =>
    on('privacy-changed', (_evt, privacy) => {
      cb?.(privacy);
    }),

  onNavigation: (cb) =>
    on('navigation', (_evt, payload) => {
      cb?.(payload);
    }),

  onScriptRunRequest: (cb) =>
    on('script-run-request', (_evt, payload) => {
      cb?.(payload);
    }),
  
});

