'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getInstallCommand, getTool } = require('../src/main/security-tool-orchestrator');

test('aceita somente ferramentas do catálogo fechado', () => {
  assert.equal(getTool('nmap').packageId, 'Insecure.Nmap');
  assert.throws(() => getTool('comando-arbitrario'), /catálogo supervisionado/);
});

test('gera instalação fixa pelo winget', () => {
  assert.equal(getInstallCommand('zap'), 'winget install --id ZAP.ZAP --exact --accept-package-agreements --accept-source-agreements --silent');
});
