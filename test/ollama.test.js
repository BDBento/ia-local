'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateModelName } = require('../src/main/ollama');

test('aceita nomes e tags válidos do Ollama', () => {
  assert.equal(validateModelName('dolphin-mistral:7b'), 'dolphin-mistral:7b');
  assert.equal(
    validateModelName('usuario/modelo_custom:q4_K_M'),
    'usuario/modelo_custom:q4_K_M',
  );
});

test('rejeita endereço ou comando como nome de modelo', () => {
  assert.throws(() => validateModelName('https://exemplo.com/modelo'));
  assert.throws(() => validateModelName('modelo; comando'));
});
