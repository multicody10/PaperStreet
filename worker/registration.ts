// Registers only the /portfolio chat input command. Never reads or modifies
// Discord's PRIMARY_ENTRY_POINT ("Launch") or its handler setting.
type RegistrationEnv = {
  DB: D1Database;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_PUBLIC_KEY?: string;
};
type CommandRow = { last_attempt_at: number; checked_at: number; last_result: string; version: number };
type DiscordCommand = {
  id?: string; application_id?: string; name?: string; type?: number;
  description?: string;
};
const VERSION = 1;
const NAME = 'portfolio';
const DESCRIPTION = 'View your PaperStreet portfolio, holdings and profit or loss';
const API = 'https://discord.com/api/v10';

async function register(env: RegistrationEnv): Promise<'registered' | 'verified'> {
  const clientId = env.DISCORD_CLIENT_ID!;
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      grant_type: 'client_credentials', scope: 'applications.commands.update',
      client_id: clientId, client_secret: env.DISCORD_CLIENT_SECRET!,
    }),
  }).catch(() => { throw new Error('oauth_network_error'); });
  if (!response.ok) throw new Error(`oauth_http_${response.status}`);
  const oauth = await response.json().catch(() => null) as { access_token?: unknown } | null;
  if (typeof oauth?.access_token !== 'string' || !oauth.access_token)
    throw new Error('oauth_invalid_response');
  const headers = {
    Authorization: `Bearer ${oauth.access_token}`,
    'Content-Type': 'application/json',
  };
  const commandsUrl = `${API}/applications/${clientId}/commands`;
  async function discord(url: string, step: string, init: RequestInit = {}) {
    const result = await fetch(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(8000), ...init,
    }).catch(() => { throw new Error(`${step}_network_error`); });
    if (!result.ok) throw new Error(`${step}_http_${result.status}`);
    const json = await result.json().catch(() => null) as unknown;
    if (!json) throw new Error(`${step}_invalid_response`);
    return json;
  }
  const commands = await discord(commandsUrl, 'list');
  if (!Array.isArray(commands)) throw new Error('list_invalid_response');
  const found = (commands as DiscordCommand[]).find(command =>
    command.name === NAME && command.type === 1 && command.application_id === clientId);
  if (found?.description === DESCRIPTION && found.id) return 'verified';
  const created = await discord(commandsUrl, 'create', {
    method: 'POST',
    body: JSON.stringify({ type: 1, name: NAME, description: DESCRIPTION }),
  }) as DiscordCommand;
  if (created.name !== NAME || created.type !== 1 || created.application_id !== clientId ||
    !/^[0-9]{15,22}$/.test(created.id ?? ''))
    throw new Error('create_invalid_response');
  return 'registered';
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/^(oauth|list|create)_http_(400|401|403|404|429|500|502|503)$/.test(message)) return message;
  if (/^(oauth|list|create)_(network_error|invalid_response)$/.test(message)) return message;
  return 'unexpected_error';
}

// Called only by an authenticated GitHub deployment. No scheduler, cooldown or
// user-facing route can mutate registered commands.
export async function deployPortfolioCommand(
  env: RegistrationEnv, now = Math.floor(Date.now() / 1000),
): Promise<'registered' | 'verified'> {
  if (!env.DISCORD_CLIENT_ID || !/^\d{15,22}$/.test(env.DISCORD_CLIENT_ID) ||
    !env.DISCORD_CLIENT_SECRET || !/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '')) {
    throw new Error('missing_discord_configuration');
  }
  const previous = await env.DB.prepare(`SELECT version,checked_at,last_attempt_at,last_result
    FROM discord_command_registry WHERE name=?`).bind(NAME).first<CommandRow>();
  let outcome: string;
  try { outcome = await register(env); }
  catch (error) { outcome = safeError(error); }
  const success = outcome === 'registered' || outcome === 'verified';
  await env.DB.prepare(`INSERT INTO discord_command_registry
    (name,version,checked_at,last_attempt_at,last_result)
    VALUES(?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET
      version=excluded.version,checked_at=excluded.checked_at,
      last_attempt_at=excluded.last_attempt_at,last_result=excluded.last_result`)
    .bind(NAME, success ? VERSION : (previous?.version ?? 0),
      success ? now : (previous?.checked_at ?? 0), now, outcome).run();
  if (!success) throw new Error(outcome);
  console.info('PaperStreet /portfolio command verified during deployment:', outcome);
  return outcome as 'registered' | 'verified';
}
