'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeResponse, buildReport, isPublicAddress, matchesAllowedTarget, normalizePublicTarget, scanTarget } = require('../src/main/bug-bounty-scanner');

test('normaliza apenas alvo público HTTPS', () => {
  assert.equal(normalizePublicTarget('example.com'), 'https://example.com/');
  assert.throws(() => normalizePublicTarget('http://example.com'), /HTTPS/);
  assert.throws(() => normalizePublicTarget('localhost'), /públicos/);
  assert.throws(() => normalizePublicTarget('https://[::1]'), /públicos/);
  assert.equal(isPublicAddress('169.254.1.1'), false);
  assert.equal(isPublicAddress('::ffff:192.168.0.1'), false);
  assert.equal(isPublicAddress('2606:4700::1111'), true);
});

test('restringe auditoria à allowlist', () => {
  assert.equal(matchesAllowedTarget('https://api.example.com/', '*.example.com'), true);
  assert.equal(matchesAllowedTarget('https://example.com/', '*.example.com'), false);
  assert.equal(matchesAllowedTarget('https://evil.example.net/', '*.example.com'), false);
});

test('gera achados didáticos e relatório preliminar', () => {
  const headers = new Headers({ server: 'Example/1.2', 'x-content-type-options': 'nosniff' });
  const result = analyzeResponse({ url: 'https://example.com/', status: 200, headers, cookies: ['session=abc; Secure'] });
  assert.ok(result.findings.some((item) => item.id === 'header-content-security-policy'));
  assert.ok(result.findings.some((item) => item.id === 'cookie-httponly-0'));
  assert.match(buildReport(result), /Relatório preliminar/);
});

test('exige política antes da rede e interrompe em respostas não 2xx', async () => {
  let requests = 0;
  const input = {
    target: 'example.com', allowedTargets: 'example.com', programPolicy: 'Política de teste',
    read: async () => { requests++; return { status: 302 }; },
  };
  await assert.rejects(scanTarget(input), /política/);
  assert.equal(requests, 0);
  const result = await scanTarget({ ...input, policySnapshot: { confirmed: true, consultedAt: '2026-01-01', sha256: 'teste' } });
  assert.equal(requests, 1);
  assert.deepEqual(result.findings, []);
  assert.match(result.stopped, /302/);
});
