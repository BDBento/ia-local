'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssessmentPlan, validateTarget } = require('../src/shared/security-assessment');

test('aceita apenas alvos bem formados', () => {
  assert.equal(validateTarget('192.168.1.0/24'), '192.168.1.0/24');
  assert.equal(validateTarget('https://app.exemplo.local/login'), 'https://app.exemplo.local/login');
  assert.throws(() => validateTarget('host; Remove-Item *'), /hostname, IPv4, CIDR ou URL/);
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
  const plan = createAssessmentPlan({
    target: 'example.com', owner: 'Pesquisador', method: 'web', depth: 'standard', authorized: true,
    engagement: 'bug-bounty', externalAccess: true, programUrl: 'https://hackerone.com/example',
    allowedTargets: '*.example.com, api.example.com',
  });
  assert.deepEqual(plan.allowedTargets, ['*.example.com', 'api.example.com']);
  assert.match(plan.prompt, /exclusivamente para: \*\.example\.com, api\.example\.com/);
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
