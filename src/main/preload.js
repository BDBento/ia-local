'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('farolIA', {
  getInitialState: () => ipcRenderer.invoke('app:get-initial-state'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  refreshOllama: () => ipcRenderer.invoke('ollama:refresh'),
  sendChat: (payload) => ipcRenderer.invoke('ollama:chat', payload),
  pullModel: (model) => ipcRenderer.invoke('models:pull', model),
  deleteModel: (model) => ipcRenderer.invoke('models:delete', model),
  createCustomModel: (payload) => ipcRenderer.invoke('training:create', payload),
  listKnowledge: () => ipcRenderer.invoke('knowledge:list'),
  addKnowledgePdf: () => ipcRenderer.invoke('knowledge:add-pdf'),
  deleteKnowledge: (id) => ipcRenderer.invoke('knowledge:delete', id),
  getGuardianStatus: () => ipcRenderer.invoke('guardian:status'),
  getAuthorizations: () => ipcRenderer.invoke('guardian:authorizations'),
  requestAuthorization: (input) => ipcRenderer.invoke('guardian:authorization-request', input),
  decideAuthorization: (input) => ipcRenderer.invoke('guardian:authorization-decision', input),
  executeTerminal: (input) => ipcRenderer.invoke('terminal:execute', input),
  listConversations: () => ipcRenderer.invoke('conversations:list'),
  getConversationStoragePath: () => ipcRenderer.invoke('conversations:storage-path'),
  getConversation: (id) => ipcRenderer.invoke('conversations:get', id),
  saveConversation: (input) => ipcRenderer.invoke('conversations:save', input),
  deleteConversation: (id) => ipcRenderer.invoke('conversations:delete', id),
  chooseVsCodeProject: () => ipcRenderer.invoke('vscode:choose-project'),
  syncVsCode: (input) => ipcRenderer.invoke('vscode:sync', input),
  onNetworkPolicy: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('network:policy', listener);
    return () => ipcRenderer.removeListener('network:policy', listener);
  },
  onNetworkActivity: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('network:activity', listener);
    return () => ipcRenderer.removeListener('network:activity', listener);
  },
  onModelProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('models:progress', listener);
    return () => ipcRenderer.removeListener('models:progress', listener);
  },
});
