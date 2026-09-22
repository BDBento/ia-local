'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cleanMessages, createConversationStore } = require('../src/main/conversation-store');

test('salva somente mensagens úteis para contexto futuro', () => {
  assert.deepEqual(cleanMessages([
    { role: 'user', content: 'pergunta' },
    { role: 'tool', content: 'segredo do terminal' },
    { role: 'error', content: 'falha' },
    { role: 'assistant', content: 'resposta' },
  ]), [
    { role: 'user', content: 'pergunta' },
    { role: 'assistant', content: 'resposta' },
  ]);
});

test('preserva fontes locais com valores limitados e normalizados', () => {
  const [message] = cleanMessages([{
    role: 'assistant',
    content: 'resposta baseada no documento',
    sources: [{ documentId: 'abc', name: 'manual.pdf', pageNumber: '7' }],
  }]);
  assert.deepEqual(message.sources, [{
    documentId: 'abc',
    name: 'manual.pdf',
    pageNumber: 7,
  }]);
});

test('cria, atualiza, lista, abre e exclui uma conversa local', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'farol-conversations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createConversationStore(directory);
  const created = await store.save({
    title: 'Projeto futuro',
    model: 'deepseek-r1:8b',
    messages: [{ role: 'user', content: 'contexto' }],
  });
  assert.equal((await store.list())[0].title, 'Projeto futuro');
  assert.equal((await store.get(created.id)).messages[0].content, 'contexto');
  await store.save({ ...created, title: 'Projeto atualizado', messages: created.messages });
  assert.equal((await store.get(created.id)).title, 'Projeto atualizado');
  await store.delete(created.id);
  assert.deepEqual(await store.list(), []);
});
