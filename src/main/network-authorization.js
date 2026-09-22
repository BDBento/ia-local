'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PENDING_TTL_MS = 2 * 60 * 1000;
const GRANT_TTL_MS = 60 * 1000;
const ALLOWED_KINDS = new Set(['model-download', 'terminal-command']);

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicEntry(entry) {
  const { tokenHash, ...safe } = entry;
  return { ...safe };
}

function createFileAuditWriter(filePath) {
  let queue = Promise.resolve();
  return (event) => {
    queue = queue.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
    });
    return queue;
  };
}

function createAuthorizationManager({
  auditPath,
  now = () => Date.now(),
  auditWriter = auditPath ? createFileAuditWriter(auditPath) : async () => {},
} = {}) {
  const entries = new Map();

  async function audit(type, entry, detail = {}) {
    await auditWriter({
      timestamp: new Date(now()).toISOString(),
      type,
      authorizationId: entry.id,
      kind: entry.kind,
      target: entry.target,
      ...detail,
    });
  }

  function expire() {
    const current = now();
    for (const entry of entries.values()) {
      const deadline = entry.status === 'approved' ? entry.grantExpiresAt : entry.expiresAt;
      if (['pending', 'approved'].includes(entry.status) && deadline <= current) {
        entry.status = 'expired';
        entry.tokenHash = null;
      }
    }
  }

  async function request(input = {}) {
    expire();
    const kind = cleanText(input.kind, 64);
    const target = cleanText(input.target, kind === 'terminal-command' ? 4000 : 192);
    const reason = cleanText(input.reason, 300);
    if (!ALLOWED_KINDS.has(kind)) throw new Error('Tipo de autorização não permitido.');
    if (!target) throw new Error('Destino da autorização não informado.');

    const createdAt = now();
    const entry = {
      id: crypto.randomUUID(),
      kind,
      target,
      reason,
      status: 'pending',
      createdAt,
      expiresAt: createdAt + PENDING_TTL_MS,
      decidedAt: null,
      consumedAt: null,
      grantExpiresAt: null,
      tokenHash: null,
    };
    entries.set(entry.id, entry);
    await audit('requested', entry);
    return publicEntry(entry);
  }

  async function decide(id, decision) {
    expire();
    const entry = entries.get(cleanText(id, 64));
    if (!entry || entry.status !== 'pending') throw new Error('Solicitação inexistente, expirada ou já decidida.');
    if (!['approve', 'deny'].includes(decision)) throw new Error('Decisão inválida.');

    entry.decidedAt = now();
    if (decision === 'deny') {
      entry.status = 'denied';
      await audit('denied', entry);
      return { authorization: publicEntry(entry), approvalToken: null };
    }

    const approvalToken = crypto.randomBytes(32).toString('hex');
    entry.status = 'approved';
    entry.grantExpiresAt = now() + GRANT_TTL_MS;
    entry.tokenHash = crypto.createHash('sha256').update(approvalToken).digest('hex');
    await audit('approved', entry, { grantExpiresAt: entry.grantExpiresAt });
    return { authorization: publicEntry(entry), approvalToken };
  }

  async function consume(input = {}) {
    expire();
    const entry = entries.get(cleanText(input.id, 64));
    if (!entry || entry.status !== 'approved') throw new Error('Autorização não aprovada ou expirada.');
    const targetLimit = entry.kind === 'terminal-command' ? 4000 : 192;
    if (entry.kind !== cleanText(input.kind, 64) || entry.target !== cleanText(input.target, targetLimit)) {
      throw new Error('A autorização não corresponde a esta operação.');
    }
    const suppliedHash = crypto.createHash('sha256').update(String(input.approvalToken || '')).digest('hex');
    if (!entry.tokenHash || !safeEqual(entry.tokenHash, suppliedHash)) throw new Error('Token de autorização inválido.');

    entry.status = 'consumed';
    entry.consumedAt = now();
    entry.tokenHash = null;
    await audit('consumed', entry);
    return publicEntry(entry);
  }

  function list() {
    expire();
    return [...entries.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map(publicEntry);
  }

  return { consume, decide, list, request };
}

module.exports = {
  ALLOWED_KINDS,
  GRANT_TTL_MS,
  PENDING_TTL_MS,
  createAuthorizationManager,
};
