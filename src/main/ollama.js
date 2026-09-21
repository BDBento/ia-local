'use strict';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

function validateModelName(value) {
  const name = String(value || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}(?::[a-zA-Z0-9][a-zA-Z0-9._-]{0,63})?$/.test(name)) {
    throw new Error('Nome de modelo inválido. Use letras, números, ponto, hífen, barra e uma tag opcional.');
  }
  return name;
}

async function localFetch(pathname, options = {}) {
  if (!pathname.startsWith('/api/')) {
    throw new Error('Endpoint local inválido.');
  }

  const controller = new AbortController();
  const { timeoutMs = 8000, headers = {}, ...fetchOptions } = options;
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(`${OLLAMA_BASE_URL}${pathname}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.body && !headers['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function consumeJsonStream(response, onProgress = () => {}) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 400) || `Ollama respondeu com HTTP ${response.status}.`);
  }

  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const update = JSON.parse(line);
      if (update.error) throw new Error(update.error);
      onProgress(update);
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const update = JSON.parse(buffer);
    if (update.error) throw new Error(update.error);
    onProgress(update);
  }
}

async function getStatus() {
  try {
    const response = await localFetch('/api/version', { timeoutMs: 2000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { available: true, version: data.version || 'desconhecida' };
  } catch {
    return { available: false, version: null };
  }
}

async function listInstalledModels() {
  const response = await localFetch('/api/tags', { timeoutMs: 5000 });
  if (!response.ok) throw new Error('Não foi possível consultar os modelos locais.');
  const data = await response.json();
  return (data.models || []).map((model) => ({
    name: model.name,
    size: model.size,
    modifiedAt: model.modified_at,
  }));
}

async function pullModel(model, onProgress) {
  const safeModel = validateModelName(model);
  const response = await localFetch('/api/pull', {
    method: 'POST',
    timeoutMs: 0,
    body: JSON.stringify({ model: safeModel, stream: true }),
  });
  await consumeJsonStream(response, onProgress);
  return { model: safeModel };
}

async function deleteModel(model) {
  const safeModel = validateModelName(model);
  const installed = await listInstalledModels();
  if (!installed.some((item) => item.name === safeModel)) {
    throw new Error('Esse modelo não está instalado localmente.');
  }
  const response = await localFetch('/api/delete', {
    method: 'DELETE',
    timeoutMs: 30000,
    body: JSON.stringify({ model: safeModel }),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 300) || 'Não foi possível excluir o modelo.');
  return { model: safeModel };
}

async function createCustomModel(input, onProgress) {
  const model = validateModelName(input.model);
  const base = validateModelName(input.base);
  const installed = await listInstalledModels();
  if (!installed.some((item) => item.name === base)) {
    throw new Error('O modelo-base precisa estar instalado localmente.');
  }
  if (installed.some((item) => item.name === model)) {
    throw new Error('Já existe um modelo local com esse nome.');
  }

  const system = String(input.system || '').trim().slice(0, 20000);
  if (!system) throw new Error('Escreva uma instrução de sistema para o novo modelo.');
  const temperature = Math.min(2, Math.max(0, Number(input.temperature) || 0.7));
  const messages = [];
  const exampleUser = String(input.exampleUser || '').trim().slice(0, 10000);
  const exampleAssistant = String(input.exampleAssistant || '').trim().slice(0, 10000);
  if (exampleUser && exampleAssistant) {
    messages.push({ role: 'user', content: exampleUser });
    messages.push({ role: 'assistant', content: exampleAssistant });
  }

  const response = await localFetch('/api/create', {
    method: 'POST',
    timeoutMs: 0,
    body: JSON.stringify({
      model,
      from: base,
      system,
      parameters: { temperature },
      ...(messages.length ? { messages } : {}),
      stream: true,
    }),
  });
  await consumeJsonStream(response, onProgress);
  return { model };
}

async function chat({ model, messages, settings }) {
  const installed = await listInstalledModels();
  if (!installed.some((item) => item.name === model)) {
    throw new Error('O modelo selecionado não está instalado localmente.');
  }

  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-40)
    .filter((message) => ['user', 'assistant', 'system'].includes(message.role))
    .map((message) => ({ role: message.role, content: String(message.content).slice(0, 50000) }));

  const options = {
    num_ctx: settings.contextSize,
    num_thread: settings.cpuThreads,
    main_gpu: settings.gpuId,
  };
  if (!settings.useGpu) options.num_gpu = 0;

  const response = await localFetch('/api/chat', {
    method: 'POST',
    timeoutMs: 10 * 60 * 1000,
    body: JSON.stringify({
      model,
      messages: safeMessages,
      stream: false,
      keep_alive: `${settings.keepAliveMinutes}m`,
      options,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama respondeu com erro: ${detail.slice(0, 300)}`);
  }
  const data = await response.json();
  return {
    content: data.message?.content || '',
    metrics: {
      totalDuration: data.total_duration || 0,
      evalCount: data.eval_count || 0,
      evalDuration: data.eval_duration || 0,
    },
  };
}

module.exports = {
  OLLAMA_BASE_URL,
  chat,
  createCustomModel,
  deleteModel,
  getStatus,
  listInstalledModels,
  pullModel,
  validateModelName,
};
