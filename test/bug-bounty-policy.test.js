'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePolicy } = require('../src/shared/bug-bounty-policy');

test('marca cabeçalhos e cookies excluídos pela política', () => {
  const policy = analyzePolicy('Falta de cabeçalhos de segurança (CSP / HSTS / X-Content-Type-Options). Falta de flags nos cookies HttpOnly, SameSite e Secure.');
  assert.equal(policy.classify({ id: 'header-content-security-policy' }).eligibility, 'excluded');
  assert.equal(policy.classify({ id: 'cookie-secure-0' }).eligibility, 'excluded');
  assert.equal(policy.classify({ id: 'outro-achado' }).eligibility, 'review');
});

test('reconhece exclusões de banner e HSTS isolado', () => {
  const policy = analyzePolicy('Problemas de captura de banners, como nome do servidor. Cabeçalho HSTS ausente.');
  assert.equal(policy.classify({ id: 'server-version' }).eligibility, 'excluded');
  assert.equal(policy.classify({ id: 'header-strict-transport-security' }).eligibility, 'excluded');
});
