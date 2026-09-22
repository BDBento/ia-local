'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { contextOverheadGB, recommendModels } = require('../src/shared/recommender');
const catalog = require('../src/shared/model-catalog');

test('inclui variantes DeepSeek R1 válidas no catálogo', () => {
  const ids = catalog.map((model) => model.id);
  assert.ok(ids.includes('deepseek-r1:1.5b'));
  assert.ok(ids.includes('deepseek-r1:7b'));
  assert.ok(ids.includes('deepseek-r1:8b'));
  assert.ok(ids.includes('deepseek-r1:14b'));
  assert.ok(ids.includes('deepseek-r1:32b'));
});

test('contexto maior reserva mais memória', () => {
  assert.ok(contextOverheadGB(16384) > contextOverheadGB(4096));
});

test('classifica modelo como GPU quando há VRAM suficiente', () => {
  const [result] = recommendModels(
    { ramLimitGB: 16, vramLimitGB: 12, useGpu: true, contextSize: 4096 },
    [{ id: 'teste', name: 'Teste', minRamGB: 6, recommendedRamGB: 8, fullGpuVramGB: 6, sizeGB: 4 }],
  );
  assert.equal(result.level, 'gpu');
});

test('respeita modo somente CPU', () => {
  const [result] = recommendModels(
    { ramLimitGB: 16, vramLimitGB: 12, useGpu: false, contextSize: 4096 },
    [{ id: 'teste', name: 'Teste', minRamGB: 6, recommendedRamGB: 8, fullGpuVramGB: 6, sizeGB: 4 }],
  );
  assert.equal(result.level, 'cpu');
});

test('rejeita modelo acima do orçamento de RAM', () => {
  const [result] = recommendModels(
    { ramLimitGB: 4, vramLimitGB: 8, useGpu: true, contextSize: 4096 },
    [{ id: 'teste', name: 'Teste', minRamGB: 8, recommendedRamGB: 10, fullGpuVramGB: 6, sizeGB: 4 }],
  );
  assert.equal(result.level, 'unsupported');
});
