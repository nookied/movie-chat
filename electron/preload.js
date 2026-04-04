const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setupAPI', {
  /** Subscribe to progress events from the auto-setup pipeline. */
  onProgress: (callback) => ipcRenderer.on('setup:progress', (_event, data) => {
    try { callback(data); } catch (e) { console.error('[setup:progress]', e); }
  }),

  /** Called when setup completes (success or partial failure). */
  onComplete: (callback) => ipcRenderer.on('setup:complete', (_event, data) => {
    try { callback(data); } catch (e) { console.error('[setup:complete]', e); }
  }),

  /** Request a full retry of the setup pipeline. */
  retry: () => ipcRenderer.send('setup:retry'),
});
