'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chunkPages, createKnowledgeBase, normalizeText } = require('../src/main/knowledge-base');

test('normaliza acentos e divide páginas preservando a origem', () => {
  assert.equal(normalizeText('Segurança Cibernética'), 'seguranca cibernetica');
  const chunks = chunkPages([{ pageNumber: 7, text: 'Farol '.repeat(300) }]);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.pageNumber === 7));
  assert.ok(chunks.every((chunk) => chunk.content.length <= 1200));
});

test('importa, pesquisa, impede duplicidade e remove um documento', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'farol-knowledge-'));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const pdfPath = path.join(temporaryRoot, 'manual.pdf');
  await fs.writeFile(pdfPath, '%PDF-conteudo-de-teste');
  const base = createKnowledgeBase(path.join(temporaryRoot, 'library'), {
    parsePdf: async () => ({
      pageCount: 2,
      extractedCharacters: 95,
      emptyPages: 0,
      pages: [
        { pageNumber: 1, text: 'Introdução sem relação com a busca.' },
        { pageNumber: 2, text: 'A autenticação multifator aumenta a segurança das contas.' },
      ],
    }),
  });
  await base.load();
  const document = await base.importPdf(pdfPath);
  assert.equal(base.list().length, 1);
  const matches = await base.search('segurança autenticação multifator');
  assert.equal(matches[0].pageNumber, 2);
  assert.equal(matches[0].name, 'manual.pdf');
  await assert.rejects(base.importPdf(pdfPath), /já está na biblioteca/);
  await base.remove(document.id);
  assert.deepEqual(base.list(), []);
});

test('recusa documento sem camada de texto', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'farol-empty-pdf-'));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const pdfPath = path.join(temporaryRoot, 'scan.pdf');
  await fs.writeFile(pdfPath, '%PDF-scan');
  const base = createKnowledgeBase(path.join(temporaryRoot, 'library'), {
    parsePdf: async () => ({ pageCount: 1, extractedCharacters: 0, emptyPages: 1, pages: [{ pageNumber: 1, text: '' }] }),
  });
  await base.load();
  await assert.rejects(base.importPdf(pdfPath), /precisar de OCR/);
});
