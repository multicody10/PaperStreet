// Configure and verify the Discord primary entry point. No credentials are printed.
// --verify checks Discord and PaperStreet without modifying the command.
const verifyOnly = process.argv.includes('--verify');
const clientId = process.env.DISCORD_CLIENT_ID?.trim();
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
if (!/^\d{15,22}$/.test(clientId ?? '') || !clientSecret) {
  throw new Error('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in your gitignored .dev.vars.');
}

const workerOrigin = (process.env.PAPERSTREET_WORKER_URL || 'https://paperstreet.gobydev.workers.dev').replace(/\/$/, '');
const configResponse = await fetch(`${workerOrigin}/api/config`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
if (!configResponse.ok) throw new Error(`PaperStreet Worker config unavailable: HTTP ${configResponse.status}`);
const config = await configResponse.json();
if (config.clientId !== clientId)
  throw new Error(`Application mismatch: .dev.vars has ${clientId}, deployed Worker reports ${config.clientId || 'missing client ID'}. Fix this before modifying Discord commands.`);
if (!config.interactionsConfigured)
  throw new Error('The deployed PaperStreet Worker lacks a valid DISCORD_PUBLIC_KEY secret. Discord interactions cannot be verified.');

const api = 'https://discord.com/api/v10';
const tokenResponse = await fetch(`${api}/oauth2/token`, {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
  body: new URLSearchParams({
    grant_type: 'client_credentials', scope: 'applications.commands.update',
    client_id: clientId, client_secret: clientSecret,
  }),
});
if (!tokenResponse.ok) throw new Error(`Discord command authorization failed (HTTP ${tokenResponse.status}).`);
const { access_token } = await tokenResponse.json();
if (!access_token) throw new Error('Discord did not return a command access token.');
const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
const commandsUrl = `${api}/applications/${clientId}/commands`;

async function readJson(url, options = {}) {
  const result = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8000), ...options });
  if (!result.ok) {
    const message = await result.text().catch(() => '');
    throw new Error(`Discord API HTTP ${result.status}: ${message.slice(0, 240)}`);
  }
  return result.json();
}
const commands = await readJson(commandsUrl);
if (!Array.isArray(commands)) throw new Error('Discord returned an invalid global command listing.');
const entryPoints = commands.filter(command => command.type === 4);
if (entryPoints.length !== 1)
  throw new Error(`Expected one Discord global PRIMARY_ENTRY_POINT command, found ${entryPoints.length}. Check the application ID and Activities configuration.`);
const command = entryPoints[0];
if (command.application_id !== clientId)
  throw new Error('Discord returned a primary entry point belonging to another application.');

console.log(`PaperStreet application: ${clientId}`);
console.log(`Discord entry point: ${command.name} (ID ${command.id})`);
console.log(`Current handler: ${command.handler === 1 ? 'APP_HANDLER (1)' : command.handler === 2 ? 'DISCORD_LAUNCH_ACTIVITY (2), which auto-posts an invite' : String(command.handler)}`);
console.log(`Command version: ${command.version ?? 'not reported'}`);

if (!verifyOnly && command.handler !== 1) {
  const updated = await readJson(`${commandsUrl}/${command.id}`, {
    method: 'PATCH', body: JSON.stringify({ handler: 1 }),
  });
  if (updated.id !== command.id || updated.handler !== 1)
    throw new Error('Discord did not confirm switching the intended entry point to APP_HANDLER.');
}

const actual = await readJson(`${commandsUrl}/${command.id}`);
console.log(`Verified handler from Discord: ${actual.handler} (${actual.handler === 1 ? 'APP_HANDLER' : 'AUTOMATIC INVITE'})`);
console.log(`Verified command ID: ${actual.id}, version: ${actual.version ?? 'not reported'}`);
if (actual.handler !== 1) {
  throw new Error(verifyOnly
    ? 'Discord is still using its automatic launch-and-invite handler. Run this script without --verify.'
    : 'Discord did not persist APP_HANDLER. The unwanted invite will continue until this succeeds.');
}
console.log('Discord reports APP_HANDLER for the correct PaperStreet application. The Worker replies LAUNCH_ACTIVITY (12) with no follow-up message.');
console.log('If the invite still appears, reload the Discord client (Ctrl+R) and check the PaperStreet Worker logs for an incoming launch. No launch log indicates Discord bypassed the Worker.');
