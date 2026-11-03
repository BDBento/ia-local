'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const TOOLS = Object.freeze({
  nmap: {
    id: 'nmap', name: 'Nmap', packageId: 'Insecure.Nmap', executable: 'nmap.exe',
    purpose: 'Inventário controlado de portas e serviços.',
    risk: 'Gera tráfego ativo. Use somente se as regras do programa permitirem varredura.',
  },
  zap: {
    id: 'zap', name: 'OWASP ZAP', packageId: 'ZAP.ZAP', executable: 'zap.exe',
    purpose: 'Análise de aplicações web e proxy de inspeção.',
    risk: 'O scanner ativo pode alterar estado. O Farol instala a ferramenta, mas não inicia ataques automaticamente.',
  },
});

function publicTool(tool, installed = false) {
  return { id: tool.id, name: tool.name, purpose: tool.purpose, risk: tool.risk, installed };
}

function getTool(id) {
  const tool = TOOLS[String(id || '')];
  if (!tool) throw new Error('Ferramenta não pertence ao catálogo supervisionado.');
  return tool;
}

function getInstallCommand(id) {
  const tool = getTool(id);
  return `winget install --id ${tool.packageId} --exact --accept-package-agreements --accept-source-agreements --silent`;
}

async function commandExists(executable) {
  try {
    await execFileAsync('where.exe', [executable], { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function listTools() {
  return Promise.all(Object.values(TOOLS).map(async (tool) => publicTool(tool, await commandExists(tool.executable))));
}

module.exports = { getInstallCommand, getTool, listTools, publicTool, TOOLS };
