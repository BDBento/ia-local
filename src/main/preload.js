'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('farolIA', {
  getInitialState: () => ipcRenderer.invoke('app:get-initial-state'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  refreshOllama: () => ipcRenderer.invoke('ollama:refresh'),
  sendChat: (payload) => ipcRenderer.invoke('ollama:chat', payload),
  onNetworkPolicy: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('network:policy', listener);
    return () => ipcRenderer.removeListener('network:policy', listener);
  },
});
