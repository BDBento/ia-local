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
    '# Farol IA Local no VS Code',
    '',
    '1. O Farol tentou instalar a extensão Continue automaticamente. Se ela não aparecer, aceite a recomendação do VS Code.',
    '2. Abra o painel Continue. Em uma instalação nova, a configuração local já foi criada automaticamente.',
    '3. Se você já tinha uma configuração própria, ela foi preservada. Abra a engrenagem de Local Config e acrescente os modelos de `.continue/farol-config.yaml`.',
    '4. Mantenha o Ollama em execução em `127.0.0.1:11434`.',
    '',
    'O contexto sincronizado fica em `.continue/rules/90-farol-context.md` e é carregado pelo projeto.',
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
  let extensionInstalled = true;
  try {
    await execFileAsync(executable, ['--install-extension', 'Continue.continue', '--force'], {
      timeout: 2 * 60 * 1000,
      windowsHide: true,
    });
  } catch {
    extensionInstalled = false;
  }
  const guidePath = path.join(synced.projectPath, '.continue', 'FAROL-VSCODE.md');
  execFile(executable, [synced.projectPath, guidePath], { windowsHide: true }, () => {});
  return { ...synced, extensionInstalled, continueConfigInstalled, vscodeOpened: true };
}

module.exports = { buildContinueConfig, buildConversationContext, findVsCodeExecutable, setupVsCode, syncProject };
