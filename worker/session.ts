const encoder = new TextEncoder();
const SESSION_TTL_SECONDS = 60 * 60;

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unb64 = (input: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error('Invalid session encoding');
  const raw = atob(input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
async function key(secret: string) {
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function createSession(secret: string, userId: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  if (!/^\d{15,22}$/.test(userId)) throw new Error('Invalid Discord user ID');
  const payload = b64(encoder.encode(JSON.stringify({ sub: userId, aud: 'paperstreet', exp: now + SESSION_TTL_SECONDS })));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  return `${payload}.${b64(new Uint8Array(signature))}`;
}
export async function verifySession(secret: string, token: string, now = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2 || parts[0].length > 512 || parts[1].length > 128) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await key(secret), unb64(parts[1]), encoder.encode(parts[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    if (payload.aud !== 'paperstreet' || !Number.isSafeInteger(payload.exp) || payload.exp <= now || !/^\d{15,22}$/.test(payload.sub)) return null;
    return payload.sub as string;
  } catch { return null; }
}
