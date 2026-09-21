'use strict';

const fs = require('node:fs/promises');

const MAX_PAGES = 500;
const MAX_CHARACTERS = 2_000_000;

function joinTextItems(items) {
  let text = '';
  for (const item of items) {
    if (typeof item?.str !== 'string') continue;
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

async function parsePdf(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('O arquivo selecionado não possui uma assinatura PDF válida.');
  }

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const document = await task.promise;

  try {
    if (document.numPages > MAX_PAGES) {
      throw new Error(`O PDF possui ${document.numPages} páginas. O limite atual é ${MAX_PAGES}.`);
    }

    const pages = [];
    let extractedCharacters = 0;
    let emptyPages = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      const text = joinTextItems(content.items);
      page.cleanup();
      extractedCharacters += text.length;
      if (extractedCharacters > MAX_CHARACTERS) {
        throw new Error('O conteúdo textual do PDF ultrapassa o limite de 2 milhões de caracteres.');
      }
      if (!text) emptyPages += 1;
      pages.push({ pageNumber, text });
    }

    return { pageCount: document.numPages, extractedCharacters, emptyPages, pages };
  } finally {
    await document.destroy();
  }
}

process.parentPort.on('message', async (event) => {
  try {
    const result = await parsePdf(event.data.filePath);
    process.parentPort.postMessage({ ok: true, result });
  } catch (error) {
    process.parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Não foi possível ler o PDF.',
    });
  }
});

