'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssessmentPlan, isPrivateLabTarget, matchesAllowedTarget, validateScope, validateTarget } = require('../src/shared/security-assessment');

test('aceita apenas alvos bem formados', () => {
  assert.equal(validateTarget('192.168.1.0/24'), '192.168.1.0/24');
  assert.equal(validateTarget('https://app.exemplo.local/login'), 'https://app.exemplo.local/login');
  assert.throws(() => validateTarget('host; Remove-Item *'), /hostname, IPv4, IPv6, CIDR ou URL/);
  assert.throws(() => validateTarget('999.999.999.999'), /hostname/);
  assert.throws(() => validateTarget('192.168.1.17/24'), /canônico/);
  assert.equal(validateTarget('HTTPS://EXAMPLE.COM./MinhaRota'), 'https://example.com/MinhaRota');
  assert.equal(validateTarget('[0:0:0:0:0:0:0:1]'), '::1');
  assert.equal(isPrivateLabTarget('10.0.0.0/7'), false);
  assert.equal(isPrivateLabTarget('10.0.0.0/8'), true);
});

test('aplica limites de origem, porta e caminho sem ampliar o escopo', () => {
  const scope = validateScope('EXAMPLE.COM.,example.com,https://api.example.com:8443/V1,192.168.1.0/24');
  assert.equal(scope.length, 3);
  assert.equal(matchesAllowedTarget('https://example.com:8443', scope), false);
  assert.equal(matchesAllowedTarget('https://api.example.com:8443/V1/health', scope), true);
  assert.equal(matchesAllowedTarget('https://api.example.com:8443/V10', scope), false);
  assert.equal(matchesAllowedTarget('https://api.example.com:8443/v1', scope), false);
  assert.equal(matchesAllowedTarget('192.168.1.12', scope), true);
});

test('exige confirmação de autorização', () => {
  assert.throws(() => createAssessmentPlan({ target: 'localhost', owner: 'Equipe' }), /autorização/);
});

test('gera plano didático sem execução automática', () => {
  const plan = createAssessmentPlan({ target: 'localhost', owner: 'Laboratório local', method: 'web', depth: 'standard', authorized: true });
  assert.equal(plan.target, 'localhost');
  assert.equal(plan.phases.length, 5);
  assert.match(plan.prompt, /Não execute nada automaticamente/);
  assert.match(plan.prompt, /não destrutivos/i);
});

test('bug bounty exige regras oficiais e allowlist externa', () => {
  assert.throws(() => createAssessmentPlan({ target: 'example.com', owner: 'Pesquisador', engagement: 'bug-bounty', authorized: true }), /acesso externo/);
  const input = {
    target: 'example.com', owner: 'Pesquisador', method: 'web', depth: 'standard', authorized: true,
    engagement: 'bug-bounty', externalAccess: true, programUrl: 'https://hackerone.com/example',
    allowedTargets: '*.example.com, example.com', stopConditions: 'Interromper diante de dados reais',
    programPolicy: 'Escopo aprovado pelo programa', policyConsultedAt: '2026-01-01', policyConfirmed: true,
  };
  assert.throws(() => createAssessmentPlan({ ...input, programPolicy: '' }), /política/);
  assert.throws(() => createAssessmentPlan({ ...input, allowedTargets: '*.example.com' }), /allowlist/);
  assert.throws(() => createAssessmentPlan({ ...input, depth: 'outro' }), /opção inválida/);
  assert.throws(() => createAssessmentPlan({ ...input, stopConditions: '' }), /condições/);
  assert.throws(() => createAssessmentPlan({ ...input, policyConsultedAt: '2026-02-30' }), /data válida/);
  const plan = createAssessmentPlan(input);
  assert.match(plan.policySnapshot.sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.limits.maxRequests, 1);
  assert.deepEqual(JSON.parse(plan.prompt.split('\n').at(-1)).allowedTargets, ['*.example.com', 'example.com']);
});

test('red team exige regras de engajamento e condições de parada', () => {
  assert.throws(() => createAssessmentPlan({ target: 'lab.local', owner: 'Equipe', engagement: 'red-team', authorized: true }), /objetivo/);
  const plan = createAssessmentPlan({
    target: 'lab.local', owner: 'Equipe defensiva', engagement: 'red-team', authorized: true,
    objective: 'Validar alertas', rulesOfEngagement: 'Somente contas de teste e técnicas T1190 e T1059',
    operationWindow: '09h–17h BRT', stopConditions: 'Qualquer impacto ou dado real',
  });
  assert.equal(plan.engagement, 'red-team');
  assert.match(plan.prompt, /MITRE ATT&CK/);
  assert.match(plan.prompt, /dados sintéticos/);
});

test('modo destrutivo é restrito a laboratório privado recuperável e offline', () => {
  const base = {
    target: '192.168.50.10', owner: 'Equipe interna', engagement: 'red-team', authorized: true,
    objective: 'Validar recuperação', rulesOfEngagement: 'Somente VM descartável', operationWindow: 'Janela aprovada',
    stopConditions: 'Qualquer ativo fora do laboratório', intensity: 'destructive-lab', isolatedLab: true,
    recoverableSnapshot: true, recoveryPlan: 'Restaurar snapshot limpo',
    destructiveConfirmation: 'AUTORIZO EXERCICIO DESTRUTIVO EM LABORATORIO',
  };
  assert.throws(() => createAssessmentPlan({ ...base, target: 'example.com' }), /só aceita/);
  assert.throws(() => createAssessmentPlan({ ...base, externalAccess: true }), /não permite acesso externo/);
  const plan = createAssessmentPlan(base);
  assert.equal(plan.intensity, 'destructive-lab');
  assert.match(plan.prompt, /nova confirmação humana individual/);
});
