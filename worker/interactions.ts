type InteractionEnv = { DISCORD_CLIENT_ID: string; DISCORD_PUBLIC_KEY: string };

const encoder = new TextEncoder();
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16));

export async function discordInteraction(request: Request, env: InteractionEnv): Promise<Response> {
  if (!env.DISCORD_CLIENT_ID || !/^[0-9a-f]{64}$/i.test(env.DISCORD_PUBLIC_KEY ?? '')) {
    return new Response('Discord interactions are not configured', { status: 503 });
  }
  const signature = request.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return new Response('Invalid signature', { status: 401 });
  }

  // Discord signs the ASCII timestamp followed by the exact HTTP body bytes.
  const body = new Uint8Array(await request.arrayBuffer());
  const signed = new Uint8Array(timestamp.length + body.length);
  signed.set(encoder.encode(timestamp));
  signed.set(body, timestamp.length);
  const key = await crypto.subtle.importKey('raw', fromHex(env.DISCORD_PUBLIC_KEY), 'Ed25519', false, ['verify']);
  if (!await crypto.subtle.verify('Ed25519', key, fromHex(signature), signed)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const interaction = await new Response(body).json().catch(() => null) as {
    application_id?: string; type?: number; data?: { type?: number };
  } | null;
  if (interaction?.type === 1) return Response.json({ type: 1 }); // PING → PONG
  if (interaction?.application_id !== env.DISCORD_CLIENT_ID) {
    return new Response('Invalid interaction', { status: 400 });
  }
  if (interaction.type === 2 && interaction.data?.type === 4) {
    // Logs no user, channel, token or signature data. If this log is absent during
    // an unwanted invite, Discord is still routing Play through its native handler.
    console.info('PaperStreet received primary entry point launch; returning type 12');
    return Response.json({ type: 12 }); // PRIMARY_ENTRY_POINT → LAUNCH_ACTIVITY
  }
  return new Response('Unsupported interaction', { status: 400 });
}
