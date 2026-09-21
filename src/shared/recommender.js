'use strict';

const catalog = require('./model-catalog');

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function contextOverheadGB(contextSize) {
  const safeContext = clamp(contextSize, 1024, 131072);
  return Math.max(0.4, (safeContext / 4096) * 0.4);
}

function recommendModels(settings, models = catalog) {
  const ramBudgetGB = clamp(settings.ramLimitGB, 2, 1024);
  const vramBudgetGB = settings.useGpu
    ? clamp(settings.vramLimitGB, 0, 1024)
    : 0;
  const overhead = contextOverheadGB(settings.contextSize);

  return models
    .map((model) => {
      const requiredRam = model.minRamGB + overhead;
      const recommendedRam = model.recommendedRamGB + overhead;
      const requiredVram = model.fullGpuVramGB + overhead;

      if (ramBudgetGB < requiredRam) {
        return {
          ...model,
          level: 'unsupported',
          label: 'Não recomendado',
          reason: `Requer cerca de ${requiredRam.toFixed(1)} GB no orçamento configurado.`,
          score: 0,
        };
      }

      if (vramBudgetGB >= requiredVram) {
        return {
          ...model,
          level: 'gpu',
          label: 'Compatível com a GPU',
          reason: 'Pode permanecer majoritariamente na GPU com este contexto.',
          score: 3,
        };
      }

      if (vramBudgetGB >= Math.max(2, requiredVram * 0.35)) {
        return {
          ...model,
          level: 'hybrid',
          label: 'Compatível parcialmente',
          reason: 'Usará GPU e memória RAM; a velocidade pode variar.',
          score: 2,
        };
      }

      return {
        ...model,
        level: 'cpu',
        label: 'Compatível somente pela CPU',
        reason: ramBudgetGB >= recommendedRam
          ? 'Funcionará pela CPU, mas será mais lento.'
          : 'Funcionará pela CPU com pouca margem de memória.',
        score: 1,
      };
    })
    .sort((left, right) => right.score - left.score || left.sizeGB - right.sizeGB);
}

module.exports = {
  clamp,
  contextOverheadGB,
  recommendModels,
};
