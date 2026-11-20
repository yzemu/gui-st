const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('lib:load'),
  save: d => ipcRenderer.invoke('lib:save', d),
  pickExe: () => ipcRenderer.invoke('pick:exe'),
  pickCover: () => ipcRenderer.invoke('pick:cover'),
  launch: id => ipcRenderer.invoke('game:launch', id),
  scan: f => ipcRenderer.invoke('scan:run', f),
  pickFolder: () => ipcRenderer.invoke('pick:folder'),
  updCheck: () => ipcRenderer.invoke('upd:check'),
  updInstall: () => ipcRenderer.invoke('upd:install'),
  version: () => ipcRenderer.invoke('app:version'),
  onUpd: cb => ipcRenderer.on('upd:status', (_, s) => cb(s)),
  pathOf: f => webUtils.getPathForFile(f),
  zoom: z => webFrame.setZoomFactor(z),
  titlebar: (c, s) => ipcRenderer.invoke('ui:titlebar', c, s),
  openData: () => ipcRenderer.invoke('app:openData'),
  onChanged: cb => ipcRenderer.on('lib:changed', (_, p) => cb(p)),
  onError: cb => ipcRenderer.on('game:error', (_, m) => cb(m))
});
