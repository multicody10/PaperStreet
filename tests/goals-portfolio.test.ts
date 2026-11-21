import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Achievement, AchievementCode } from '../shared/gameplay';
import { achievementCategory, achievementCounts, goalProgress, sortGoals } from '../src/Challenges';

const a=(code:AchievementCode,progress:number,target:number,unlockedAt:number|null=null):Achievement=>({
  code,title:code,description:code,progress,target,unlockedAt,
});
const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const achievements:Achievement[]=[
  a('first_trade',1,1,1795000000),
  a('five_trades',3,5),
  a('five_assets',0,5),
  a('ten_predictions',2,10),
  a('three_correct',0,3),
];

test('achievement summary counts only real unlocks and progression',()=>{
  assert.deepEqual(achievementCounts(achievements),{
    total:5,completed:1,inProgress:2,notStarted:2,percent:20,
  });
  assert.deepEqual(achievementCounts([]),{
    total:0,completed:0,inProgress:0,notStarted:0,percent:0,
  });
});
test('progress clamps and honors server-side unlocks',()=>{
  assert.equal(goalProgress(a('five_trades',3,5)),60);
  assert.equal(goalProgress(a('first_trade',0,1,1795000000)),100);
  assert.equal(goalProgress(a('five_assets',9,5)),100);
  assert.equal(goalProgress(a('five_assets',-1,5)),0);
});
test('categories and sorting only use actual achievement codes',()=>{
  assert.equal(achievementCategory('five_assets'),'portfolio');
  assert.equal(achievementCategory('three_correct'),'forecasting');
  assert.equal(achievementCategory('first_trade'),'trading');
  assert.deepEqual(sortGoals(achievements,'forecasting','progress').map(x=>x.code),['ten_predictions','three_correct']);
  assert.deepEqual(sortGoals(achievements,'trading','progress').map(x=>x.code),['first_trade','five_trades']);
  assert.deepEqual(sortGoals(achievements,'all','progress').map(x=>x.code),[
    'first_trade','five_trades','ten_predictions','five_assets','three_correct'
  ]);
  assert.deepEqual(achievements.map(x=>x.code),['first_trade','five_trades','five_assets','ten_predictions','three_correct']);
});
test('removed History route opens Portfolio and global ticker retains market data',()=>{
  const routes=source('src/navigation.ts');
  const app=source('src/main.tsx');
  const dashboard=source('src/TradingDashboard.tsx');
  assert.match(routes,/if \(path === 'history'\) return \{ view: 'portfolio'/);
  assert.doesNotMatch(routes,/'leaderboard' \| 'history' \|/);
  assert.doesNotMatch(app,/\{ id: 'history', label:/);
  assert.match(app,/<PortfolioHistory trades=\{trades\}/);
  assert.match(app,/view === 'dashboard' \|\| view === 'portfolio'\)\s+jobs.push\(request<\{ trades: Trade\[\] \}>/);
  assert.match(app,/jobs.push\(request<\{ quotes: Quote\[\] \}>\('\/api\/market'/);
  assert.match(dashboard,/onClick=\{p\.onHistory\}/);
});
test('larger top ticker has correct directional arrow and consistent bordered dark cards',()=>{
  const app=source('src/main.tsx');
  const css=source('src/goals-portfolio.css');
  assert.match(app,/<TrendingUp size=\{16\} strokeWidth=\{2\.8\}\/>/);
  assert.match(app,/<TrendingDown size=\{16\} strokeWidth=\{2\.8\}\/>/);
  assert.match(css,/\.header-ticker b svg\{flex:none;width:16px;height:16px/);
  assert.match(css,/--bg:#060911/);
  assert.match(css,/--card-edge:#374355/);
  assert.match(css,/border:1px solid #374458!important/);
  assert.match(css,/\.goals-body\{display:grid/);
  assert.match(css,/\.details-stack\.portfolio-stack > \.portfolio-history-panel/);
  assert.match(css,/@media\(max-width:760px\)/);
});
test('Goals mirrors the reference without fabricated XP, streak, or prediction entry form',()=>{
  const sourceCode=source('src/Challenges.tsx');
  for(const component of ['goals-title','goals-stats','goals-primary','goals-featured',
    'goals-completion','goals-all','goals-unlocks','goals-category-tabs'])
    assert.ok(sourceCode.includes(component),component);
  assert.doesNotMatch(sourceCode,/XP\/Level|Current Streak|Trading Streak|Lock prediction|submitForecast/);
  assert.match(sourceCode,/goalPercent/);
  assert.match(sourceCode,/<FitPager key=\{category\+':'\+sort\}/);
  assert.match(sourceCode,/label="Goals panels"/);
});
