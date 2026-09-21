'use strict';

const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

async function localFetch(pathname, options = {}) {
  if (!pathname.startsWith('/api/')) {
    throw new Error('Endpoint local inválido.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    return await fetch(`${OLLAMA_BASE_URL}${pathname}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
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

module.exports = { OLLAMA_BASE_URL, chat, getStatus, listInstalledModels };
