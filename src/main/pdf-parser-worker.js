'use strict';

const { extractPdf } = require('./pdf-extractor');

process.parentPort.on('message', async (event) => {
  try {
    const result = await extractPdf(event.data.filePath);
    process.parentPort.postMessage({ ok: true, result });
  } catch (error) {
    process.parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível ler o PDF.',
    });
  }
});
