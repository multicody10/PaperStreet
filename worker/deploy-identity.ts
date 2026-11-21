import { githubActionsOidcKeys } from './github-jwks';

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

export type DeployIdentityResult = { valid: boolean; reason: string };
const deny = (reason: string): DeployIdentityResult => ({ valid: false, reason });
export async function inspectProductionDeployIdentity(
  authorization: string | undefined, url: string,
  now = Math.floor(Date.now() / 1000),
): Promise<DeployIdentityResult> {
  if (!authorization || !authorization.startsWith('Bearer ') || authorization.length > 10000)
    return deny('format');
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !part)) return deny('format');
  try {
    const header = decodedJson<JwtHeader>(parts[0]);
    const claims = decodedJson<JwtClaims>(parts[1]);
    const expectedAudience = new URL(url).origin + '/api/internal/register-commands';
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128)
      return deny('header');
    if (claims.iss !== ISSUER) return deny('issuer');
    if (claims.aud !== expectedAudience) return deny('audience');
    if (claims.repository !== REPOSITORY || claims.repository_id !== REPOSITORY_ID)
      return deny('repository');
    if (claims.ref !== REF) return deny('branch');
    if (claims.workflow_ref !== WORKFLOW) return deny('workflow');
    if (!['push', 'workflow_dispatch'].includes(String(claims.event_name))) return deny('event');
    if (typeof claims.exp !== 'number' || typeof claims.nbf !== 'number' ||
      typeof claims.iat !== 'number' || claims.exp <= now || claims.nbf > now + 30 ||
      claims.iat > now + 30 || claims.exp - claims.iat > 900) return deny('lifetime');
    if (typeof claims.sha !== 'string' || !/^[a-f0-9]{40}$/.test(claims.sha))
      return deny('commit');
    // Production keys are pinned from GitHub's public JWKS during the build.
    // This avoids depending on a second outbound Worker connection at deploy time.
    let jwk = githubActionsOidcKeys.find(key => key.kid === header.kid &&
      key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256');
    if (!jwk) {
      // Local development / a genuinely rotated key can still use trusted JWKS.
      const response = await fetch(JWKS_URL, { redirect: 'error', signal: AbortSignal.timeout(8000) })
        .catch(() => null);
      if (!response?.ok) return deny('jwks_fetch');
      const data = await response.json().catch(() => null) as Jwks | null;
      jwk = data?.keys?.find(key => key.kid === header.kid &&
        key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256');
      if (!jwk) return deny('jwks_key');
    }
    const key = await crypto.subtle.importKey('jwk', jwk, {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
    }, false, ['verify']);
    const message = encoder.encode(parts[0] + '.' + parts[1]);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, decodeBase64Url(parts[2]), message,
    );
    return valid ? { valid: true, reason: 'verified' } : deny('signature');
  } catch {
    return deny('verification');
  }
}

export async function verifyProductionDeployIdentity(
  authorization: string | undefined, url: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  return (await inspectProductionDeployIdentity(authorization, url, now)).valid;
}
