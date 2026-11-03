'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeResponse, buildReport, matchesAllowedTarget, normalizePublicTarget } = require('../src/main/bug-bounty-scanner');

test('normaliza apenas alvo público HTTPS', () => {
  assert.equal(normalizePublicTarget('example.com'), 'https://example.com/');
  assert.throws(() => normalizePublicTarget('http://example.com'), /HTTPS/);
  assert.throws(() => normalizePublicTarget('localhost'), /públicos/);
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
