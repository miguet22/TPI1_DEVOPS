const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkDeployment } = require('../scripts/verify-deployment.cjs');

const sha = 'current-commit';
function mockRequest({ version = sha, apiVersion = sha, redis = true, mode = 'Servidor Redis (render)', proxyOk = true } = {}) {
  return async url => ({
    ok: proxyOk || !url.includes('frontend/api/health'),
    status: 503,
    text: async () => url.includes('version.txt') ? version : '<title>SuperList</title>',
    json: async () => ({ version: apiVersion, status: 'online', redis_connected: redis, redis_mode: mode })
  });
}

test('confirma el commit actual y Redis a través de ambas rutas', async () => {
  assert.equal(await checkDeployment('https://frontend', 'https://backend', sha, mockRequest()), true);
});

for (const [name, options] of [
  ['frontend anterior', { version: 'old' }],
  ['API anterior', { apiVersion: 'old' }],
  ['Redis desconectado', { redis: false }],
  ['fallback en memoria', { mode: 'Redis en memoria (fakeredis)' }]
]) {
  test(`no anuncia éxito con ${name}`, async () => {
    assert.equal(await checkDeployment('https://frontend', 'https://backend', sha, mockRequest(options)), false);
  });
}

test('rechaza un proxy de API que falla aunque el backend responda', async () => {
  await assert.rejects(checkDeployment('https://frontend', 'https://backend', sha, mockRequest({ proxyOk: false })));
});
