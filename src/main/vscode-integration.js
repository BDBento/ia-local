'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function buildContinueConfig(models) {
  const installed = Array.isArray(models) ? models : [];
  const lines = ['name: Farol IA Local', 'version: 1.0.0', 'schema: v1', 'models:'];
  for (const item of installed) {
    const model = String(item.name || '').trim();
    if (!model) continue;
    lines.push(`  - name: ${yamlString(`Farol · ${model}`)}`);
    lines.push('    provider: ollama');
    lines.push(`    model: ${yamlString(model)}`);
    lines.push('    apiBase: http://127.0.0.1:11434');
    lines.push('    roles:');
    lines.push('      - chat');
    lines.push('      - edit');
    if (/coder.*(?:1\.5b|3b)|qwen2\.5-coder:1\.5b/i.test(model)) lines.push('      - autocomplete');
  }
  if (!installed.length) return 'name: Farol IA Local\nversion: 1.0.0\nschema: v1\nmodels: []\n';
  return `${lines.join('\n')}\n`;
}

function buildConversationContext(conversation) {
  if (!conversation) return null;
  const body = (conversation.messages || []).slice(-40).map((message) => {
    const label = message.role === 'user' ? 'Usuário' : message.role === 'assistant' ? 'Assistente' : 'Sistema';
    return `## ${label}\n\n${String(message.content || '').trim()}`;
  }).join('\n\n').slice(-40000);
  return `---\nname: Contexto salvo pelo Farol\nalwaysApply: true\n---\n\n# ${conversation.title}\n\nUse esta conversa como contexto histórico do projeto. Confirme informações que possam ter mudado.\n\n${body}\n`;
}

async function syncProject({ projectPath, models, conversation }) {
  const root = path.resolve(String(projectPath || ''));
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('A pasta de projeto selecionada não é válida.');
  const continueDir = path.join(root, '.continue');
  const rulesDir = path.join(continueDir, 'rules');
  const vscodeDir = path.join(root, '.vscode');
  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(vscodeDir, { recursive: true });
  await fs.writeFile(path.join(continueDir, 'farol-config.yaml'), buildContinueConfig(models), 'utf8');
  const context = buildConversationContext(conversation);
  if (context) await fs.writeFile(path.join(rulesDir, '90-farol-context.md'), context, 'utf8');
  const extensionsPath = path.join(vscodeDir, 'extensions.json');
  let extensions = { recommendations: [] };
  try { extensions = JSON.parse(await fs.readFile(extensionsPath, 'utf8')); } catch {}
  const recommendations = new Set(Array.isArray(extensions.recommendations) ? extensions.recommendations : []);
  recommendations.add('Continue.continue');
  await fs.writeFile(extensionsPath, `${JSON.stringify({ ...extensions, recommendations: [...recommendations] }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(continueDir, 'FAROL-VSCODE.md'), [
    '# Farol no VS Code',
    '',
    '## Como abrir seu assistente local',
    '',
    '1. Procure o ícone de assistente na barra lateral do VS Code e clique nele.',
    '2. No seletor de modelos, escolha um nome iniciado por **Farol ·**.',
    '3. Escreva uma pergunta para testar. Exemplo: `Responda somente: FAROL LOCAL OK`.',
    '4. Para editar arquivos ou usar o terminal, selecione o modo **Agent** e confira cada autorização.',
    '',
    '## Se os modelos Farol não aparecerem',
    '',
    '1. Pressione `Ctrl+Shift+P` e execute **Developer: Reload Window**.',
    '2. Verifique se o Ollama está aberto.',
    '3. Aceite a instalação recomendada da extensão Continue. Ela é o componente usado pelo Farol para conversar dentro do VS Code.',
    '4. Se você já possuía uma configuração do Continue, abra **Local Config** e copie os modelos de `.continue/farol-config.yaml`.',
    '',
    'O contexto sincronizado é carregado automaticamente de `.continue/rules/90-farol-context.md`, quando esse arquivo existir.',
  ].join('\n'), 'utf8');
  return { projectPath: root, modelCount: models.length, contextExported: Boolean(context) };
}

async function findVsCodeExecutable(environment = process.env) {
  const candidates = [
    environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    environment.ProgramFiles && path.join(environment.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
    environment['ProgramFiles(x86)'] && path.join(environment['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error('VS Code não encontrado. Instale-o ou use a sincronização manual.');
}

async function detectContinueExtension(executable, executor = execFileAsync) {
  try {
    const { stdout } = await executor(executable, ['--list-extensions'], {
      timeout: 30 * 1000,
      windowsHide: true,
      encoding: 'utf8',
    });
    return String(stdout).split(/\r?\n/).some((item) => item.trim().toLowerCase() === 'continue.continue');
  } catch {
    return false;
  }
}

async function setupVsCode({ projectPath, models, conversation, environment }) {
  const synced = await syncProject({ projectPath, models, conversation });
  const runtimeEnvironment = environment || process.env;
  const executable = await findVsCodeExecutable(runtimeEnvironment);
  let continueConfigInstalled = false;
  const userProfile = runtimeEnvironment.USERPROFILE;
  if (userProfile) {
    const globalContinueDir = path.join(userProfile, '.continue');
    const globalConfigPath = path.join(globalContinueDir, 'config.yaml');
    try {
      await fs.access(globalConfigPath);
    } catch {
      await fs.mkdir(globalContinueDir, { recursive: true });
      await fs.writeFile(globalConfigPath, buildContinueConfig(models), { encoding: 'utf8', flag: 'wx' });
      continueConfigInstalled = true;
    }
  }
  const extensionInstalled = await detectContinueExtension(executable);
  const guidePath = path.join(synced.projectPath, '.continue', 'FAROL-VSCODE.md');
  execFile(executable, [synced.projectPath, guidePath], { windowsHide: true }, () => {});
  return {
    ...synced,
    extensionInstalled,
    extensionInstallAttempted: false,
    continueConfigInstalled,
    vscodeOpened: true,
  };
}

module.exports = { buildContinueConfig, buildConversationContext, detectContinueExtension, findVsCodeExecutable, setupVsCode, syncProject };
