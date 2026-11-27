'use strict';

const { lookup } = require('node:dns');
const { request } = require('node:https');
const { BlockList, isIP } = require('node:net');
const { EXTERNAL_LIMITS, isPrivateLabTarget, matchesAllowedTarget, validateTarget } = require('../shared/security-assessment');
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
  if (!/^https?:\/\//.test(validated) && validated.includes('/')) throw new Error('Informe um alvo HTTPS individual.');
  const url = new URL(/^https?:\/\//.test(validated) ? validated : isIP(validated) === 6 ? `https://[${validated}]` : `https://${validated}`);
  if (url.protocol !== 'https:') throw new Error('A auditoria automática exige HTTPS.');
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isPrivateLabTarget(url.href) || (isIP(host) && !isPublicAddress(host)) || (!isIP(host) && !host.includes('.'))) {
    throw new Error('Bug Bounty automático aceita somente alvos públicos HTTPS.');
  }
  return url.href;
}

const reserved = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) {
  reserved.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  reserved.addSubnet(address, prefix, 'ipv6');
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !reserved.check(address, 'ipv4');
  return family === 6 && /^[23][\da-f]{3}:/i.test(address) && !reserved.check(address, 'ipv6');
}

function readHeaders(url, { signal }) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'HEAD', signal, agent: false, rejectUnauthorized: true, headers: { 'user-agent': 'Farol-Security-Audit/1.0' },
      lookup(host, options, callback) {
        lookup(host, { all: true }, (error, addresses) => {
          if (error) return callback(error);
          if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
            return callback(new Error('A resolução DNS precisa apontar exclusivamente para endereços públicos.'));
          }
          const { address, family } = addresses[0];
          return options.all ? callback(null, [{ address, family }]) : callback(null, address, family);
        });
      },
    }, (response) => {
      const { 'set-cookie': cookies = [], ...fields } = response.headersDistinct;
      response.destroy();
      resolve({ status: response.statusCode, headers: { get: (name) => fields[name]?.join(', ') }, cookies });
    });
    req.on('error', reject);
    req.end();
  });
}

function analyzeResponse({ url, status, headers, cookies = [] }) {
  const findings = [];
  for (const [header, title, severity, recommendation] of SECURITY_HEADERS) {
    if (!headers.get(header)) findings.push({ id: `header-${header}`, title, severity, evidence: `Cabeçalho ${header} não foi observado na resposta HTTP ${status}.`, recommendation });
  }
  const server = headers.get('server');
  if (server && /\d/.test(server)) findings.push({ id: 'server-version', title: 'Possível versão de servidor exposta', severity: 'info', evidence: 'O cabeçalho Server contém dígitos.', recommendation: 'Considere remover detalhes de versão do cabeçalho Server.' });
  cookies.forEach((cookie, index) => {
    const name = `nº ${index + 1}`;
    if (!/;\s*secure(?:;|$)/i.test(cookie)) findings.push({ id: `cookie-secure-${index}`, title: `Cookie ${name} sem Secure`, severity: 'medium', evidence: 'O atributo Secure não foi observado.', recommendation: 'Marque cookies de sessão como Secure.' });
    if (!/;\s*httponly(?:;|$)/i.test(cookie)) findings.push({ id: `cookie-httponly-${index}`, title: `Cookie ${name} sem HttpOnly`, severity: 'low', evidence: 'O atributo HttpOnly não foi observado.', recommendation: 'Use HttpOnly quando o cookie não precisar ser lido por JavaScript.' });
    if (!/;\s*samesite=/i.test(cookie)) findings.push({ id: `cookie-samesite-${index}`, title: `Cookie ${name} sem SameSite`, severity: 'low', evidence: 'O atributo SameSite não foi observado.', recommendation: 'Defina SameSite=Lax ou Strict quando compatível.' });
  });
  return { url, status, findings };
}

function buildReport(result) {
  const observations = result.findings.filter((item) => item.eligibility !== 'excluded');
  const excluded = result.findings.filter((item) => item.eligibility === 'excluded');
  const lines = [
    '# Relatório preliminar de Bug Bounty', '', `**Alvo:** ${result.url}`, `**Status HTTP:** ${result.status}`,
    result.assessmentId ? `**Avaliação:** ${result.assessmentId} · ${result.checkedAt}` : '',
    result.policySnapshot ? `**Política declarada pelo operador:** ${result.policySnapshot.consultedAt} · SHA-256 ${result.policySnapshot.sha256}` : '**Política não validada.**',
    `**Resumo:** ${observations.length} observação(ões) automática(s) e ${excluded.length} resultado(s) excluído(s) pela política.`,
    result.stopped ? `**Interrupção:** ${result.stopped}` : '', '',
    '> Verificação automática não destrutiva. Confirme manualmente cada achado e as regras do programa antes de reportar.', '',
  ];
  observations.forEach((finding, index) => lines.push(
    `## ${index + 1}. ${finding.title}`, '', `**Prioridade inicial:** ${finding.severity}`, '',
    `**Evidência:** ${finding.evidence}`, '', `**Recomendação:** ${finding.recommendation}`, '',
  ));
  if (excluded.length) {
    lines.push('## Resultados não elegíveis segundo a política', '');
    excluded.forEach((finding) => lines.push(`- ${finding.title}: ${finding.eligibilityReason}`));
  }
  return lines.join('\n');
}

async function scanTarget({ target, allowedTargets, programPolicy, policySnapshot, assessmentId, read = readHeaders }) {
  const url = normalizePublicTarget(target);
  if (!matchesAllowedTarget(url, allowedTargets)) throw new Error('O alvo não pertence à allowlist aprovada.');
  const policy = analyzePolicy(programPolicy);
  if (!policy.provided || policySnapshot?.confirmed !== true) throw new Error('Confirme a política antes da auditoria.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_LIMITS.timeoutMs);
  try {
    const response = await read(url, { signal: controller.signal });
    const stopped = response.status < 200 || response.status >= 300 ? `A resposta HTTP ${response.status} encerrou a verificação.` : '';
    const rawResult = stopped ? { url, status: response.status, findings: [] } : analyzeResponse({ url, ...response });
    const result = { ...rawResult, assessmentId, policySnapshot, stopped, checkedAt: new Date().toISOString(), findings: rawResult.findings.map(policy.classify) };
    return { ...result, report: buildReport(result) };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A auditoria excedeu o limite de 12 segundos.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { analyzeResponse, buildReport, isPublicAddress, matchesAllowedTarget, normalizePublicTarget, scanTarget };
