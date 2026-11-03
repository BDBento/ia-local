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

async function installTool(id) {
  const tool = getTool(id);
  const args = ['install', '--id', tool.packageId, '--exact', '--accept-package-agreements', '--accept-source-agreements', '--silent', '--disable-interactivity'];
  try {
    const { stdout, stderr } = await execFileAsync('winget.exe', args, {
      windowsHide: true,
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    return { tool: publicTool(tool, true), exitCode: 0, stdout, stderr };
  } catch (error) {
    if (error.killed || error.signal) throw new Error(`A instalação de ${tool.name} excedeu 10 minutos e foi encerrada.`);
    if (await packageInstalled(tool)) {
      return {
        tool: publicTool(tool, true),
        exitCode: 0,
        stdout: String(error.stdout || `O ${tool.name} já está instalado.`),
        stderr: '',
        alreadyInstalled: true,
      };
    }
    return {
      tool: publicTool(tool, false),
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || 'Falha sem detalhes retornados pelo winget.'),
    };
  }
}

async function commandExists(executable) {
  try {
    await execFileAsync('where.exe', [executable], { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function outputContainsPackage(output, packageId) {
  return String(output || '').toLowerCase().includes(String(packageId || '').toLowerCase());
}

async function packageInstalled(tool) {
  try {
    const { stdout } = await execFileAsync('winget.exe', [
      'list', '--id', tool.packageId, '--exact', '--accept-source-agreements', '--disable-interactivity',
    ], { windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024, encoding: 'utf8' });
    return outputContainsPackage(stdout, tool.packageId);
  } catch {
    return commandExists(tool.executable);
  }
}

async function listTools() {
  return Promise.all(Object.values(TOOLS).map(async (tool) => publicTool(tool, await packageInstalled(tool))));
}

module.exports = { getInstallCommand, getTool, installTool, listTools, outputContainsPackage, publicTool, TOOLS };
