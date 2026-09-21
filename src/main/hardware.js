'use strict';

const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function bytesToGB(bytes) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

async function detectNvidiaGpus() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ], { windowsHide: true, timeout: 5000 });

    return stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        const [name, memoryMB, driver] = line.split(',').map((value) => value.trim());
        return {
          id: index,
          vendor: 'NVIDIA',
          name,
          vramGB: Math.round((Number(memoryMB) / 1024) * 10) / 10,
          driver,
        };
      });
  } catch {
    return [];
  }
}

async function detectWindowsVideoControllers() {
  if (process.platform !== 'win32') return [];

  const command = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress',
  ];

  try {
    const { stdout } = await execFileAsync('powershell.exe', command, {
      windowsHide: true,
      timeout: 7000,
    });
    if (!stdout.trim()) return [];
    const parsed = JSON.parse(stdout);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((gpu, index) => ({
      id: index,
      vendor: /nvidia/i.test(gpu.Name) ? 'NVIDIA' : /amd|radeon/i.test(gpu.Name) ? 'AMD' : 'Outro',
      name: gpu.Name || 'GPU não identificada',
      vramGB: gpu.AdapterRAM ? bytesToGB(gpu.AdapterRAM) : null,
      driver: gpu.DriverVersion || null,
    }));
  } catch {
    return [];
  }
}

async function getHardwareInfo() {
  const nvidia = await detectNvidiaGpus();
  const fallback = nvidia.length ? [] : await detectWindowsVideoControllers();
  const cpuList = os.cpus();

  return {
    platform: `${os.type()} ${os.release()}`,
    cpu: {
      name: cpuList[0]?.model?.trim() || 'Processador não identificado',
      logicalThreads: cpuList.length || 1,
    },
    memory: {
      totalGB: bytesToGB(os.totalmem()),
      freeGB: bytesToGB(os.freemem()),
    },
    gpus: nvidia.length ? nvidia : fallback,
  };
}

module.exports = { getHardwareInfo };
