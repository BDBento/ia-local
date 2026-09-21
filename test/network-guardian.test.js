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
});
