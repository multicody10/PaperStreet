import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {tradeMessage,verifiedActivityChannel,deliverTradeNotifications} from '../worker/trade-notifications';

const user='123456789012345678';
const channel='987654321098765432';
const row={
  tradeId:9,userId:user,channelId:channel,queued:true,
  symbol:'NVDA' as const,side:'BUY' as const,shares:4,
  priceCents:12345,executedAt:1795000000,
  displayName:'@everyone**Trader',avatarHash:null,avatarDiscriminator:null,attempts:0,
};

test('only the signed user and channel may be associated with an order',async()=>{
 const seen:unknown[][]=[];
 const db={prepare(){return{
   bind(...args:unknown[]){seen.push(args);return this;},
   async first(){return {channel_id:channel};},
 }}} as unknown as D1Database;
 assert.equal(await verifiedActivityChannel(db,user,channel,10000),channel);
 assert.deepEqual(seen,[[user,channel,6400]]);
 assert.equal(await verifiedActivityChannel(db,user,'forged'),null);
 assert.equal(await verifiedActivityChannel(db,'bad',channel),null);
 assert.equal(seen.length,1);
});

test('queued fill pings only its owner, immediate fill never pings',()=>{
 const queued=tradeMessage(row);
 assert.equal(queued.content,`<@${user}> your queued buy order has filled!`);
 assert.deepEqual(queued.allowed_mentions,{parse:[],users:[user]});
 assert.equal(queued.embeds[0].color,0x31d49d);
 assert.match(queued.embeds[0].fields[3].value,/\$493\.80/);
 assert.doesNotMatch(queued.embeds[0].author.name,/@|\*/);
 assert.equal(queued.nonce,'paperstreet-fill-9');
 const instant=tradeMessage({...row,queued:false,side:'SELL'});
 assert.equal(instant.content,'');
 assert.deepEqual(instant.allowed_mentions,{parse:[],users:[]});
 assert.equal(instant.embeds[0].color,0xd95468);
});

test('every recorded trade with a verified channel creates an outbox event, including queued fills',()=>{
 const db=new DatabaseSync(':memory:');
 try{
   db.exec(`CREATE TABLE players(user_id TEXT PRIMARY KEY);
     CREATE TABLE queued_orders(user_id TEXT,client_order_id TEXT);
     CREATE TABLE trades(id INTEGER PRIMARY KEY,user_id TEXT,client_order_id TEXT,
       symbol TEXT,side TEXT,shares INTEGER,price_cents INTEGER,executed_at INTEGER);`);
   db.exec(readFileSync(new URL('../migrations/0015_trade_notifications.sql',import.meta.url),'utf8'));
   db.prepare('INSERT INTO players VALUES(?)').run(user);
   db.prepare('INSERT INTO queued_orders(user_id,client_order_id,channel_id) VALUES(?,?,?)')
     .run(user,'queued',channel);
   db.prepare('INSERT INTO trades(id,user_id,client_order_id,symbol,side,shares,price_cents) VALUES(?,?,?,?,?,?,?)')
     .run(1,user,'queued','NVDA','BUY',4,12345);
   db.prepare('INSERT INTO trades(id,user_id,client_order_id,symbol,side,shares,price_cents,channel_id) VALUES(?,?,?,?,?,?,?,?)')
     .run(2,user,'instant','AAPL','SELL',1,22500,channel);
   db.prepare('INSERT INTO trades(id,user_id,client_order_id,symbol,side,shares,price_cents) VALUES(?,?,?,?,?,?,?)')
     .run(3,user,'absent','AAPL','BUY',1,22500);
   assert.deepEqual(db.prepare('SELECT trade_id,channel_id,queued FROM trade_notifications ORDER BY trade_id').all().map(row=>({...row})),[
     {trade_id:1,channel_id:channel,queued:1},
     {trade_id:2,channel_id:channel,queued:0},
   ]);
 }finally{db.close()}
});

test('dispatch sends one correct queued ping and claims/sends exactly once',async t=>{
 const statements:{sql:string;args:unknown[]}[]=[];
 const env={DISCORD_BOT_TOKEN:'test-bot-token',DB:{
   prepare(sql:string){
     const statement={sql,args:[] as unknown[]};
     statements.push(statement);
     return {
       bind(...args:unknown[]){statement.args=args;return this;},
       async all(){return {results:[row]};},
       async first(){return {trade_id:row.tradeId};},
       async run(){return {success:true};},
     };
   },
 }} as unknown as Parameters<typeof deliverTradeNotifications>[0];
 const posted:{url:string;headers:HeadersInit|undefined;body:any}[]=[];
 t.mock.method(globalThis,'fetch',async(url:RequestInfo|URL,init?:RequestInit)=>{
   posted.push({url:String(url),headers:init?.headers,body:JSON.parse(String(init?.body))});
   return Response.json({id:'777777777777777777'});
 });
 assert.equal(await deliverTradeNotifications(env,1795000100,row.tradeId),1);
 assert.equal(posted.length,1);
 assert.equal(posted[0].url,'https://discord.com/api/v10/channels/'+channel+'/messages');
 assert.equal(posted[0].body.content,`<@${user}> your queued buy order has filled!`);
 assert.equal(posted[0].body.enforce_nonce,true);
 assert.ok(statements.some(s=>s.sql.includes("status='SENT'")));
});
