'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStatus } = require('../src/main/network-guardian');

test('mantém o terminal bloqueado sem enforcement ativo', () => {
  const status = normalizeStatus({
    ok: true,
    policy: { terminalEnabled: true, enforcement: 'diagnostic-only' },
  });
  assert.equal(status.policy.terminalEnabled, false);
  assert.equal(status.policy.defaultNetwork, 'deny');
});

test('só habilita terminal quando o enforcer está ativo', () => {
  const status = normalizeStatus({
    ok: true,
    protocolVersion: '1',
    platform: 'windows',
    capabilities: { wfpAvailable: true },
    policy: {
      terminalEnabled: true,
      enforcement: 'active',
      externalAccess: false,
    },
  });
  assert.equal(status.policy.terminalEnabled, true);
  assert.equal(status.policy.externalAccess, false);
});

test('nunca aceita política padrão de rede liberada', () => {
  const status = normalizeStatus({
    ok: true,
    policy: {
      defaultNetwork: 'allow',
      terminalEnabled: false,
      enforcement: 'active',
    },
  });
  assert.equal(status.policy.defaultNetwork, 'deny');
  assert.equal(status.policy.authorizationMode, 'human-required');
});

test('normaliza capacidades informadas pelo componente nativo', () => {
  const status = normalizeStatus({
    ok: true,
    capabilities: {
      wfpAvailable: true,
      wfpEngineAccessible: true,
      applicationIdentityFiltering: true,
      dynamicSessionCleanup: true,
      wfpManagementApiAvailable: true,
      enforcerReadyForInstallation: false,
    },
    policy: { filterState: 'not-installed' },
  });
  assert.equal(status.capabilities.wfpEngineAccessible, true);
  assert.equal(status.capabilities.applicationIdentityFiltering, true);
  assert.equal(status.capabilities.dynamicSessionCleanup, true);
  assert.equal(status.capabilities.wfpManagementApiAvailable, true);
  assert.equal(status.capabilities.enforcerReadyForInstallation, false);
  assert.equal(status.policy.filterState, 'not-installed');
});
