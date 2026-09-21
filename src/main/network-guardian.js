'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const SAFE_FALLBACK = Object.freeze({
  available: false,
  protocolVersion: '2',
  platform: process.platform,
  elevated: false,
  capabilities: {
    wfpAvailable: false,
    wfpEngineAccessible: false,
    wfpEngineErrorCode: null,
    applicationIdentityFiltering: false,
    dynamicSessionCleanup: false,
    wfpManagementApiAvailable: false,
    serviceHostAvailable: false,
    enforcerReadyForInstallation: false,
    sandboxApiAvailable: false,
  },
  policy: {
    defaultNetwork: 'deny',
    terminalEnabled: false,
    enforcement: 'unavailable',
    authorizationMode: 'human-required',
    filterState: 'not-installed',
    externalAccess: false,
  },
  message: 'Guardião nativo indisponível. Terminal bloqueado por falha segura.',
});

function guardianDllPath() {
  return path.resolve(
    __dirname,
    '..',
    '..',
    'native',
    'Farol.NetworkGuardian',
    'bin',
    'Release',
    'net9.0-windows',
    'Farol.NetworkGuardian.dll',
  );
}

function normalizeStatus(input) {
  const policy = input?.policy || {};
  return {
    available: Boolean(input?.ok),
    protocolVersion: String(input?.protocolVersion || 'unknown'),
    platform: String(input?.platform || process.platform),
    windowsBuild: Number(input?.windowsBuild) || null,
    elevated: Boolean(input?.elevated),
    capabilities: {
      wfpAvailable: Boolean(input?.capabilities?.wfpAvailable),
      wfpEngineAccessible: Boolean(input?.capabilities?.wfpEngineAccessible),
      wfpEngineErrorCode: Number(input?.capabilities?.wfpEngineErrorCode) || null,
      applicationIdentityFiltering: Boolean(input?.capabilities?.applicationIdentityFiltering),
      dynamicSessionCleanup: Boolean(input?.capabilities?.dynamicSessionCleanup),
      wfpManagementApiAvailable: Boolean(input?.capabilities?.wfpManagementApiAvailable),
      serviceHostAvailable: Boolean(input?.capabilities?.serviceHostAvailable),
      enforcerReadyForInstallation: Boolean(input?.capabilities?.enforcerReadyForInstallation),
      sandboxApiAvailable: Boolean(input?.capabilities?.sandboxApiAvailable),
    },
    policy: {
      defaultNetwork: 'deny',
      terminalEnabled: policy.terminalEnabled === true && policy.enforcement === 'active',
      enforcement: String(policy.enforcement || 'unavailable'),
      authorizationMode: 'human-required',
      filterState: String(policy.filterState || 'not-installed'),
      externalAccess: Boolean(policy.externalAccess),
    },
    message: String(input?.message || SAFE_FALLBACK.message).slice(0, 500),
  };
}

async function getStatus() {
  const dllPath = guardianDllPath();
  if (!fs.existsSync(dllPath)) {
    return { ...SAFE_FALLBACK, message: 'Guardião nativo ainda não foi compilado. Terminal bloqueado.' };
  }
  try {
    const { stdout } = await execFileAsync('dotnet', [dllPath, 'status'], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    return normalizeStatus(JSON.parse(stdout));
  } catch {
    return { ...SAFE_FALLBACK };
  }
}

module.exports = { SAFE_FALLBACK, getStatus, guardianDllPath, normalizeStatus };
