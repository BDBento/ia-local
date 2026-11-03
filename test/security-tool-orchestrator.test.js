'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getInstallCommand, getTool, outputContainsPackage } = require('../src/main/security-tool-orchestrator');

test('aceita somente ferramentas do catálogo fechado', () => {
  assert.equal(getTool('nmap').packageId, 'Insecure.Nmap');
  assert.throws(() => getTool('comando-arbitrario'), /catálogo supervisionado/);
});

test('gera instalação fixa pelo winget', () => {
  assert.equal(getInstallCommand('zap'), 'winget install --id ZAP.ZAP --exact --accept-package-agreements --accept-source-agreements --silent');
});

test('reconhece pacote instalado pela saída do winget mesmo fora do PATH', () => {
  const output = 'Name      Id            Version Source\nNmap 7.80 Insecure.Nmap 7.80 winget';
  assert.equal(outputContainsPackage(output, 'Insecure.Nmap'), true);
  assert.equal(outputContainsPackage(output, 'ZAP.ZAP'), false);
});
