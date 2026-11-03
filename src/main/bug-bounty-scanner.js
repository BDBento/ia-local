'use strict';

const { isPrivateLabTarget, validateScope, validateTarget } = require('../shared/security-assessment');
const { analyzePolicy } = require('../shared/bug-bounty-policy');

const SECURITY_HEADERS = [
  ['strict-transport-security', 'HSTS ausente', 'medium', 'Defina Strict-Transport-Security após confirmar que todo o domínio usa HTTPS.'],
  ['content-security-policy', 'CSP ausente', 'medium', 'Adote uma Content-Security-Policy restritiva e teste em modo report-only antes.'],
  ['x-content-type-options', 'Proteção contra MIME sniffing ausente', 'low', 'Envie X-Content-Type-Options: nosniff.'],
  ['referrer-policy', 'Política de Referer ausente', 'low', 'Defina Referrer-Policy conforme a necessidade da aplicação.'],
  ['permissions-policy', 'Permissions Policy ausente', 'low', 'Restrinja recursos do navegador não utilizados.'],
];

function normalizePublicTarget(value) {
  const validated = validateTarget(value);
  const url = new URL(/^https?:\/\//.test(validated) ? validated : `https://${validated}`);
  if (url.protocol !== 'https:') throw new Error('A auditoria automática exige HTTPS.');
  if (isPrivateLabTarget(url.href)) throw new Error('Bug Bounty automático aceita somente alvos públicos HTTPS.');
  url.hash = '';
  return url.href;
}

function matchesAllowedTarget(urlValue, allowedTargets) {
  const hostname = new URL(urlValue).hostname.toLowerCase();
  return validateScope(allowedTargets).some((entry) => {
    const allowedHost = /^https?:\/\//.test(entry) ? new URL(entry).hostname : entry;
    return allowedHost.startsWith('*.')
      ? hostname.endsWith(allowedHost.slice(1)) && hostname !== allowedHost.slice(2)
      : hostname === allowedHost;
  });
}

function analyzeResponse({ url, status, headers, cookies = [] }) {
  const findings = [];
  for (const [header, title, severity, recommendation] of SECURITY_HEADERS) {
    if (!headers.get(header)) findings.push({ id: `header-${header}`, title, severity, evidence: `Cabeçalho ${header} não foi observado na resposta HTTP ${status}.`, recommendation });
  }
  const server = headers.get('server');
  if (server && /\d/.test(server)) findings.push({ id: 'server-version', title: 'Versão de servidor exposta', severity: 'info', evidence: `Server: ${server}`, recommendation: 'Considere remover detalhes de versão do cabeçalho Server.' });
  cookies.forEach((cookie, index) => {
    const name = cookie.split('=')[0] || `cookie-${index + 1}`;
    if (!/;\s*secure(?:;|$)/i.test(cookie)) findings.push({ id: `cookie-secure-${index}`, title: `Cookie ${name} sem Secure`, severity: 'medium', evidence: 'O atributo Secure não foi observado.', recommendation: 'Marque cookies de sessão como Secure.' });
    if (!/;\s*httponly(?:;|$)/i.test(cookie)) findings.push({ id: `cookie-httponly-${index}`, title: `Cookie ${name} sem HttpOnly`, severity: 'low', evidence: 'O atributo HttpOnly não foi observado.', recommendation: 'Use HttpOnly quando o cookie não precisar ser lido por JavaScript.' });
    if (!/;\s*samesite=/i.test(cookie)) findings.push({ id: `cookie-samesite-${index}`, title: `Cookie ${name} sem SameSite`, severity: 'low', evidence: 'O atributo SameSite não foi observado.', recommendation: 'Defina SameSite=Lax ou Strict quando compatível.' });
  });
  return { url, status, findings };
}

function buildReport(result) {
  const candidates = result.findings.filter((item) => item.eligibility !== 'excluded');
  const excluded = result.findings.filter((item) => item.eligibility === 'excluded');
  const counts = candidates.reduce((map, item) => ({ ...map, [item.severity]: (map[item.severity] || 0) + 1 }), {});
  const lines = [
    '# Relatório preliminar de Bug Bounty', '', `**Alvo:** ${result.url}`, `**Status HTTP:** ${result.status}`,
    `**Resumo:** ${candidates.length} candidato(s) para validação e ${excluded.length} resultado(s) excluído(s) pela política.`,
    `**Severidades dos candidatos:** ${counts.medium || 0} médio(s), ${counts.low || 0} baixo(s), ${counts.info || 0} informativo(s).`, '',
    '> Verificação automática não destrutiva. Confirme manualmente cada achado e as regras do programa antes de reportar.', '',
  ];
  candidates.forEach((finding, index) => lines.push(
    `## ${index + 1}. ${finding.title}`, '', `**Severidade sugerida:** ${finding.severity}`, '',
    `**Evidência:** ${finding.evidence}`, '', `**Recomendação:** ${finding.recommendation}`, '',
  ));
  if (!candidates.length) lines.push('Nenhum candidato elegível foi identificado nesta verificação.', '');
  if (excluded.length) {
    lines.push('## Resultados não elegíveis segundo a política', '');
    excluded.forEach((finding) => lines.push(`- ${finding.title}: ${finding.eligibilityReason}`));
  }
  return lines.join('\n');
}

async function scanTarget({ target, allowedTargets, programPolicy = '', fetchImpl = globalThis.fetch }) {
  const url = normalizePublicTarget(target);
  if (!matchesAllowedTarget(url, allowedTargets)) throw new Error('O alvo não pertence à allowlist aprovada.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let response = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'Farol-Security-Audit/1.0' } });
    if ([405, 501].includes(response.status)) {
      response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { range: 'bytes=0-1023', 'user-agent': 'Farol-Security-Audit/1.0' } });
    }
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const rawResult = analyzeResponse({ url, status: response.status, headers: response.headers, cookies });
    const policy = analyzePolicy(programPolicy);
    const result = { ...rawResult, findings: rawResult.findings.map(policy.classify), policyMatchedRules: policy.matchedRules };
    return { ...result, report: buildReport(result), checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A auditoria excedeu o limite de 12 segundos.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { analyzeResponse, buildReport, matchesAllowedTarget, normalizePublicTarget, scanTarget };
