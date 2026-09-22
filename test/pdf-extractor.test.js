'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { extractPdf } = require('../src/main/pdf-extractor');

function createMinimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

test('extrai texto e número da página de um PDF real', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'farol-pdf-parser-'));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const pdfPath = path.join(temporaryRoot, 'valid.pdf');
  await fs.writeFile(pdfPath, createMinimalPdf('Conhecimento local Farol'));
  const result = await extractPdf(pdfPath);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages[0].pageNumber, 1);
  assert.match(result.pages[0].text, /Conhecimento local Farol/);
});
