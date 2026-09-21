'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_CHUNK_CHARACTERS = 1200;
const CHUNK_OVERLAP_CHARACTERS = 200;
const MAX_CHUNKS_PER_DOCUMENT = 1500;
const MAX_CONTEXT_CHARACTERS = 12_000;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((term) => term.length >= 3))];
}

function chunkPages(pages) {
  const chunks = [];
  for (const page of pages) {
    const text = String(page.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let start = 0;
    while (start < text.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
      let end = Math.min(text.length, start + MAX_CHUNK_CHARACTERS);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
        if (boundary > start + Math.floor(MAX_CHUNK_CHARACTERS * 0.55)) end = boundary + 1;
      }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ pageNumber: page.pageNumber, content });
      if (end >= text.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARACTERS);
    }
  }
  return chunks;
}

function scoreChunk(query, terms, content) {
  const normalized = normalizeText(content);
  if (!normalized) return 0;
  let score = 0;
  for (const term of terms) {
    const matches = normalized.match(new RegExp(`\\b${term}\\b`, 'g'));
    if (matches) score += Math.min(matches.length, 5) * (term.length >= 7 ? 3 : 2);
  }
  const phrase = normalizeText(query);
  if (phrase.length >= 8 && normalized.includes(phrase)) score += 12;
  return score;
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

function createKnowledgeBase(rootPath, { parsePdf }) {
  if (typeof parsePdf !== 'function') throw new TypeError('O parser de PDF é obrigatório.');
  const indexPath = path.join(rootPath, 'index.json');
  const documentsPath = path.join(rootPath, 'documents');
  let documents = [];
  let busy = false;

  async function load() {
    try {
      const saved = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      documents = Array.isArray(saved.documents) ? saved.documents : [];
    } catch {
      documents = [];
    }
    return list();
  }

  function list() {
    return documents.map((document) => ({ ...document }));
  }

  async function importPdf(filePath) {
    if (busy) throw new Error('Já existe um PDF sendo processado.');
    busy = true;
    try {
      const bytes = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (documents.some((document) => document.hash === hash)) {
        throw new Error('Este PDF já está na biblioteca.');
      }
      const parsed = await parsePdf(filePath);
      const chunks = chunkPages(parsed.pages);
      if (!chunks.length) {
        throw new Error('Nenhum texto foi encontrado. O PDF pode ser escaneado e precisar de OCR.');
      }

      const id = crypto.randomUUID();
      const document = {
        id,
        name: path.basename(filePath).slice(0, 240),
        hash,
        pageCount: parsed.pageCount,
        chunkCount: chunks.length,
        extractedCharacters: parsed.extractedCharacters,
        emptyPages: parsed.emptyPages,
        importedAt: new Date().toISOString(),
      };
      await atomicWriteJson(path.join(documentsPath, `${id}.json`), { document, chunks });
      documents.push(document);
      await atomicWriteJson(indexPath, { version: 1, documents });
      return { ...document };
    } finally {
      busy = false;
    }
  }

  async function remove(id) {
    const safeId = String(id || '');
    if (!/^[0-9a-f-]{36}$/i.test(safeId)) throw new Error('Documento inválido.');
    const existing = documents.find((document) => document.id === safeId);
    if (!existing) throw new Error('Documento não encontrado.');
    await fs.rm(path.join(documentsPath, `${safeId}.json`), { force: true });
    documents = documents.filter((document) => document.id !== safeId);
    await atomicWriteJson(indexPath, { version: 1, documents });
    return { id: safeId };
  }

  async function search(query, limit = 5) {
    const terms = tokenize(query);
    if (!terms.length || !documents.length) return [];
    const candidates = [];
    for (const document of documents) {
      try {
        const stored = JSON.parse(await fs.readFile(path.join(documentsPath, `${document.id}.json`), 'utf8'));
        for (const chunk of stored.chunks || []) {
          const score = scoreChunk(query, terms, chunk.content);
          if (score > 0) candidates.push({
            documentId: document.id,
            name: document.name,
            pageNumber: chunk.pageNumber,
            content: chunk.content,
            score,
          });
        }
      } catch {
        // Um documento corrompido não impede o uso dos demais.
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    const selected = [];
    let contextCharacters = 0;
    for (const candidate of candidates) {
      if (selected.length >= limit || contextCharacters + candidate.content.length > MAX_CONTEXT_CHARACTERS) break;
      selected.push(candidate);
      contextCharacters += candidate.content.length;
    }
    return selected;
  }

  return { importPdf, list, load, remove, search };
}

module.exports = {
  CHUNK_OVERLAP_CHARACTERS,
  MAX_CHUNK_CHARACTERS,
  chunkPages,
  createKnowledgeBase,
  normalizeText,
  scoreChunk,
  tokenize,
};

