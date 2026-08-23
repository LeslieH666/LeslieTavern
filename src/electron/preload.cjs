const { contextBridge, ipcRenderer } = require('electron');

const hostId = globalThis.crypto?.randomUUID?.()
    ?? `leslie-page-${Date.now()}-${Math.random().toString(36).slice(2)}`;

contextBridge.exposeInMainWorld('leslieCompanionHost', {
    poll: snapshot => ipcRenderer.invoke('leslie:companion:poll', { hostId, snapshot }),
    publish: (requestId, event) => ipcRenderer.invoke('leslie:companion:publish', { hostId, requestId, event }),
});
