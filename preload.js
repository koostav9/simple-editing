const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFile: (type) => ipcRenderer.invoke('select-file', type),
  selectSavePath: () => ipcRenderer.invoke('select-save-path'),
  getMetadata: (filePath) => ipcRenderer.invoke('get-metadata', filePath),
  extractAudio: (filePath) => ipcRenderer.invoke('extract-audio', filePath),
  generateThumbnails: (payload) => ipcRenderer.invoke('generate-thumbnails', payload),
  exportTimeline: (payload) => ipcRenderer.invoke('export-timeline', payload),
  onExportProgress: (callback) => {
    const subscription = (event, percent) => callback(percent);
    ipcRenderer.on('export-progress', subscription);
    return () => ipcRenderer.removeListener('export-progress', subscription);
  },
  log: (msg) => ipcRenderer.send('log', msg)
});
