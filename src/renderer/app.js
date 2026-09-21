'use strict';

const state = {
  config: null,
  hardware: null,
  ollama: null,
  recommendations: [],
  messages: [],
};

const byId = (id) => document.getElementById(id);
const pageTitles = { chat: 'Conversa local', models: 'Modelos recomendados', settings: 'Configurações' };

function setBeacon(mode) {
  const beacon = byId('privacy-beacon');
  beacon.className = `privacy-beacon ${mode}`;
  byId('beacon-label').textContent = mode === 'offline'
    ? 'Offline protegido'
    : mode === 'online'
      ? 'Internet permitida'
      : 'Verificando';
}

function switchView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  byId(`view-${name}`).classList.add('active');
  byId('page-title').textContent = pageTitles[name];
}

function renderHardware() {
  const hardware = state.hardware;
  const gpu = hardware.gpus[Number(state.config.gpuId)] || hardware.gpus[0];
  const items = [
    ['Processador', `${hardware.cpu.name} · ${hardware.cpu.logicalThreads} threads`],
    ['Memória', `${hardware.memory.totalGB} GB total · ${hardware.memory.freeGB} GB livre`],
    ['GPU', gpu ? `${gpu.name}${gpu.vramGB ? ` · ${gpu.vramGB} GB` : ''}` : 'Nenhuma GPU dedicada detectada'],
  ];
  byId('hardware-summary').innerHTML = items.map(([label, value]) => `<div class="hardware-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  const gpuSelect = byId('gpu-id');
  gpuSelect.innerHTML = hardware.gpus.length
    ? hardware.gpus.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')
    : '<option value="0">Nenhuma GPU detectada</option>';
  gpuSelect.value = String(state.config.gpuId);
}

function renderModels() {
  byId('model-grid').innerHTML = state.recommendations.map((model) => `
    <article class="model-card">
      <h3>${escapeHtml(model.name)}</h3>
      <p>${escapeHtml(model.purpose)}</p>
      <div class="model-meta"><span>${model.sizeGB} GB no disco</span><span>${model.recommendedRamGB} GB RAM recomendada</span></div>
      <span class="compatibility ${model.level}">${escapeHtml(model.label)}</span>
      <small class="reason">${escapeHtml(model.reason)}</small>
    </article>
  `).join('');
}

function renderOllama() {
  const status = byId('ollama-sidebar-status');
  const select = byId('chat-model');
  const installed = state.ollama.installedModels || [];
  status.textContent = state.ollama.available ? `Ollama ${state.ollama.version}` : 'Ollama indisponível';
  status.style.color = state.ollama.available ? 'var(--green)' : 'var(--yellow)';
  select.innerHTML = installed.length
    ? installed.map((model) => `<option value="${escapeHtml(model.name)}">${escapeHtml(model.name)}</option>`).join('')
    : '<option value="">Nenhum modelo instalado</option>';
  byId('send-button').disabled = !installed.length;
  byId('chat-hint').textContent = installed.length
    ? `${installed.length} modelo(s) local(is) disponível(is)`
    : state.ollama.available ? 'Instale um modelo no Ollama' : 'Inicie o Ollama para conversar';
}

function fillSettings() {
  const config = state.config;
  byId('offline-strict').checked = config.offlineStrict;
  byId('ram-limit').value = config.ramLimitGB;
  byId('vram-limit').value = config.vramLimitGB;
  byId('cpu-threads').value = config.cpuThreads;
  byId('context-size').value = String(config.contextSize);
  byId('keep-alive').value = String(config.keepAliveMinutes);
  byId('use-gpu').checked = config.useGpu;
  document.querySelectorAll('[data-profile]').forEach((button) => button.classList.toggle('active', button.dataset.profile === config.profile));
}

function renderMessages() {
  const container = byId('messages');
  if (!state.messages.length) return;
  container.innerHTML = state.messages.map((message) => `<div class="message ${message.role}">${escapeHtml(message.content)}</div>`).join('');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value);
  return element.innerHTML;
}

function readSettings() {
  return {
    offlineStrict: byId('offline-strict').checked,
    profile: document.querySelector('[data-profile].active')?.dataset.profile || 'balanced',
    ramLimitGB: Number(byId('ram-limit').value),
    vramLimitGB: Number(byId('vram-limit').value),
    useGpu: byId('use-gpu').checked,
    gpuId: Number(byId('gpu-id').value),
    cpuThreads: Number(byId('cpu-threads').value),
    contextSize: Number(byId('context-size').value),
    keepAliveMinutes: Number(byId('keep-alive').value),
  };
}

function applyProfile(profile) {
  const totalRam = state.hardware.memory.totalGB;
  const gpu = state.hardware.gpus[Number(byId('gpu-id').value)] || state.hardware.gpus[0];
  const vram = gpu?.vramGB || 0;
  const threads = state.hardware.cpu.logicalThreads;
  const values = {
    eco: { ram: Math.max(2, Math.floor(totalRam * 0.4)), vram: Math.max(0, Math.floor(vram * 0.5)), threads: Math.max(1, Math.floor(threads * 0.35)), context: 2048 },
    balanced: { ram: Math.max(2, Math.floor(totalRam * 0.65)), vram: Math.max(0, Math.floor(vram * 0.8)), threads: Math.max(1, Math.floor(threads * 0.6)), context: 4096 },
    performance: { ram: Math.max(2, Math.floor(totalRam * 0.82)), vram: Math.max(0, Math.floor(vram * 0.95)), threads: Math.max(1, Math.floor(threads * 0.85)), context: 8192 },
  }[profile];
  byId('ram-limit').value = values.ram;
  byId('vram-limit').value = values.vram;
  byId('cpu-threads').value = values.threads;
  byId('context-size').value = String(values.context);
  document.querySelectorAll('[data-profile]').forEach((button) => button.classList.toggle('active', button.dataset.profile === profile));
}

async function refreshState() {
  setBeacon('checking');
  const next = await window.farolIA.refreshOllama();
  Object.assign(state, next);
  setBeacon(state.config.offlineStrict ? 'offline' : 'online');
  renderHardware();
  renderModels();
  renderOllama();
  fillSettings();
}

document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
byId('privacy-beacon').addEventListener('click', () => switchView('settings'));
byId('refresh-models').addEventListener('click', refreshState);
byId('detect-hardware').addEventListener('click', refreshState);

document.querySelectorAll('[data-profile]').forEach((button) => button.addEventListener('click', () => applyProfile(button.dataset.profile)));

byId('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  byId('save-status').textContent = 'Salvando...';
  const result = await window.farolIA.saveSettings(readSettings());
  state.config = result.config;
  state.recommendations = result.recommendations;
  fillSettings();
  renderModels();
  setBeacon(state.config.offlineStrict ? 'offline' : 'online');
  byId('save-status').textContent = 'Configurações salvas';
  setTimeout(() => { byId('save-status').textContent = ''; }, 2500);
});

byId('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = byId('chat-input');
  const content = input.value.trim();
  const model = byId('chat-model').value;
  if (!content || !model) return;

  state.messages.push({ role: 'user', content });
  input.value = '';
  renderMessages();
  byId('send-button').disabled = true;
  byId('chat-hint').textContent = 'A IA local está respondendo...';

  try {
    const result = await window.farolIA.sendChat({
      model,
      messages: state.messages.filter((message) => message.role !== 'error'),
    });
    state.messages.push({ role: 'assistant', content: result.content || 'Resposta vazia.' });
  } catch (error) {
    state.messages.push({ role: 'error', content: error.message || 'Não foi possível obter uma resposta local.' });
  } finally {
    renderMessages();
    byId('send-button').disabled = false;
    byId('chat-hint').textContent = 'Processamento local';
  }
});

window.farolIA.onNetworkPolicy(({ offlineStrict }) => setBeacon(offlineStrict ? 'offline' : 'online'));

(async () => {
  try {
    Object.assign(state, await window.farolIA.getInitialState());
    setBeacon(state.config.offlineStrict ? 'offline' : 'online');
    renderHardware();
    renderModels();
    renderOllama();
    fillSettings();
  } catch (error) {
    setBeacon('online');
    byId('ollama-sidebar-status').textContent = 'Falha ao iniciar';
    console.error(error);
  }
})();
