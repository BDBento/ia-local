'use strict';

const RULES = [
  { pattern: /(?:falta|aus[eê]ncia).{0,80}(?:cabe[cç]alh|headers?).{0,80}(?:seguran[cç]a|csp|hsts|x-frame|x-content)/i, ids: ['header-strict-transport-security', 'header-content-security-policy', 'header-x-content-type-options', 'header-referrer-policy', 'header-permissions-policy'], reason: 'A política exclui ausência de cabeçalhos de segurança.' },
  { pattern: /hsts ausente/i, ids: ['header-strict-transport-security'], reason: 'A política exclui explicitamente HSTS ausente.' },
  { pattern: /(?:flags?).{0,40}cookies?.{0,80}(?:httponly|samesite|secure)/i, prefixes: ['cookie-'], reason: 'A política exclui falta de flags de cookies.' },
  { pattern: /(?:captura de banners?|banner grabbing|nome do servidor|vers[aã]o do software)/i, ids: ['server-version'], reason: 'A política exclui banners ou versões de servidor.' },
  { pattern: /(?:melhores pr[aá]ticas|configura[cç][oõ]es).{0,40}(?:ssl|tls)/i, prefixes: ['tls-'], reason: 'A política exclui recomendações genéricas de SSL/TLS.' },
];

function analyzePolicy(text) {
  const policyText = String(text || '').trim().slice(0, 100000);
  const matchedRules = RULES.filter((rule) => rule.pattern.test(policyText));
  return {
    provided: Boolean(policyText),
    matchedRules: matchedRules.map((rule) => rule.reason),
    classify(finding) {
      const rule = matchedRules.find((item) => item.ids?.includes(finding.id) || item.prefixes?.some((prefix) => finding.id.startsWith(prefix)));
      return rule
        ? { ...finding, eligibility: 'excluded', eligibilityReason: rule.reason }
        : { ...finding, eligibility: policyText ? 'review' : 'unknown', eligibilityReason: policyText ? 'Não foi encontrada exclusão explícita; ainda exige validação manual e impacto real.' : 'Política do programa não fornecida.' };
    },
  };
}

module.exports = { analyzePolicy, RULES };
