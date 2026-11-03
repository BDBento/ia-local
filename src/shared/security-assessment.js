'use strict';

const ALLOWED_METHODS = new Set(['web', 'network', 'api', 'host']);
const ALLOWED_DEPTHS = new Set(['passive', 'standard']);
const DESTRUCTIVE_CONFIRMATION = 'AUTORIZO EXERCICIO DESTRUTIVO EM LABORATORIO';

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function validateTarget(value) {
  const target = cleanText(value, 253).toLowerCase();
  if (!target) throw new Error('Informe um alvo autorizado.');
  if (/^https?:\/\//.test(target)) {
    const url = new URL(target);
    if (url.username || url.password || !url.hostname) throw new Error('URL de alvo inválida.');
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  }
  const isHostname = /^(?=.{1,253}$)(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.test(target);
  const isIpv4 = target.split('.').length === 4 && target.split('.').every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  const isCidr = /^(\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12]\d|3[0-2])$/.test(target)
    && target.split('/')[0].split('.').every((part) => Number(part) <= 255);
  if (!isHostname && !isIpv4 && !isCidr) throw new Error('Use hostname, IPv4, CIDR ou URL válida.');
  return target;
}

function validateProgramUrl(value) {
  const raw = cleanText(value, 500);
  if (!raw) throw new Error('Informe a página oficial do programa de Bug Bounty.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A página do programa deve ser uma URL HTTPS válida.');
  return url.href;
}

function validateScope(value) {
  const entries = String(value || '').split(/[\n,]/).map((entry) => cleanText(entry, 253)).filter(Boolean);
  if (!entries.length) throw new Error('Informe ao menos um domínio ou endereço permitido para acesso externo.');
  if (entries.length > 50) throw new Error('O escopo externo aceita no máximo 50 entradas.');
  return entries.map((entry) => {
    if (entry.startsWith('*.')) {
      const root = validateTarget(entry.slice(2));
      if (root === 'localhost' || /^\d/.test(root)) throw new Error(`Wildcard inválido: ${entry}`);
      return `*.${root}`;
    }
    return validateTarget(entry);
  });
}

function isPrivateLabTarget(target) {
  const hostname = /^https?:\/\//.test(target) ? new URL(target).hostname : target.split('/')[0];
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.test')) return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 127;
}

