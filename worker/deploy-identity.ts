// Only a GitHub-signed OIDC token from this repository's production deploy
// workflow can register commands. Never accept GitHub tokens or client headers
// as identity. Discord credentials stay inside Cloudflare Worker secrets.
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = ISSUER + '/.well-known/jwks';
const REPOSITORY = 'multicody10/PaperStreet';
const REPOSITORY_ID = '1465928317';
const REF = 'refs/heads/main';
const WORKFLOW = REPOSITORY + '/.github/workflows/deploy.yml@' + REF;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = Record<string, unknown>;
type PublicKey = JsonWebKey & { kid?: string; use?: string; alg?: string };
type Jwks = { keys?: PublicKey[] };

function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9_-]+$/.test(input)) throw new Error('Invalid JWT encoding');
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
  const result = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
  return result;
}
function decodedJson<T>(encoded: string): T {
  return JSON.parse(decoder.decode(decodeBase64Url(encoded))) as T;
}

export async function verifyProductionDeployIdentity(
  authorization: string | undefined, url: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!authorization || !authorization.startsWith('Bearer ') || authorization.length > 10000) return false;
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) return false;
  try {
    const header = decodedJson<JwtHeader>(parts[0]);
    const claims = decodedJson<JwtClaims>(parts[1]);
    const expectedAudience = new URL(url).origin + '/api/internal/register-commands';
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128 ||
      claims.iss !== ISSUER || claims.aud !== expectedAudience ||
      claims.repository !== REPOSITORY || claims.repository_id !== REPOSITORY_ID ||
      claims.ref !== REF || claims.workflow_ref !== WORKFLOW ||
      !['push', 'workflow_dispatch'].includes(String(claims.event_name)) ||
      typeof claims.exp !== 'number' || typeof claims.nbf !== 'number' ||
      typeof claims.iat !== 'number' || claims.exp <= now || claims.nbf > now + 30 ||
      claims.iat > now + 30 || claims.exp - claims.iat > 900 ||
      typeof claims.sha !== 'string' || !/^[a-f0-9]{40}$/.test(claims.sha)) return false;
    const response = await fetch(JWKS_URL, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const data = await response.json() as Jwks;
    const jwk = data.keys?.find(key => key.kid === header.kid &&
      key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
    }, false, ['verify']);
    const message = encoder.encode(parts[0] + '.' + parts[1]);
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]), message,
    );
  } catch {
    return false;
  }
}
