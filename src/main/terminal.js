'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_COMMAND_LENGTH = 4000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const TIMEOUT_MS = 30 * 1000;

function validateCommand(value) {
  const command = String(value || '').trim();
  if (!command) throw new Error('O comando está vazio.');
  if (command.length > MAX_COMMAND_LENGTH) throw new Error('O comando excede o limite de 4.000 caracteres.');
  if (/\r|\n/.test(command)) throw new Error('Somente comandos de uma linha são permitidos.');
  return command;
}

function resolveWorkingDirectory(value, fallback) {
  return path.resolve(String(value || '').trim() || fallback);
}

async function execute({ command, cwd, fallbackCwd }) {
  const safeCommand = validateCommand(command);
  const safeCwd = resolveWorkingDirectory(cwd, fallbackCwd);
  try {
    const { stdout, stderr } = await execFileAsync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', safeCommand,
    ], {
      cwd: safeCwd,
      timeout: TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: MAX_OUTPUT_BYTES,
      encoding: 'utf8',
    });
    return { command: safeCommand, cwd: safeCwd, exitCode: 0, stdout, stderr };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('PowerShell ou pasta de trabalho não encontrado.');
    if (error.killed || error.signal) throw new Error('O comando excedeu 30 segundos e foi encerrado.');
    return {
      command: safeCommand,
      cwd: safeCwd,
      exitCode: Number.isInteger(error.code) ? error.code : 1,
      stdout: String(error.stdout || ''),
      stderr: String(error.stderr || error.message || ''),
    };
  }
}

module.exports = { MAX_COMMAND_LENGTH, TIMEOUT_MS, execute, resolveWorkingDirectory, validateCommand };