function createAssessmentPlan(input = {}) {
  if (input.authorized !== true) throw new Error('Confirme que você possui autorização para avaliar o alvo.');
  const target = validateTarget(input.target);
  const owner = cleanText(input.owner, 120);
  if (!owner) throw new Error('Informe o responsável pela autorização.');
  const method = ALLOWED_METHODS.has(input.method) ? input.method : 'web';
  const depth = ALLOWED_DEPTHS.has(input.depth) ? input.depth : 'passive';
  const excluded = cleanText(input.excluded, 500) || 'Nenhuma exclusão adicional informada';
  const engagement = ['bug-bounty', 'red-team'].includes(input.engagement) ? input.engagement : 'private';
  const externalAccess = input.externalAccess === true;
  if (engagement === 'bug-bounty' && !externalAccess) throw new Error('Bug Bounty requer autorização explícita de acesso externo.');
  const programUrl = engagement === 'bug-bounty' ? validateProgramUrl(input.programUrl) : '';
  const allowedTargets = externalAccess ? validateScope(input.allowedTargets || target) : [];
  const objective = engagement === 'red-team' ? cleanText(input.objective, 500) : '';
  const rulesOfEngagement = engagement === 'red-team' ? cleanText(input.rulesOfEngagement, 1500) : '';
  const stopConditions = engagement === 'red-team' ? cleanText(input.stopConditions, 1000) : '';
  const operationWindow = engagement === 'red-team' ? cleanText(input.operationWindow, 200) : '';
  const intensity = engagement === 'red-team' && ['standard', 'aggressive', 'destructive-lab'].includes(input.intensity)
    ? input.intensity : 'standard';
  const recoveryPlan = intensity === 'destructive-lab' ? cleanText(input.recoveryPlan, 1500) : '';
  if (engagement === 'red-team' && !objective) throw new Error('Defina o objetivo da simulação Red Team.');
  if (engagement === 'red-team' && !rulesOfEngagement) throw new Error('Informe as regras de engajamento aprovadas.');
  if (engagement === 'red-team' && !stopConditions) throw new Error('Defina condições claras de parada.');
  if (engagement === 'red-team' && !operationWindow) throw new Error('Informe a janela operacional autorizada.');
  if (intensity === 'destructive-lab') {
    if (externalAccess) throw new Error('O exercício destrutivo de laboratório não permite acesso externo.');
    if (!isPrivateLabTarget(target)) throw new Error('O exercício destrutivo só aceita localhost, domínio .local/.test ou rede IP privada.');
    if (input.isolatedLab !== true) throw new Error('Confirme que o laboratório está isolado e contém somente ativos próprios.');
    if (input.recoverableSnapshot !== true) throw new Error('Confirme que existe snapshot ou backup recuperável e testado.');
    if (!recoveryPlan) throw new Error('Descreva o plano de recuperação do laboratório.');
    if (String(input.destructiveConfirmation || '').trim() !== DESTRUCTIVE_CONFIRMATION) throw new Error('Digite a frase de confirmação destrutiva exatamente como exibida.');
  }
  const methodLabels = { web: 'Aplicação web (OWASP WSTG)', network: 'Rede e serviços', api: 'API (OWASP API Top 10)', host: 'Host local' };
  let phases = depth === 'passive'
    ? ['Validar escopo e evidências', 'Inventariar superfície sem exploração', 'Revisar configurações e exposição', 'Classificar achados e recomendar correções']
    : ['Validar escopo, janela e recuperação', 'Descoberta controlada e inventário', 'Testes não destrutivos com limites de taxa', 'Validação manual dos achados', 'Relatório, evidências e reteste'];
  if (engagement === 'red-team') {
    phases = ['Validar regras de engajamento', 'Mapear cenário ao MITRE ATT&CK', 'Emular técnicas autorizadas', 'Validar telemetria e resposta', 'Debrief, lacunas e plano de melhoria'];
  }

  return {
    target, owner, method, methodLabel: methodLabels[method], depth,
    depthLabel: depth === 'passive' ? 'Somente observação' : 'Padrão não destrutivo',
    excluded, phases, engagement, externalAccess, programUrl, allowedTargets,
    objective, rulesOfEngagement, stopConditions, operationWindow, intensity, recoveryPlan,
    prompt: [
      'Atue como analista de segurança defensiva e instrutor.',
      `Alvo formalmente autorizado: ${target}.`,
      `Responsável pela autorização: ${owner}.`,
      `Metodologia: ${methodLabels[method]}. Profundidade: ${depth === 'passive' ? 'somente observação' : 'testes não destrutivos'}.`,
      `Fora do escopo: ${excluded}.`,
      engagement === 'bug-bounty' ? `Programa de Bug Bounty e regras oficiais: ${programUrl}.` : `Modalidade: ${engagement === 'red-team' ? 'simulação Red Team autorizada' : 'avaliação privada autorizada'}.`,
      externalAccess ? `Acesso externo autorizado exclusivamente para: ${allowedTargets.join(', ')}.` : 'Acesso externo não autorizado nesta sessão.',
      engagement === 'red-team' ? `Objetivo aprovado: ${objective}.` : '',
      engagement === 'red-team' ? `Regras de engajamento: ${rulesOfEngagement}.` : '',
      engagement === 'red-team' ? `Janela operacional: ${operationWindow}. Condições de parada: ${stopConditions}.` : '',
      intensity === 'aggressive' ? 'Intensidade: agressiva autorizada, com maior cobertura e frequência, mas sem indisponibilidade, destruição ou evasão dos controles definidos.' : '',
      intensity === 'destructive-lab' ? `Intensidade: exercício destrutivo em laboratório isolado. Plano de recuperação: ${recoveryPlan}. Qualquer ação destrutiva exige nova confirmação humana individual antes da execução.` : '',
      'Antes de sugerir qualquer comando, explique objetivo, risco, impacto esperado e como reverter.',
      intensity === 'destructive-lab'
        ? 'Ações destrutivas ficam limitadas aos ativos sintéticos do laboratório declarado. Não acesse terceiros, não use dados reais e não ultrapasse o escopo.'
        : 'Não proponha persistência, evasão, indisponibilidade, exfiltração, phishing ou acesso a terceiros.',
      engagement === 'red-team' ? 'Mapeie a simulação ao MITRE ATT&CK, mas use somente técnicas expressamente permitidas nas regras de engajamento. Simule coleta e exfiltração com dados sintéticos.' : '',
      'Use limites de taxa conservadores. Pare diante de ambiguidade de escopo, dados sensíveis ou impacto inesperado.',
      'Comece apresentando o plano por fases, os pré-requisitos e uma checklist de evidências. Não execute nada automaticamente.',
    ].filter(Boolean).join('\n'),
  };
}

module.exports = { DESTRUCTIVE_CONFIRMATION, createAssessmentPlan, isPrivateLabTarget, validateProgramUrl, validateScope, validateTarget };
