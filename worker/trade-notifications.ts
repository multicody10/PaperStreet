import { isBuySide, orderLabel, tradeVerb, displaySideSql } from '../shared/gameplay';
import type { Trade } from '../shared/stocks';
import { discordAvatarUrl } from './avatar';
import type { MarketEnv } from './market';
import type { SymbolCode } from '../shared/stocks';

export interface TradeNotificationEnv extends MarketEnv { DISCORD_BOT_TOKEN?: string }
export const discordSnowflake = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{15,22}$/.test(value);

export async function verifiedActivityChannel(
  db: D1Database, userId: string, claimed: unknown, now = Math.floor(Date.now()/1000),
): Promise<string | null> {
  if (!discordSnowflake(userId) || !discordSnowflake(claimed)) return null;
  const match = await db.prepare('SELECT channel_id FROM activity_launch_channels WHERE user_id=? AND channel_id=? AND verified_at>=?')
    .bind(userId,claimed,now-3600).first<{channel_id:string}>();
  return match?.channel_id ?? null;
}

export type TradeAnnouncement = {
  tradeId:number; userId:string; channelId:string; queued:boolean;
  symbol:SymbolCode; side:Trade['side']; shares:number; priceCents:number; executedAt:number;
  displayName:string; avatarHash:string|null; avatarDiscriminator:string|null;
};
const currency = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const money = (cents:number) => currency.format(cents/100);
const safeName = (name:string) => name.replace(/[\r\n<>@*_~`|]/g,'').trim().slice(0,48)||'Trader';

export function tradeMessage(row:TradeAnnouncement) {
  const buy = isBuySide(row.side);
  const name = safeName(row.displayName);
  return {
    content:row.queued ? `<@${row.userId}> your queued ${orderLabel(row.side).toLowerCase()} order has filled!`:'',
    allowed_mentions:{parse:[],users:row.queued?[row.userId]:[]},
    embeds:[{
      title:`${buy?'📈':'📉'} ${row.queued?'Queued Order Filled':'Paper Trade Executed'} · ${row.symbol}`,
      description:`**${name}** ${tradeVerb(row.side).toLowerCase()} **${row.shares.toLocaleString('en-US')}** ${row.shares===1?'share':'shares'} of **${row.symbol}**.`,
      color:buy?0x31d49d:0xd95468,
      author:{name:name+' • Virtual Trader',icon_url:discordAvatarUrl(row.userId,row.avatarHash,row.avatarDiscriminator)},
      fields:[
        {name:'Action',value:row.side==='BUY'?'Shares Purchased':row.side==='SELL'?'Shares Sold':row.side==='SHORT'?'Short Position Opened':'Short Position Covered',inline:true},
        {name:'Shares',value:row.shares.toLocaleString('en-US'),inline:true},
        {name:'Fill price',value:money(row.priceCents),inline:true},
        {name:'Total value',value:`**${money(row.shares*row.priceCents)}**`,inline:true},
        {name:'Order type',value:row.queued?'Queued order':'Immediate market',inline:true},
      ],
      footer:{text:'PaperStreet • Paper money only • Verified Finnhub fill'},
      timestamp:new Date(row.executedAt*1000).toISOString(),
    }],
    nonce:'paperstreet-fill-'+row.tradeId,
    enforce_nonce:true,
  };
}
type Row = TradeAnnouncement & {attempts:number};
const query=`SELECT n.trade_id AS tradeId,n.user_id AS userId,n.channel_id AS channelId,
  n.queued AS queued,n.attempts,t.symbol,${displaySideSql('t.')} AS side,t.shares,t.price_cents AS priceCents,
  t.executed_at AS executedAt,p.display_name AS displayName,p.avatar_hash AS avatarHash,
  p.avatar_discriminator AS avatarDiscriminator
  FROM trade_notifications n JOIN trades t ON t.id=n.trade_id
  JOIN players p ON p.user_id=n.user_id`;

export async function deliverTradeNotifications(
  env:TradeNotificationEnv, now=Math.floor(Date.now()/1000), onlyTradeId?:number,
):Promise<number> {
  if (!env.DISCORD_BOT_TOKEN) return 0;
  const {results} = await env.DB.prepare(query+` WHERE
    ((n.status='PENDING' AND n.retry_at<=?) OR
     (n.status='PROCESSING' AND n.claimed_at<?))
    ${onlyTradeId?'AND n.trade_id=?':''} ORDER BY n.trade_id LIMIT 12`)
    .bind(now,now-150,...(onlyTradeId?[onlyTradeId]:[])).all<Row>();
  let delivered=0;
  for (const row of results) {
    if (!discordSnowflake(row.channelId)||!discordSnowflake(row.userId)) continue;
    const lease=await env.DB.prepare(`UPDATE trade_notifications SET status='PROCESSING',
      claimed_at=? WHERE trade_id=? AND ((status='PENDING' AND retry_at<=?)
      OR (status='PROCESSING' AND claimed_at<?)) RETURNING trade_id`)
      .bind(now,row.tradeId,now,now-150).first<{trade_id:number}>();
    if (!lease) continue;
    let code=0,messageId:string|null=null,delay=0;
    try {
      const response=await fetch(`https://discord.com/api/v10/channels/${row.channelId}/messages`,{
        method:'POST',
        headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'Content-Type':'application/json'},
        body:JSON.stringify(tradeMessage({...row,queued:Boolean(row.queued)})),
        signal:AbortSignal.timeout(8000),
      });
      code=response.status;
      if(response.ok){
        const payload=await response.json() as {id?:unknown};
        if(discordSnowflake(payload.id))messageId=payload.id;
        else code=502;
      } else if(code===429){
        const retry=Number(response.headers.get('Retry-After'));
        delay=Number.isFinite(retry)&&retry>0?Math.min(3600,Math.ceil(retry)+2):60;
      }
    } catch { code=0; }
    if(messageId){
      await env.DB.prepare(`UPDATE trade_notifications SET status='SENT',
        discord_message_id=?,claimed_at=NULL WHERE trade_id=? AND claimed_at=?`)
        .bind(messageId,row.tradeId,now).run();
      delivered++;
    }else{
      const permanent=[400,401,403,404].includes(code)||row.attempts>=9;
      await env.DB.prepare(`UPDATE trade_notifications SET status=?,attempts=attempts+1,
        retry_at=?,claimed_at=NULL WHERE trade_id=? AND claimed_at=?`)
        .bind(permanent?'BLOCKED':'PENDING',
          now+(delay||Math.min(3600,30*2**Math.min(row.attempts,7))),
          row.tradeId,now).run();
      console.error('PaperStreet trade announcement',permanent?'blocked':'retry',code);
    }
  }
  return delivered;
}
