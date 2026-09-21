'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { utilityProcess } = require('electron');

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 60_000;

async function validatePdfFile(filePath) {
  if (path.extname(filePath).toLowerCase() !== '.pdf') {
    throw new Error('Selecione um arquivo com extensão .pdf.');
  }
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error('O caminho selecionado não é um arquivo.');
  if (stats.size === 0) throw new Error('O PDF selecionado está vazio.');
  if (stats.size > MAX_PDF_BYTES) throw new Error('O PDF ultrapassa o limite atual de 25 MB.');
  return stats;
}

async function parsePdfInUtilityProcess(filePath) {
  await validatePdfFile(filePath);
  const workerPath = path.join(__dirname, 'pdf-parser-worker.js');

  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(workerPath, [], {
      execArgv: ['--max-old-space-size=256'],
      serviceName: 'Farol PDF Reader',
      stdio: 'ignore',
    });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error('A leitura do PDF excedeu o limite de 60 segundos.'));
    }, PARSE_TIMEOUT_MS);

    child.on('message', (message) => {
      if (message?.ok) finish(resolve, message.result);
      else finish(reject, new Error(message?.error || 'Não foi possível ler o PDF.'));
    });
    child.on('error', (error) => finish(reject, new Error(`Falha no leitor isolado de PDF: ${error.message}`)));
    child.on('exit', (code) => {
      if (!settled) finish(reject, new Error(`O leitor de PDF foi encerrado inesperadamente (código ${code}).`));
    });
    child.postMessage({ filePath });
  });
}

module.exports = { MAX_PDF_BYTES, parsePdfInUtilityProcess, validatePdfFile };

