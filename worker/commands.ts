import { loadPortfolio } from './portfolio';
import { STARTING_CASH_CENTS, type Portfolio } from '../shared/stocks';
import type { MarketEnv } from './market';

export interface DiscordCommandEnv extends MarketEnv {
  DISCORD_CLIENT_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
}
type DiscordUser = { id?: string; username?: string; avatar?: string | null; discriminator?: string | null };
type DiscordInteraction = {
  id?: string; token?: string; application_id?: string; type?: number;
  member?: { user?: DiscordUser }; user?: DiscordUser;
  data?: { type?: number; name?: string };
};
type DiscordEmbed = {
  title?: string; description?: string; color?: number;
  author?: { name: string; icon_url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string }; timestamp?: string;
};
const encoder = new TextEncoder();
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (cents: number) => currency.format(cents / 100);
const signedMoney = (cents: number) => `${cents >= 0 ? '+' : '−'}${money(Math.abs(cents))}`;
const percent = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
const safeName = (name: string) =>
  name.replace(/[\r\n<>@*_~`|]/g, '').trim().slice(0, 48) || 'Trader';

function welcomeEmbed(): DiscordEmbed {
  return {
    title: '📈 Welcome to PaperStreet',
    description: `You don't have a portfolio yet. Launch the **PaperStreet Activity** once to create your virtual trading account with **${money(STARTING_CASH_CENTS)}**.`,
    color: 0x2eb87d,
    footer: { text: 'PaperStreet • Virtual stocks, real market prices' },
  };
}

export function portfolioEmbed(portfolio: Portfolio, avatarUrl?: string): DiscordEmbed {
  const change = portfolio.profitCents;
  const changePct = portfolio.startingCashCents
    ? change / portfolio.startingCashCents * 100 : 0;
  const ordered = [...portfolio.positions].sort((a, b) =>
    b.marketValueCents - a.marketValueCents || a.symbol.localeCompare(b.symbol));
  const lines = ordered.map(p => {
    const returnPct = p.costBasisCents ? p.profitCents / p.costBasisCents * 100 : 0;
    const arrow = p.profitCents >= 0 ? '↗' : '↘';
    return `**${p.symbol}** · ${p.shares.toLocaleString('en-US')} sh. · **${money(p.marketValueCents)}** · ${arrow} ${percent(returnPct)}`;
  });
  let display = '';
  let count = 0;
  for (const line of lines) {
    if (display.length + line.length + 2 > 940) break;
    display += (display ? '\n' : '') + line;
    count++;
  }
  if (ordered.length > count) display += `\n…and ${ordered.length - count} more positions`;
  const delayed = portfolio.positions.some(position => position.quote.stale);
  return {
    title: '📊 PaperStreet Portfolio',
    author: {
      name: `${safeName(portfolio.displayName)} • Virtual Trader`,
      ...(avatarUrl ? { icon_url: avatarUrl } : {}),
    },
    description: `**TOTAL EQUITY**\n**${money(portfolio.equityCents)}**\n${change >= 0 ? '📈' : '📉'} ${signedMoney(change)} (${percent(changePct)}) all time`,
    color: change >= 0 ? 0x28bb80 : 0xd95468,
    fields: [
      { name: '💵 Cash Available', value: money(portfolio.cashCents), inline: true },
      { name: '📈 Invested Value', value: money(portfolio.investedCents), inline: true },
      { name: '📊 Holdings', value: String(portfolio.positions.length), inline: true },
      { name: `Positions · ${portfolio.positions.length} stocks`, value: display || '*No open positions yet. Your entire balance is cash.*' },
    ],
    footer: { text: delayed
      ? 'Finnhub • Some quotes are stale • Virtual money only'
      : 'Finnhub verified quotes • Virtual money only' },
    timestamp: new Date().toISOString(),
  };
}

function toBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
export async function verifyDiscordRequest(request: Request, publicKey: string): Promise<DiscordInteraction | null> {
  if (!/^[0-9a-f]{64}$/i.test(publicKey)) return null;
  const signature = request.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;
  if (Number(request.headers.get('Content-Length') || 0) > 32_768) return null;
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > 32_768) return null;
  const signed = new Uint8Array(new ArrayBuffer(timestamp.length + body.byteLength));
  signed.set(encoder.encode(timestamp));
  signed.set(body, timestamp.length);
  try {
    const key = await crypto.subtle.importKey('raw', toBytes(publicKey), 'Ed25519', false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, toBytes(signature), signed)) return null;
    return JSON.parse(new TextDecoder().decode(body)) as DiscordInteraction;
  } catch { return null; }
}

async function completePortfolioCommand(
  env: DiscordCommandEnv, appId: string, token: string, userId: string,
): Promise<void> {
  let embed: DiscordEmbed;
  try {
    const value = await loadPortfolio(userId, env);
    embed = value ? portfolioEmbed(value.portfolio, value.avatarUrl) : welcomeEmbed();
  } catch {
    console.error('PaperStreet portfolio command: valuation unavailable');
    embed = {
      title: 'Portfolio temporarily unavailable',
      description: 'PaperStreet could not verify your latest holdings or market quotes. Try again shortly.',
      color: 0xd95468,
    };
  }
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;
  try {
    const response = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error('PaperStreet portfolio reply: Discord HTTP', response.status);
  } catch {
    console.error('PaperStreet portfolio reply: Discord request failed');
  }
}

export async function portfolioInteraction(
  request: Request, env: DiscordCommandEnv, ctx: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  const interaction = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY ?? '');
  if (!interaction) return new Response('Invalid Discord signature', { status: 401 });
  if (interaction.type === 1) return Response.json({ type: 1 });
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (typeof interaction.application_id !== 'string' || interaction.application_id !== env.DISCORD_CLIENT_ID ||
    interaction.type !== 2 || interaction.data?.type !== 1 ||
    interaction.data?.name !== 'portfolio' ||
    typeof userId !== 'string' || !/^\d{15,22}$/.test(userId) ||
    typeof interaction.token !== 'string' || interaction.token.length < 12 || interaction.token.length > 512) {
    return Response.json({
      type: 4, data: { flags: 64, content: 'Unsupported PaperStreet command.', allowed_mentions: { parse: [] } },
    });
  }
  // Acknowledge immediately within Discord's three-second deadline; perform D1
  // reads and Finnhub valuation asynchronously, then edit the original reply.
  ctx.waitUntil(completePortfolioCommand(env, interaction.application_id, interaction.token, userId));
  return Response.json({ type: 5 });
}
