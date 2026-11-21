// Called after a successful production Wrangler deploy by GitHub Actions.
// GitHub OIDC proves the specific deploying workflow without copying Discord
// client secrets from Cloudflare or needing an additional long-lived secret.
const origin = process.env.PAPERSTREET_WORKER_URL || 'https://paperstreet.gobydev.workers.dev';
const endpoint = new URL('/api/internal/register-commands', origin);
if (endpoint.protocol !== 'https:' || endpoint.origin !== new URL(origin).origin)
  throw new Error('Expected the HTTPS PaperStreet production Worker origin');
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) throw new Error('GitHub Actions OIDC is unavailable. Grant id-token: write.');
const identityUrl = new URL(requestUrl);
identityUrl.searchParams.set('audience', endpoint.toString());

const identityResponse = await fetch(identityUrl, {
  headers: { Authorization: `Bearer ${requestToken}` },
  redirect: 'error', signal: AbortSignal.timeout(10000),
});
if (!identityResponse.ok)
  throw new Error(`GitHub Actions OIDC request failed: HTTP ${identityResponse.status}`);
const identity = await identityResponse.json();
if (typeof identity.value !== 'string' || !identity.value)
  throw new Error('GitHub Actions OIDC did not return a token');

const registered = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${identity.value}` },
  redirect: 'error', signal: AbortSignal.timeout(30000),
});
const result = await registered.json().catch(() => ({}));
if (!registered.ok)
  throw new Error(`Discord command deployment failed: HTTP ${registered.status} (${result.error || 'unknown_error'})`);
if (result.command !== '/portfolio' || !['registered', 'verified'].includes(result.result))
  throw new Error('Worker did not confirm the /portfolio command');
console.log(`Discord ${result.command} command ${result.result} on production deployment.`);
