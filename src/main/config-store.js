'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_CONFIG = Object.freeze({
  offlineStrict: true,
  profile: 'balanced',
  ramLimitGB: 8,
  vramLimitGB: 0,
  useGpu: true,
  gpuId: 0,
  cpuThreads: 4,
  contextSize: 4096,
  keepAliveMinutes: 5,
});

function sanitizeConfig(input = {}) {
  const profile = ['eco', 'balanced', 'performance'].includes(input.profile)
    ? input.profile
    : DEFAULT_CONFIG.profile;

  return {
    offlineStrict: input.offlineStrict !== false,
    profile,
    ramLimitGB: Number(input.ramLimitGB) || DEFAULT_CONFIG.ramLimitGB,
    vramLimitGB: Math.max(0, Number(input.vramLimitGB) || 0),
    useGpu: input.useGpu !== false,
    gpuId: Math.max(0, Number.parseInt(input.gpuId, 10) || 0),
    cpuThreads: Math.max(1, Number.parseInt(input.cpuThreads, 10) || DEFAULT_CONFIG.cpuThreads),
    contextSize: Math.max(1024, Number.parseInt(input.contextSize, 10) || DEFAULT_CONFIG.contextSize),
    keepAliveMinutes: Math.max(0, Number.parseInt(input.keepAliveMinutes, 10) || 0),
  };
}

function createConfigStore(userDataPath) {
  const filePath = path.join(userDataPath, 'config.json');

  return {
    async load() {
      try {
        const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return sanitizeConfig({ ...DEFAULT_CONFIG, ...saved });
      } catch {
        return { ...DEFAULT_CONFIG };
      }
    },
    async save(input) {
      const config = sanitizeConfig(input);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
      return config;
    },
  };
}

module.exports = { DEFAULT_CONFIG, createConfigStore, sanitizeConfig };
