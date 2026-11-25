import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, scryptSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

async function start(env) {
  const child = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, ...env, AGENT_OFFICE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const exited = once(child, 'exit');
  try {
    for await (const chunk of child.stdout.iterator({ destroyOnReturn: false })) {
      const port = String(chunk).match(/"event":"agent_office_listening".*"port":(\d+)/)?.[1];
      if (port) {
        child.stdout.resume();
        return {
          request: (route, options) => fetch('http://127.0.0.1:' + port + route, options),
          close: async () => { child.kill(); await exited; }
        };
      }
    }
    throw new Error('Agent Office did not start');
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  }
}

test('public isolation, password authentication, session revocation and receipt privacy', { timeout: 20000 }, async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'agent-office-security-'));
  let admin;
  let publicSite;
  const fixture = http.createServer((req, res) => {
    const reply = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && req.url === '/v1/agents/fixture/messages') {
      req.resume();
      return reply(202, { deliveries: [{ id: 'example', recipientAgentId: 'fixture', status: 'queued' }] });
    }
    if (req.url === '/v1/agents/fixture/deliveries/example') {
      return reply(200, {
        status: 'completed',
        answer: ['Resumo', 'ghp' + '_' + 'x'.repeat(24), 'AK' + 'IA' + 'A'.repeat(16), '+12025550123'].join(' ')
      });
    }
    reply(404, {});
  });
  t.after(async () => {
    await Promise.all([admin?.close(), publicSite?.close()]);
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');

  const password = 'synthetic password for the local test';
  const salt = Buffer.alloc(16, 1);
  const hash = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024 });
  const origin = 'https://commander.example.invalid';
  const receiptFile = path.join(directory, 'receipts.sqlite');
  const agentMap = path.join(directory, 'agent-map.json');
  const snapshot = path.join(directory, 'missing-snapshot.json');
  writeFileSync(path.join(directory, 'url'), 'http://127.0.0.1:' + fixture.address().port);
  writeFileSync(path.join(directory, 'token'), 'test-only-automation-token');
  writeFileSync(agentMap, JSON.stringify({ 'whatsapp-orchestrator': 'fixture' }));
  const previous = new DatabaseSync(receiptFile);
  previous.exec(`
    CREATE TABLE receipts (
      id TEXT PRIMARY KEY, operator TEXT NOT NULL, slug TEXT NOT NULL, agentId TEXT NOT NULL,
      hash TEXT NOT NULL, created INTEGER NOT NULL, deliveryId TEXT NOT NULL UNIQUE,
      upstreamId TEXT, status TEXT, position INTEGER
    );
    INSERT INTO receipts VALUES ('old', 'operator', 'slug', 'fixture', 'hash', 1, 'delivery', 'old', 'completed', NULL);
  `);
  previous.close();

  admin = await start({
    AGENT_OFFICE_MODE: 'admin',
    AGENT_OFFICE_ADMIN_AUTH: 'password',
    AGENT_OFFICE_ALLOWED_ORIGIN: origin,
    AGENT_OFFICE_ADMIN_PASSWORD_HASH: 'scrypt:' + salt.toString('hex') + ':' + hash.toString('hex'),
    AGENT_OFFICE_TRUST_LOCAL_PROXY: '1',
    AGENT_OFFICE_RECEIPTS_FILE: receiptFile,
    AGENT_OFFICE_AGENT_MAP_FILE: agentMap,
    OPENBOT_AUTOMATION_DIR: directory
  });
  publicSite = await start({ AGENT_OFFICE_MODE: 'public', AGENT_OFFICE_SNAPSHOT_FILE: snapshot });
  const current = new DatabaseSync(receiptFile, { readOnly: true });
  assert.equal(current.prepare('SELECT count(*) AS n FROM receipts').get().n, 0);
  current.close();

  assert.equal((await publicSite.request('/')).status, 200);
  assert.equal((await publicSite.request('/api/public/state')).status, 503);
  for (const route of ['/admin', '/api/admin/session', '/api/admin/login']) {
    assert.equal((await publicSite.request(route)).status, 404, route);
  }
  const page = await admin.request('/admin');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.match(await page.text(), /const passwordLogin = true;/);
  assert.equal((await admin.request('/api/admin/session')).status, 401);

  function post(route, payload, headers = {}) {
    return admin.request(route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify(payload)
    });
  }
  const login = '/api/admin/login';
  assert.equal((await post(login, { password }, { Origin: 'https://public.example.invalid' })).status, 403);
  const failed = await post(login, { password: 'mistyped' });
  assert.equal(failed.status, 401);
  assert.equal(failed.headers.get('set-cookie'), null);

  const accepted = await post(login, { password });
  assert.equal(accepted.status, 200);
  const setCookie = accepted.headers.get('set-cookie');
  assert.match(setCookie, /^__Host-ao_session=[^;]+; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800$/);
  const cookie = { Cookie: setCookie.split(';')[0] };
  const { csrfToken } = await accepted.json();
  assert.notEqual(csrfToken, cookie.Cookie.split('=')[1]);
  const authorized = { ...cookie, 'X-Agent-Office-CSRF': csrfToken };
  const agent = '/api/admin/agents/whatsapp-orchestrator';
  const request = { text: 'Tarefa local de teste', clientMessageId: randomUUID() };
  assert.equal((await post(agent + '/messages', request, cookie)).status, 403);
  const delivery = await post(agent + '/messages', request, authorized);
  assert.equal(delivery.status, 202);
  const { deliveryId } = await delivery.json();
  const result = await admin.request(agent + '/deliveries/' + deliveryId, { headers: cookie });
  assert.equal((await result.json()).answer, 'Resumo [REDACTED_KEY] [REDACTED_KEY] [REDACTED_PHONE]');
  assert.equal((await post('/api/admin/logout', {}, cookie)).status, 403);
  assert.equal((await post('/api/admin/logout', {}, authorized)).status, 200);
  assert.equal((await admin.request('/api/admin/session', { headers: cookie })).status, 401);
  const firstClient = { 'X-Office-Client-IP': '::1' };
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await post(login, { password: '' }, firstClient)).status, 400);
  }
  const limited = await post(login, { password: '' }, firstClient);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await post(login, { password: '' }, { 'X-Office-Client-IP': '127.0.0.1' })).status, 400);
});
