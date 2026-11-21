// Generate a pinned, public-only GitHub OIDC verification keyset for this deploy.
// No tokens, credentials, certificates or private keys are embedded.
import { writeFile } from 'node:fs/promises';

const source = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const response = await fetch(source, {
  redirect: 'error', signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`GitHub OIDC signing keys unavailable: HTTP ${response.status}`);
const json = await response.json();
if (!Array.isArray(json.keys)) throw new Error('Unexpected GitHub OIDC JWKS response');
const keys = json.keys.filter(key =>
  key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig' &&
  typeof key.kid === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(key.kid) &&
  typeof key.n === 'string' && /^[a-zA-Z0-9_-]+$/.test(key.n) &&
  key.n.length >= 200 && typeof key.e === 'string' && /^[a-zA-Z0-9_-]+$/.test(key.e)
).map(({ kid, n, e }) => ({ kty: 'RSA', alg: 'RS256', use: 'sig', kid, n, e }));
if (!keys.length || keys.length > 30) throw new Error('No valid GitHub OIDC signing keys found');
const output = `// Generated during deployment from the official GitHub OIDC public JWKS.
export const githubActionsOidcKeys: (JsonWebKey & {
  kid?: string; use?: string; alg?: string;
})[] = ${JSON.stringify(keys, null, 2)};
`;
await writeFile(new URL('../worker/github-jwks.ts', import.meta.url), output, { encoding: 'utf8' });
console.log(`Bundled ${keys.length} current GitHub OIDC public signing keys for this deployment.`);
