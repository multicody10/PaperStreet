// Keep the Discord Activity's primary entry point on APP_HANDLER.
// Uses the deployed Worker's secrets and checks Discord's authoritative global command,
// so no local .dev.vars file or manual API setup is required.
export type LaunchSyncEnv = {
  DB: D1Database;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_PUBLIC_KEY?: string;
};
type StoredSync = { value: string; checked_at: number };
type Entry = { id: string; application_id: string; type: number; handler?: number; version?: string };
const API = 'https://discord.com/api/v10';
const STATE_KEY = 'discord-primary-entry-app-handler-v1';
const VERIFY_INTERVAL_SECONDS = 24 * 3600;

export async function synchronizeDiscordLaunch(
  env: LaunchSyncEnv,
  now = Math.floor(Date.now() / 1000),
): Promise<'skipped' | 'verified' | 'updated'> {
  const appId = env.DISCORD_CLIENT_ID;
  if (!appId || !/^\d{15,22}$/.test(appId) || !env.DISCORD_CLIENT_SECRET ||
    !/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '')) {
    console.warn('Discord entry point sync skipped: application credentials or public key unavailable');
    return 'skipped';
  }
  const state = await env.DB.prepare(
    'SELECT value,checked_at FROM service_state WHERE key=?'
  ).bind(STATE_KEY).first<StoredSync>();
  if (state?.value === appId && now - state.checked_at < VERIFY_INTERVAL_SECONDS) return 'skipped';

  // A client credentials token only updates this application's own commands.
  const tokenResponse = await fetch(`${API}/oauth2/token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      grant_type: 'client_credentials', scope: 'applications.commands.update',
      client_id: appId, client_secret: env.DISCORD_CLIENT_SECRET,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Discord command authorization: HTTP ${tokenResponse.status}`);
  const tokenData = await tokenResponse.json() as { access_token?: unknown };
  if (typeof tokenData.access_token !== 'string' || !tokenData.access_token)
    throw new Error('Discord command authorization returned no access token');
  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    'Content-Type': 'application/json',
  };
  const root = `${API}/applications/${appId}/commands`;
  async function discord<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000), ...init,
    });
    // Never include response bodies in errors: OAuth/provider responses may be sensitive.
    if (!response.ok) throw new Error(`Discord command API: HTTP ${response.status}`);
    return await response.json() as T;
  }
  const commands = await discord<Entry[]>(root);
  if (!Array.isArray(commands)) throw new Error('Discord command list was invalid');
  const candidates = commands.filter(command => command.type === 4 && command.application_id === appId);
  if (candidates.length !== 1 || !/^\d{15,22}$/.test(candidates[0].id))
    throw new Error(`Expected one primary entry command for the PaperStreet application, got ${candidates.length}`);
  const entry = candidates[0];

  // Force an initial re-registration even if the reported handler is already 1.
  // This can refresh stale client-side command versions after earlier configuration.
  const mustPatch = entry.handler !== 1 || !state || state.value !== appId;
  if (mustPatch) {
    const updated = await discord<Entry>(`${root}/${entry.id}`, {
      method: 'PATCH', body: JSON.stringify({ handler: 1 }),
    });
    if (updated.id !== entry.id || updated.application_id !== appId || updated.handler !== 1)
      throw new Error('Discord did not acknowledge APP_HANDLER for the selected entry point');
  }
  const verified = await discord<Entry>(`${root}/${entry.id}`);
  if (verified.id !== entry.id || verified.application_id !== appId || verified.handler !== 1)
    throw new Error('Discord did not persist APP_HANDLER; the automatic invitation remains enabled');

  await env.DB.prepare(`INSERT INTO service_state(key,value,checked_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,checked_at=excluded.checked_at`)
    .bind(STATE_KEY, appId, now).run();
  console.info(`PaperStreet Discord entry point verified: APP_HANDLER (1), command version ${verified.version ?? 'unknown'}`);
  return mustPatch ? 'updated' : 'verified';
}
