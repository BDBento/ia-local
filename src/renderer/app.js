'use strict';

const state = {
  config: null,
  hardware: null,
  ollama: null,
  recommendations: [],
  messages: [],
  externalAccess: false,
  guardian: null,
  authorizations: [],
};

const byId = (id) => document.getElementById(id);
const pageTitles = { chat: 'Conversa local', models: 'Gerenciar modelos', training: 'Laboratório', settings: 'Configurações' };
pageTitles.guardian = 'Guardião de rede';

function setBeacon(mode, customLabel = '') {
  const beacon = byId('privacy-beacon');
  beacon.className = `privacy-beacon ${mode}`;
  byId('beacon-label').textContent = customLabel || (mode === 'offline'
    ? 'Offline protegido'
    : mode === 'online'
      ? 'Internet permitida'
      : 'Verificando');
}

function syncBeacon() {
  const activity = state.networkActivity || {};
  state.externalAccess = Boolean(activity.externalAccess);
  if (state.externalAccess) {
    setBeacon('online', activity.label || 'Internet em uso');
  } else {
    setBeacon(state.config.offlineStrict ? 'offline' : 'online');
  }
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

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return 'Tamanho não informado';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** unit)).toFixed(unit > 2 ? 1 : 0)} ${units[unit]}`;
}

function renderInstalledModels() {
  const installed = state.ollama.installedModels || [];
  const container = byId('installed-models');
  container.innerHTML = installed.length
    ? installed.map((model) => `
      <div class="installed-item">
        <div><strong>${escapeHtml(model.name)}</strong><small>${formatBytes(model.size)} · armazenado localmente</small></div>
        <button class="danger-button" type="button" data-delete-model="${escapeHtml(model.name)}">Excluir</button>
      </div>
    `).join('')
    : '<div class="installed-empty">Nenhum modelo local encontrado.</div>';

  const trainingBase = byId('training-base');
  trainingBase.innerHTML = installed.length
    ? installed.map((model) => `<option value="${escapeHtml(model.name)}">${escapeHtml(model.name)}</option>`).join('')
    : '<option value="">Nenhum modelo instalado</option>';

  document.querySelectorAll('[data-delete-model]').forEach((button) => {
    button.addEventListener('click', () => removeModel(button.dataset.deleteModel));
  });
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
  renderInstalledModels();
}

function renderGuardian() {
  const guardian = state.guardian;
  if (!guardian) return;
  const enforcement = guardian.policy?.enforcement || 'unavailable';
  const active = enforcement === 'active';
  const diagnostic = enforcement === 'diagnostic-only';
  byId('guardian-light').className = `guardian-light ${active ? 'ready' : 'blocked'}`;
  byId('guardian-title').textContent = active ? 'Proteção ativa' : diagnostic ? 'Diagnóstico concluído' : 'Guardião indisponível';
  byId('guardian-message').textContent = guardian.message;
  byId('guardian-default-policy').textContent = 'Negar rede';
  byId('guardian-terminal').textContent = state.config?.terminalToolsEnabled
    ? 'Manual com confirmação'
    : guardian.policy?.terminalEnabled ? 'Disponível' : 'Bloqueado';
  byId('guardian-external').textContent = guardian.policy?.externalAccess ? 'Autorizado' : 'Bloqueado';
  byId('guardian-wfp').textContent = guardian.capabilities?.wfpAvailable ? 'Disponível' : 'Indisponível';
  byId('guardian-wfp-engine').textContent = guardian.capabilities?.wfpEngineAccessible ? 'Acessível' : 'Sem acesso';
  byId('guardian-cleanup').textContent = guardian.capabilities?.dynamicSessionCleanup ? 'Disponível no WFP' : 'Indisponível';
  byId('guardian-management-api').textContent = guardian.capabilities?.wfpManagementApiAvailable ? 'Completa' : 'Incompleta';
  byId('guardian-service').textContent = guardian.capabilities?.enforcerReadyForInstallation
    ? 'Pronto para instalar'
    : guardian.capabilities?.serviceHostAvailable ? 'Preparado · não instalado' : 'Indisponível';
  byId('guardian-installer').textContent = guardian.capabilities?.serviceInstallerAvailable ? 'Preparado · travado' : 'Indisponível';
  byId('guardian-emergency-remove').textContent = guardian.capabilities?.emergencyRemovalAvailable ? 'Disponível' : 'Indisponível';
  byId('guardian-filter-state').textContent = guardian.policy?.filterState === 'active' ? 'Ativos' : 'Não instalados';
  byId('guardian-authorization-mode').textContent = 'Obrigatória';
  byId('guardian-sandbox').textContent = guardian.capabilities?.sandboxApiAvailable ? 'Disponível' : 'Não disponível';
  byId('guardian-elevated').textContent = guardian.elevated ? 'Sim' : 'Não';
  byId('guardian-build').textContent = guardian.windowsBuild || '—';
}

function renderAuthorizations() {
  const container = byId('authorization-history');
  if (!container) return;
  const labels = {
    pending: 'Aguardando decisão',
    approved: 'Aprovada',
    denied: 'Negada',
    consumed: 'Utilizada',
    expired: 'Expirada',
  };
  container.innerHTML = state.authorizations.length
    ? state.authorizations.map((item) => `
      <div class="authorization-item">
        <div><strong>${escapeHtml(item.target)}</strong><small>${item.kind === 'terminal-command' ? 'Comando de terminal' : 'Download de modelo'} · ${new Date(item.createdAt).toLocaleString('pt-BR')}</small></div>
        <span class="authorization-status ${escapeHtml(item.status)}">${escapeHtml(labels[item.status] || item.status)}</span>
      </div>
    `).join('')
    : '<div class="installed-empty">Nenhuma solicitação registrada nesta sessão.</div>';
}

function askNetworkAuthorization(authorization) {
  const dialog = byId('network-auth-dialog');
  byId('network-auth-target').textContent = authorization.target;
  byId('network-auth-reason').textContent = authorization.reason;
  dialog.returnValue = 'deny';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'approve'), { once: true });
  });
}

async function refreshAuthorizations() {
  state.authorizations = await window.farolIA.getAuthorizations();
  renderAuthorizations();
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
  byId('terminal-tools-enabled').checked = config.terminalToolsEnabled === true;
  document.querySelectorAll('[data-profile]').forEach((button) => button.classList.toggle('active', button.dataset.profile === config.profile));
}

function renderMessages() {
  const container = byId('messages');
  if (!state.messages.length) return;
  container.innerHTML = state.messages
    .filter((message) => message.role !== 'tool' || message.visible)
    .map((message) => `<div class="message ${message.role}">${escapeHtml(message.content || 'Solicitação de ferramenta')}</div>`).join('');
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
    terminalToolsEnabled: byId('terminal-tools-enabled').checked,
  };
}

function askTerminalAuthorization({ command, cwd, reason }) {
  const dialog = byId('terminal-auth-dialog');
  byId('terminal-auth-command').textContent = command;
  byId('terminal-auth-cwd').textContent = cwd || 'Pasta pessoal do usuário';
  byId('terminal-auth-reason').textContent = reason || 'A IA solicitou este comando para concluir sua tarefa.';
  dialog.returnValue = 'deny';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'approve'), { once: true });
  });
}

function toolArguments(toolCall) {
  const value = toolCall?.function?.arguments;
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function runChatWithTools(model) {
  for (let round = 0; round < 4; round += 1) {
    const result = await window.farolIA.sendChat({
      model,
      messages: state.messages.filter((message) => message.role !== 'error'),
    });
    const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
    if (!toolCalls.length) {
      state.messages.push({ role: 'assistant', content: result.content || 'Resposta vazia.' });
      return;
    }

    state.messages.push({ role: 'assistant', content: result.content || '', tool_calls: toolCalls });
    for (const call of toolCalls) {
      if (call?.function?.name !== 'run_terminal') {
        state.messages.push({ role: 'tool', tool_name: call?.function?.name || 'unknown', content: 'Ferramenta desconhecida ou não permitida.' });
        continue;
      }
      const args = toolArguments(call);
      const command = String(args.command || '').trim();
      const request = await window.farolIA.requestAuthorization({
        kind: 'terminal-command',
        target: command,
        reason: String(args.reason || '').slice(0, 300),
      });
      const approved = await askTerminalAuthorization({ command, cwd: args.cwd, reason: request.reason });
      if (!approved) {
        await window.farolIA.decideAuthorization({ id: request.id, decision: 'deny' });
        state.messages.push({ role: 'tool', tool_name: 'run_terminal', content: 'Execução negada pelo usuário.' });
        continue;
      }
      const grant = await window.farolIA.decideAuthorization({ id: request.id, decision: 'approve' });
      const execution = await window.farolIA.executeTerminal({
        command,
        cwd: args.cwd,
        authorizationId: request.id,
        approvalToken: grant.approvalToken,
      });
      const output = [
        `Pasta: ${execution.cwd}`,
        `Código de saída: ${execution.exitCode}`,
        execution.stdout ? `Saída:\n${execution.stdout}` : '',
        execution.stderr ? `Erros:\n${execution.stderr}` : '',
      ].filter(Boolean).join('\n');
      state.messages.push({ role: 'tool', tool_name: 'run_terminal', content: output });
    }
  }
  throw new Error('A IA excedeu o limite de quatro rodadas de ferramentas.');
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

function updateOperation(update) {
  const box = byId('model-operation');
  box.classList.remove('hidden');
  const completed = Number(update.completed) || 0;
  const total = Number(update.total) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  byId('operation-label').textContent = update.kind === 'create' ? 'Criando modelo personalizado' : 'Baixando modelo';
  byId('operation-percent').textContent = total > 0 ? `${percent}%` : '...';
  byId('operation-progress').value = percent;
  byId('operation-detail').textContent = update.status || 'Processando...';
  if (update.kind === 'create') {
    byId('training-status').textContent = update.status || 'Criando modelo...';
  }
}

async function refreshState() {
  setBeacon('checking');
  const next = await window.farolIA.refreshOllama();
  Object.assign(state, next);
  renderHardware();
  renderModels();
  renderOllama();
  renderGuardian();
  fillSettings();
  syncBeacon();
}

async function removeModel(model) {
  if (!window.confirm(`Excluir o modelo local "${model}"? Esta ação libera o espaço ocupado no disco.`)) return;
  try {
    await window.farolIA.deleteModel(model);
    await refreshState();
  } catch (error) {
    window.alert(error.message || 'Não foi possível excluir o modelo.');
  }
}

document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
byId('privacy-beacon').addEventListener('click', () => switchView('settings'));
byId('refresh-models').addEventListener('click', refreshState);
byId('refresh-installed').addEventListener('click', refreshState);
byId('detect-hardware').addEventListener('click', refreshState);
byId('refresh-guardian').addEventListener('click', async () => {
  const button = byId('refresh-guardian');
  button.disabled = true;
  byId('guardian-title').textContent = 'Verificando...';
  try {
    state.guardian = await window.farolIA.getGuardianStatus();
    await refreshAuthorizations();
    renderGuardian();
  } catch (error) {
    byId('guardian-title').textContent = 'Falha segura';
    byId('guardian-message').textContent = error.message || 'Não foi possível consultar o Guardião.';
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-quick-model]').forEach((button) => {
  button.addEventListener('click', () => {
    byId('pull-model-name').value = button.dataset.quickModel;
    byId('pull-model-name').focus();
  });
});

byId('pull-model-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const model = byId('pull-model-name').value.trim();
  const button = byId('pull-model-button');
  if (!model) return;
  if (!state.ollama.available) {
    window.alert('Inicie o Ollama antes de baixar um modelo.');
    return;
  }
  button.disabled = true;
  byId('model-operation').classList.remove('hidden');
  byId('operation-label').textContent = 'Preparando download';
  byId('operation-detail').textContent = model;
  let authorization;
  try {
    authorization = await window.farolIA.requestAuthorization({
      kind: 'model-download',
      target: model,
      reason: 'Baixar um modelo por meio do Ollama requer acesso à internet.',
    });
    await refreshAuthorizations();
    const approved = await askNetworkAuthorization(authorization);

    if (!approved) {
      await window.farolIA.decideAuthorization({ id: authorization.id, decision: 'deny' });
      byId('operation-label').textContent = 'Download cancelado';
      byId('operation-detail').textContent = 'Acesso externo negado pelo usuário.';
      await refreshAuthorizations();
      return;
    }
    const grant = await window.farolIA.decideAuthorization({ id: authorization.id, decision: 'approve' });
    await window.farolIA.pullModel({
      model,
      authorizationId: authorization.id,
      approvalToken: grant.approvalToken,
    });
    byId('operation-label').textContent = 'Download concluído';
    byId('operation-percent').textContent = '100%';
    byId('operation-progress').value = 100;
    await refreshState();
  } catch (error) {
    byId('operation-label').textContent = 'Falha no download';
    byId('operation-detail').textContent = error.message || 'Não foi possível baixar o modelo.';
  } finally {
    button.disabled = false;
  }
});

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

byId('training-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = byId('training-submit');
  button.disabled = true;
  byId('training-status').textContent = 'Criando modelo local...';
  try {
    const result = await window.farolIA.createCustomModel({
      base: byId('training-base').value,
      model: byId('training-name').value.trim(),
      temperature: Number(byId('training-temperature').value),
      system: byId('training-system').value,
      exampleUser: byId('training-example-user').value,
      exampleAssistant: byId('training-example-assistant').value,
    });
    byId('training-status').textContent = `${result.model} criado com sucesso.`;
    await refreshState();
  } catch (error) {
    byId('training-status').textContent = error.message || 'Não foi possível criar o modelo.';
  } finally {
    button.disabled = false;
  }
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
    await runChatWithTools(model);
  } catch (error) {
    state.messages.push({ role: 'error', content: error.message || 'Não foi possível obter uma resposta local.' });
  } finally {
    renderMessages();
    byId('send-button').disabled = false;
    byId('chat-hint').textContent = 'Processamento local';
  }
});

window.farolIA.onNetworkPolicy(({ offlineStrict }) => {
  if (!state.externalAccess) setBeacon(offlineStrict ? 'offline' : 'online');
});
window.farolIA.onNetworkActivity(({ externalAccess, offlineStrict, label }) => {
  state.externalAccess = externalAccess;
  state.networkActivity = { externalAccess, label };
  if (externalAccess) {
    setBeacon('online', label || 'Internet em uso');
  } else {
    setBeacon(offlineStrict ? 'offline' : 'online');
  }
});
window.farolIA.onModelProgress(updateOperation);

(async () => {
  try {
    Object.assign(state, await window.farolIA.getInitialState());
    syncBeacon();
    renderHardware();
    renderModels();
    renderOllama();
    renderGuardian();
    await refreshAuthorizations();
    fillSettings();
  } catch (error) {
    setBeacon('online');
    byId('ollama-sidebar-status').textContent = 'Falha ao iniciar';
    console.error(error);
  }
})();
