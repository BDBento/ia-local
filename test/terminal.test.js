'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execute, validateCommand } = require('../src/main/terminal');

test('rejeita comando vazio ou com múltiplas linhas', () => {
  assert.throws(() => validateCommand(''));
  assert.throws(() => validateCommand('Get-Date\nGet-Location'));
});

test('executa PowerShell sem perfil e captura a saída', async () => {
  const result = await execute({
    command: "[Console]::Write('farol-ok')",
    fallbackCwd: process.cwd(),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'farol-ok');
});
