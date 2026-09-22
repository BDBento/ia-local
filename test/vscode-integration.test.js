'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildContinueConfig, buildConversationContext, syncProject } = require('../src/main/vscode-integration');

test('gera configuração Continue apontando somente para o Ollama local', () => {
  const yaml = buildContinueConfig([{ name: 'qwen2.5-coder:7b' }, { name: 'deepseek-r1:8b' }]);
  assert.match(yaml, /provider: ollama/);
  assert.match(yaml, /127\.0\.0\.1:11434/);
  assert.match(yaml, /deepseek-r1:8b/);
});

test('transforma conversa salva em regra de contexto', () => {
  const markdown = buildConversationContext({
    title: 'Projeto Alpha',
    messages: [{ role: 'user', content: 'Use SQLite' }, { role: 'assistant', content: 'Combinado' }],
  });
  assert.match(markdown, /name: Contexto salvo pelo Farol/);
  assert.match(markdown, /Use SQLite/);
});

test('sincroniza sem apagar recomendações existentes do VS Code', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'farol-vscode-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, '.vscode'));
  await fs.writeFile(path.join(directory, '.vscode', 'extensions.json'), JSON.stringify({ recommendations: ['editorconfig.editorconfig'] }));
  await syncProject({ projectPath: directory, models: [{ name: 'qwen3:8b' }], conversation: null });
  const extensions = JSON.parse(await fs.readFile(path.join(directory, '.vscode', 'extensions.json'), 'utf8'));
  assert.deepEqual(extensions.recommendations, ['editorconfig.editorconfig', 'Continue.continue']);
  assert.match(await fs.readFile(path.join(directory, '.continue', 'farol-config.yaml'), 'utf8'), /qwen3:8b/);
});
