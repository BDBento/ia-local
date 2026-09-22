'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'assistant', 'system'].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 50000),
    }))
    .filter((message) => message.content.trim())
    .slice(-200);
}

function publicSummary(item) {
  return {
    id: item.id,
    title: item.title,
    model: item.model,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    messageCount: item.messages.length,
  };
}

function createConversationStore(userDataPath) {
  const filePath = path.join(userDataPath, 'conversations.json');

  async function readAll() {
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function writeAll(items) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  }

  return {
    async list() {
      return (await readAll())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(publicSummary);
    },
    async get(id) {
      const item = (await readAll()).find((entry) => entry.id === String(id || ''));
      if (!item) throw new Error('Conversa salva não encontrada.');
      return item;
    },
    async save(input = {}) {
      const items = await readAll();
      const id = String(input.id || '').trim();
      const existing = items.find((entry) => entry.id === id);
      const now = new Date().toISOString();
      const messages = cleanMessages(input.messages);
      if (!messages.length) throw new Error('A conversa ainda não possui mensagens para salvar.');
      const title = String(input.title || existing?.title || '').trim().slice(0, 120);
      if (!title) throw new Error('Informe um nome para a conversa.');
      const item = {
        id: existing?.id || crypto.randomUUID(),
        title,
        model: String(input.model || existing?.model || '').trim().slice(0, 192),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        messages,
      };
      if (existing) Object.assign(existing, item);
      else items.push(item);
      await writeAll(items);
      return item;
    },
    async delete(id) {
      const items = await readAll();
      const next = items.filter((entry) => entry.id !== String(id || ''));
      if (next.length === items.length) throw new Error('Conversa salva não encontrada.');
      await writeAll(next);
      return { id };
    },
  };
}

module.exports = { cleanMessages, createConversationStore };
