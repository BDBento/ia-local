'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GRANT_TTL_MS,
  PENDING_TTL_MS,
  createAuthorizationManager,
} = require('../src/main/network-authorization');

function fixture() {
  let current = Date.parse('2026-09-21T12:00:00Z');
  const audit = [];
  return {
    audit,
    advance: (milliseconds) => { current += milliseconds; },
    manager: createAuthorizationManager({
      now: () => current,
      auditWriter: async (event) => audit.push(event),
    }),
  };
}

test('exige decisão humana antes de consumir autorização', async () => {
  const { manager } = fixture();
  const request = await manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  await assert.rejects(
    manager.consume({ id: request.id, kind: 'model-download', target: 'qwen3:4b', approvalToken: 'x' }),
    /não aprovada/,
  );
});

test('token aprovado vale uma única vez e apenas para o destino autorizado', async () => {
  const { manager, audit } = fixture();
  const request = await manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  const grant = await manager.decide(request.id, 'approve');

  await assert.rejects(
    manager.consume({ id: request.id, kind: 'model-download', target: 'outro:7b', approvalToken: grant.approvalToken }),
    /não corresponde/,
  );
  const consumed = await manager.consume({
    id: request.id,
    kind: 'model-download',
    target: 'qwen3:4b',
    approvalToken: grant.approvalToken,
  });
  assert.equal(consumed.status, 'consumed');
  await assert.rejects(
    manager.consume({ id: request.id, kind: 'model-download', target: 'qwen3:4b', approvalToken: grant.approvalToken }),
    /não aprovada/,
  );
  assert.deepEqual(audit.map((entry) => entry.type), ['requested', 'approved', 'consumed']);
});

test('recusa é definitiva', async () => {
  const { manager } = fixture();
  const request = await manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  const denied = await manager.decide(request.id, 'deny');
  assert.equal(denied.authorization.status, 'denied');
  await assert.rejects(manager.decide(request.id, 'approve'), /já decidida/);
});

test('solicitação e concessão expiram', async () => {
  const first = fixture();
  const pending = await first.manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  first.advance(PENDING_TTL_MS + 1);
  await assert.rejects(first.manager.decide(pending.id, 'approve'), /expirada/);

  const second = fixture();
  const approved = await second.manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  const grant = await second.manager.decide(approved.id, 'approve');
  second.advance(GRANT_TTL_MS + 1);
  await assert.rejects(
    second.manager.consume({ id: approved.id, kind: 'model-download', target: 'qwen3:4b', approvalToken: grant.approvalToken }),
    /expirada/,
  );
});

test('não registra o token secreto na auditoria nem na listagem', async () => {
  const { manager, audit } = fixture();
  const request = await manager.request({ kind: 'model-download', target: 'qwen3:4b' });
  const grant = await manager.decide(request.id, 'approve');
  const serialized = JSON.stringify({ audit, list: manager.list() });
  assert.equal(serialized.includes(grant.approvalToken), false);
  assert.equal(serialized.includes('tokenHash'), false);
});
