'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { createConfigStore } = require('./config-store');
const { getHardwareInfo } = require('./hardware');
const ollama = require('./ollama');
const { recommendModels } = require('../shared/recommender');

let mainWindow;
let configStore;
let currentConfig;

function isLocalRequest(urlString) {
  try {
    const url = new URL(urlString);
    return ['file:', 'devtools:'].includes(url.protocol)
      || ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function applyNetworkPolicy() {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const shouldBlock = currentConfig?.offlineStrict && !isLocalRequest(details.url);
    callback({ cancel: Boolean(shouldBlock) });
  });
  mainWindow?.webContents.send('network:policy', {
    offlineStrict: currentConfig.offlineStrict,
  });
}

async function getState() {
  const [hardware, status] = await Promise.all([
    getHardwareInfo(),
    ollama.getStatus(),
  ]);
  let installedModels = [];
  if (status.available) {
    try {
      installedModels = await ollama.listInstalledModels();
    } catch {
      installedModels = [];
    }
  }
  return {
    config: currentConfig,
    hardware,
    ollama: { ...status, installedModels },
    recommendations: recommendModels(currentConfig),
  };
}

function registerIpc() {
  ipcMain.handle('app:get-initial-state', getState);
  ipcMain.handle('ollama:refresh', getState);
  ipcMain.handle('settings:save', async (_event, input) => {
    currentConfig = await configStore.save(input);
    applyNetworkPolicy();
    return {
      config: currentConfig,
      recommendations: recommendModels(currentConfig),
    };
  });
  ipcMain.handle('ollama:chat', async (_event, payload) => {
    return ollama.chat({ ...payload, settings: currentConfig });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#08110f',
    title: 'Farol IA Local',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  configStore = createConfigStore(app.getPath('userData'));
  currentConfig = await configStore.load();
  registerIpc();
  createWindow();
  applyNetworkPolicy();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
