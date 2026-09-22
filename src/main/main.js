'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const { createConfigStore } = require('./config-store');
const { getHardwareInfo } = require('./hardware');
const ollama = require('./ollama');
const networkGuardian = require('./network-guardian');
const { createAuthorizationManager } = require('./network-authorization');
const { recommendModels } = require('../shared/recommender');
const terminal = require('./terminal');
const { createConversationStore } = require('./conversation-store');
const vscodeIntegration = require('./vscode-integration');

let mainWindow;
let configStore;
let currentConfig;
let authorizationManager;
let conversationStore;
let operationActive = false;
let networkActivity = { externalAccess: false, label: '' };

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

function sendProgress(kind, update) {
  mainWindow?.webContents.send('models:progress', { kind, ...update });
}

function sendNetworkActivity(externalAccess, label = '') {
  networkActivity = { externalAccess, label };
  mainWindow?.webContents.send('network:activity', {
    externalAccess,
    offlineStrict: currentConfig.offlineStrict,
    label,
  });
}

async function runExclusive(action) {
  if (operationActive) {
    throw new Error('Já existe uma operação de modelo em andamento.');
  }
  operationActive = true;
  try {
    return await action();
  } finally {
    operationActive = false;
  }
}

async function getState() {
  const [hardware, status, guardian] = await Promise.all([
    getHardwareInfo(),
    ollama.getStatus(),
    networkGuardian.getStatus(),
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
    networkActivity,
    guardian,
  };
}

function registerIpc() {
  ipcMain.handle('app:get-initial-state', getState);
  ipcMain.handle('ollama:refresh', getState);
  ipcMain.handle('conversations:list', () => conversationStore.list());
  ipcMain.handle('conversations:get', (_event, id) => conversationStore.get(id));
  ipcMain.handle('conversations:save', (_event, input) => conversationStore.save(input));
  ipcMain.handle('conversations:delete', (_event, id) => conversationStore.delete(id));
  ipcMain.handle('vscode:choose-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'Escolha o projeto do VS Code' });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('vscode:sync', async (_event, input) => {
    const models = await ollama.listInstalledModels();
    const conversation = input?.conversationId ? await conversationStore.get(input.conversationId) : null;
    return vscodeIntegration.setupVsCode({ projectPath: input?.projectPath, models, conversation });
  });
  ipcMain.handle('guardian:status', networkGuardian.getStatus);
  ipcMain.handle('guardian:authorizations', () => authorizationManager.list());
  ipcMain.handle('guardian:authorization-request', (_event, input) => {
    if (!['model-download', 'terminal-command'].includes(input?.kind)) throw new Error('Tipo de autorização não permitido.');
    if (input.kind === 'terminal-command' && !currentConfig.terminalToolsEnabled) {
      throw new Error('As ferramentas de terminal estão desativadas nas configurações.');
    }
    const target = input.kind === 'model-download'
      ? ollama.validateModelName(input?.target)
      : terminal.validateCommand(input?.target);
    return authorizationManager.request({
      kind: input.kind,
      target,
      reason: input.kind === 'model-download'
        ? 'Baixar um modelo por meio do Ollama requer acesso à internet.'
        : String(input?.reason || 'A IA solicitou a execução deste comando local.').slice(0, 300),
    });
  });
  ipcMain.handle('guardian:authorization-decision', (_event, input) => {
    return authorizationManager.decide(input?.id, input?.decision);
  });
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
  ipcMain.handle('terminal:execute', async (_event, input) => {
    if (!currentConfig.terminalToolsEnabled) throw new Error('As ferramentas de terminal estão desativadas.');
    const command = terminal.validateCommand(input?.command);
    await authorizationManager.consume({
      id: input?.authorizationId,
      approvalToken: input?.approvalToken,
      kind: 'terminal-command',
      target: command,
    });
    return terminal.execute({ command, cwd: input?.cwd, fallbackCwd: app.getPath('home') });
  });
  ipcMain.handle('models:pull', async (_event, input) => runExclusive(async () => {
    const model = ollama.validateModelName(input?.model);
    await authorizationManager.consume({
      id: input?.authorizationId,
      approvalToken: input?.approvalToken,
      kind: 'model-download',
      target: model,
    });
    sendNetworkActivity(true, 'Baixando modelo');
    try {
      return await ollama.pullModel(model, (update) => sendProgress('pull', update));
    } finally {
      sendNetworkActivity(false, 'Download finalizado');
    }
  }));
  ipcMain.handle('models:delete', async (_event, model) => {
    return runExclusive(() => ollama.deleteModel(model));
  });
  ipcMain.handle('training:create', async (_event, payload) => runExclusive(() => {
    return ollama.createCustomModel(payload, (update) => sendProgress('create', update));
  }));
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
  authorizationManager = createAuthorizationManager({
    auditPath: path.join(app.getPath('userData'), 'security-audit.jsonl'),
  });
  conversationStore = createConversationStore(app.getPath('userData'));
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
