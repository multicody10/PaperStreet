// Run locally once the deployed interactions URL passes Discord's verification.
const clientId = process.env.DISCORD_CLIENT_ID?.trim();
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
if (!/^\d{15,22}$/.test(clientId ?? '') || !clientSecret) {
  throw new Error('Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET for the PaperStreet application.');
}

const api = 'https://discord.com/api/v10';
const tokenResponse = await fetch(`${api}/oauth2/token`, {
  method: 'POST',
  redirect: 'error',
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
const list = await fetch(commandsUrl, { headers, redirect: 'error' });
if (!list.ok) throw new Error(`Could not read Discord commands (HTTP ${list.status}).`);
const entry = (await list.json()).find(command => command.type === 4);
if (!entry) throw new Error('Enable Activities in the Discord Developer Portal to create the Launch entry point.');
if (entry.handler !== 1) {
  const update = await fetch(`${commandsUrl}/${entry.id}`, {
    method: 'PATCH', redirect: 'error', headers, body: JSON.stringify({ handler: 1 }),
  });
  if (!update.ok) throw new Error(`Could not update the Launch handler (HTTP ${update.status}).`);
  if ((await update.json()).handler !== 1) throw new Error('Discord did not confirm the app-handled entry point.');
}
console.log('Discord Play now uses the PaperStreet launch handler.');
