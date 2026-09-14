const { appendFileSync } = require('node:fs');

function healthyVersion(health, sha) {
  return health.version === sha && health.status === 'online'
    && health.redis_connected === true && health.redis_mode?.startsWith('Servidor Redis (');
}

async function checkDeployment(frontend, backend, sha, request = fetch) {
  const get = async (url, json = false) => {
    const response = await request(`${url}?deploy=${sha}&t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return json ? response.json() : response.text();
  };
  const [version, direct, proxied, page] = await Promise.all([
    get(`${frontend}/version.txt`), get(`${backend}/api/health`, true),
    get(`${frontend}/api/health`, true), get(`${frontend}/`)
  ]);
  return version.trim() === sha && healthyVersion(direct, sha)
    && healthyVersion(proxied, sha) && page.includes('SuperList');
}

async function main() {
  if (!process.env.RENDER_DEPLOY_HOOK_BACKEND || !process.env.RENDER_DEPLOY_HOOK_FRONTEND) {
    console.log('::warning::Faltan hooks de Render; no se confirma el despliegue.');
    return;
  }
  const { FRONTEND_URL, BACKEND_URL, GITHUB_SHA, GITHUB_OUTPUT } = process.env;
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    try {
      if (await checkDeployment(FRONTEND_URL, BACKEND_URL, GITHUB_SHA)) {
        appendFileSync(GITHUB_OUTPUT, 'deployment=success\n');
        console.log('Versión desplegada y conexión con Redis confirmadas en Render.');
        return;
      }
    } catch {
      // Render puede servir la versión anterior o no responder durante el despliegue.
    }
    console.log('Esperando la versión actual en frontend y API...');
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  throw new Error('No se confirmó el despliegue del commit en Render en 10 minutos.');
}

module.exports = { checkDeployment };
if (require.main === module) main().catch(error => {
  console.error(`::error::${error.message}`);
  process.exitCode = 1;
});
