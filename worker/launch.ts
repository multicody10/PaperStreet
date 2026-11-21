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
const STATUS_KEY = 'discord-primary-entry-sync-result-v1';
const STATUS_VALUES = new Set([
  'verified', 'updated', 'missing_app_id', 'missing_client_secret', 'missing_public_key',
  'discord_oauth_401', 'discord_oauth_403', 'discord_oauth_429',
  'discord_api_400', 'discord_api_401', 'discord_api_403', 'discord_api_404',
  'discord_api_429', 'discord_api_unavailable', 'discord_oauth_unavailable',
  'invalid_oauth_token', 'no_primary_entry_point', 'wrong_application',
  'discord_update_rejected', 'discord_verification_failed', 'worker_error',
  'd1_state_read_failed', 'discord_oauth_fetch_failed', 'discord_oauth_invalid_json',
  'discord_commands_fetch_failed', 'discord_commands_invalid_json',
  'discord_update_fetch_failed', 'discord_update_invalid_json',
  'discord_verify_fetch_failed', 'discord_verify_invalid_json',
  'd1_state_write_failed',
]);
export function launchConfigurationIssue(env: LaunchSyncEnv): string | null {
  if (!env.DISCORD_CLIENT_ID || !/^\d{15,22}$/.test(env.DISCORD_CLIENT_ID)) return 'missing_app_id';
  if (!env.DISCORD_CLIENT_SECRET) return 'missing_client_secret';
  if (!/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '')) return 'missing_public_key';
  return null;
}
export function launchFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Discord command authorization: HTTP ')) {
    const code = message.split(' ').at(-1);
    return STATUS_VALUES.has('discord_oauth_' + code) ? 'discord_oauth_' + code : 'discord_oauth_unavailable';
  }
  if (message.startsWith('Discord command API: HTTP ')) {
    const code = message.split(' ').at(-1);
    return STATUS_VALUES.has('discord_api_' + code) ? 'discord_api_' + code : 'discord_api_unavailable';
  }
  if (message.includes('authorization returned no access token')) return 'invalid_oauth_token';
  if (message.includes('Expected one primary entry command')) return 'no_primary_entry_point';
  if (message.includes('did not acknowledge APP_HANDLER')) return 'discord_update_rejected';
  if (message.includes('did not persist APP_HANDLER')) return 'discord_verification_failed';
  if (STATUS_VALUES.has(message)) return message;
  return 'worker_error';
}
export async function recordLaunchSyncStatus(env: LaunchSyncEnv, code: string, now: number) {
  const safeCode = STATUS_VALUES.has(code) ? code : 'worker_error';
  await env.DB.prepare(`INSERT INTO service_state(key,value,checked_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,checked_at=excluded.checked_at`)
    .bind(STATUS_KEY, safeCode, now).run();
}
export async function checkDiscordLaunch(env: LaunchSyncEnv, now: number): Promise<void> {
  const issue = launchConfigurationIssue(env);
  if (issue) {
    await recordLaunchSyncStatus(env, issue, now);
    console.warn('Discord entry point verification blocked:', issue);
    return;
  }
  try {
    const result = await synchronizeDiscordLaunch(env, now);
    if (result !== 'skipped') {
      await recordLaunchSyncStatus(env, result, now);
      console.info('Discord entry point verification:', result);
    }
  } catch (error) {
    const code = launchFailureCode(error);
    await recordLaunchSyncStatus(env, code, now);
    console.error('Discord entry point verification failed:', code);
  }
}

// Authenticated sessions provide an immediate fallback when Cron delivery is delayed.
// Recent attempts in D1 prevent clients from repeatedly hitting Discord's API.
export async function checkDiscordLaunchAfterAuth(
  env: LaunchSyncEnv, now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const previous = await env.DB.prepare(
    'SELECT checked_at FROM service_state WHERE key=?'
  ).bind(STATUS_KEY).first<{ checked_at: number }>()
    .catch(() => null);
  if (previous && now - previous.checked_at >= 0 && now - previous.checked_at < 120) return;
  await checkDiscordLaunch(env, now);
}

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
  ).bind(STATE_KEY).first<StoredSync>()
    .catch(() => { throw new Error('d1_state_read_failed'); });
  if (state?.value === appId && now - state.checked_at < VERIFY_INTERVAL_SECONDS) return 'skipped';

  // A client credentials token only updates this application's own commands.
  const tokenResponse = await fetch(`${API}/oauth2/token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      grant_type: 'client_credentials', scope: 'applications.commands.update',
      client_id: appId, client_secret: env.DISCORD_CLIENT_SECRET,
    }),
  }).catch(() => { throw new Error('discord_oauth_fetch_failed'); });
  if (!tokenResponse.ok) throw new Error(`Discord command authorization: HTTP ${tokenResponse.status}`);
  const tokenData = await tokenResponse.json().catch(() => {
    throw new Error('discord_oauth_invalid_json');
  }) as { access_token?: unknown };
  if (typeof tokenData.access_token !== 'string' || !tokenData.access_token)
    throw new Error('Discord command authorization returned no access token');
  const headers = {
    Authorization: `Bearer ${tokenData.access_token}`,
    'Content-Type': 'application/json',
  };
  const root = `${API}/applications/${appId}/commands`;
  async function discord<T>(url: string, stage: 'commands' | 'update' | 'verify', init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000), ...init,
    }).catch(() => { throw new Error(`discord_${stage}_fetch_failed`); });
    // Never include response bodies in errors: OAuth/provider responses may be sensitive.
    if (!response.ok) throw new Error(`Discord command API: HTTP ${response.status}`);
    return await response.json().catch(() => { throw new Error(`discord_${stage}_invalid_json`); }) as T;
  }
  const commands = await discord<Entry[]>(root, 'commands');
  if (!Array.isArray(commands)) throw new Error('Discord command list was invalid');
  const candidates = commands.filter(command => command.type === 4 && command.application_id === appId);
  if (candidates.length !== 1 || !/^\d{15,22}$/.test(candidates[0].id))
    throw new Error(`Expected one primary entry command for the PaperStreet application, got ${candidates.length}`);
  const entry = candidates[0];

  // Force an initial re-registration even if the reported handler is already 1.
  // This can refresh stale client-side command versions after earlier configuration.
  const mustPatch = entry.handler !== 1 || !state || state.value !== appId;
  if (mustPatch) {
    const updated = await discord<Entry>(`${root}/${entry.id}`, 'update', {
      method: 'PATCH', body: JSON.stringify({ handler: 1 }),
    });
    if (updated.id !== entry.id || updated.application_id !== appId || updated.handler !== 1)
      throw new Error('Discord did not acknowledge APP_HANDLER for the selected entry point');
  }
  const verified = await discord<Entry>(`${root}/${entry.id}`, 'verify');
  if (verified.id !== entry.id || verified.application_id !== appId || verified.handler !== 1)
    throw new Error('Discord did not persist APP_HANDLER; the automatic invitation remains enabled');

  await env.DB.prepare(`INSERT INTO service_state(key,value,checked_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,checked_at=excluded.checked_at`)
    .bind(STATE_KEY, appId, now).run()
    .catch(() => { throw new Error('d1_state_write_failed'); });
  console.info(`PaperStreet Discord entry point verified: APP_HANDLER (1), command version ${verified.version ?? 'unknown'}`);
  return mustPatch ? 'updated' : 'verified';
}
