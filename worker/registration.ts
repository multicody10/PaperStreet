// Registers /portfolio and /paperstreet, and configures the existing
// PRIMARY_ENTRY_POINT for message-free Activity launch. Never deletes commands.
type RegistrationEnv = {
  DB: D1Database;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_PUBLIC_KEY?: string;
};
type CommandRow = { last_attempt_at: number; checked_at: number; last_result: string; version: number };
type DiscordCommand = {
  id?: string; application_id?: string; name?: string; type?: number;
  description?: string; integration_types?: number[]; contexts?: number[]; handler?: number;
};
const VERSION = 3;
const API = 'https://discord.com/api/v10';
const COMMANDS = [
  { name: 'portfolio', description: 'View your PaperStreet portfolio, holdings and profit or loss' },
  { name: 'paperstreet', description: 'Launch the PaperStreet stock trading Activity' },
] as const;
const INTEGRATION_TYPES = [0, 1]; // GUILD_INSTALL, USER_INSTALL
const CONTEXTS = [0, 1, 2]; // GUILD, BOT_DM, PRIVATE_CHANNEL
const sameValues = (actual: number[] | undefined, expected: number[]) =>
  Array.isArray(actual) && actual.length === expected.length &&
  new Set(actual).size === expected.length && expected.every(value => actual.includes(value));

async function register(env: RegistrationEnv): Promise<'registered' | 'verified'> {
  const clientId = env.DISCORD_CLIENT_ID!;
  const response = await fetch(`${API}/oauth2/token`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      grant_type: 'client_credentials', scope: 'applications.commands.update',
      client_id: clientId, client_secret: env.DISCORD_CLIENT_SECRET!,
    }),
  }).catch(() => { throw new Error('oauth_network_error'); });
  if (!response.ok) throw new Error(`oauth_http_${response.status}`);
  const oauth = await response.json().catch(() => null) as {access_token?: unknown} | null;
  if (typeof oauth?.access_token !== 'string' || !oauth.access_token)
    throw new Error('oauth_invalid_response');

  const headers = {
    Authorization: `Bearer ${oauth.access_token}`,
    'Content-Type': 'application/json',
  };
  const commandsUrl = `${API}/applications/${clientId}/commands`;
  async function discord(url: string, step: string, init: RequestInit = {}) {
    const result = await fetch(url, {
      headers, redirect: 'manual', signal: AbortSignal.timeout(8000), ...init,
    }).catch(() => { throw new Error(`${step}_network_error`); });
    if (!result.ok) throw new Error(`${step}_http_${result.status}`);
    const json = await result.json().catch(() => null) as unknown;
    if (!json) throw new Error(`${step}_invalid_response`);
    return json;
  }
  const commands = await discord(commandsUrl, 'list');
  if (!Array.isArray(commands)) throw new Error('list_invalid_response');
  const existing = commands as DiscordCommand[];
  let changed = false;
  for (const command of COMMANDS) {
    const found = existing.find(item =>
      item.name === command.name && item.type === 1 && item.application_id === clientId);
    if (found?.description === command.description && found.id &&
        sameValues(found.integration_types, INTEGRATION_TYPES) &&
        sameValues(found.contexts, CONTEXTS)) continue;

    const created = await discord(commandsUrl, 'create', {
      method: 'POST', // Upsert by command name and type, without replacing other commands.
      body: JSON.stringify({type: 1, name: command.name, description: command.description,
        integration_types: INTEGRATION_TYPES, contexts: CONTEXTS}),
    }) as DiscordCommand;
    if (created.name !== command.name || created.type !== 1 ||
        created.application_id !== clientId || !/^\d{15,22}$/.test(created.id ?? '') ||
        !sameValues(created.integration_types, INTEGRATION_TYPES) ||
        !sameValues(created.contexts, CONTEXTS))
      throw new Error('create_invalid_response');
    changed = true;
  }

  // APP_HANDLER (1) invokes our signed webhook. Its LAUNCH_ACTIVITY response
  // (12) opens the game without Discord posting a Game Invitation to the chat.
  const launch = existing.find(command =>
    command.type === 4 && command.application_id === clientId);
  if (!launch?.id || !/^\d{15,22}$/.test(launch.id))
    throw new Error('launch_missing');
  if (launch.handler !== 1) {
    const updated = await discord(`${commandsUrl}/${launch.id}`, 'launch', {
      method: 'PATCH', body: JSON.stringify({handler: 1}),
    }) as DiscordCommand;
    if (updated.id !== launch.id || updated.type !== 4 ||
        updated.application_id !== clientId || updated.handler !== 1)
      throw new Error('launch_invalid_response');
    changed = true;
  }
  return changed ? 'registered' : 'verified';
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/^(oauth|list|create|launch)_http_(400|401|403|404|429|500|502|503)$/.test(message))
    return message;
  if (/^(oauth|list|create|launch)_(network_error|invalid_response|missing)$/.test(message))
    return message;
  return 'unexpected_error';
}

// Called only by an authenticated GitHub deployment. No scheduler or
// user-facing route can modify registered commands or the Launch handler.
export async function deployPortfolioCommand(
  env: RegistrationEnv, now = Math.floor(Date.now() / 1000),
): Promise<'registered' | 'verified'> {
  if (!env.DISCORD_CLIENT_ID || !/^\d{15,22}$/.test(env.DISCORD_CLIENT_ID) ||
      !env.DISCORD_CLIENT_SECRET || !/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? ''))
    throw new Error('missing_discord_configuration');
  const previous = await env.DB.prepare(`SELECT version,checked_at,last_attempt_at,last_result
    FROM discord_command_registry WHERE name=?`).bind('portfolio').first<CommandRow>();
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
    .bind('portfolio', success ? VERSION : (previous?.version ?? 0),
      success ? now : (previous?.checked_at ?? 0), now, outcome).run();
  if (!success) throw new Error(outcome);
  console.info('PaperStreet /portfolio, /paperstreet and silent Launch verified:', outcome);
  return outcome as 'registered' | 'verified';
}
