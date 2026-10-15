// Captures every screenshot the feature PDF uses, into ./shots, from the dev server on :5199.
import fs from 'fs';
const OUT = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await sleep(300); } }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
const view = (h) => send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true });
const hideDemoBar = () => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Exit demo')); if(b){let p=b.parentElement; while(p && p.parentElement && p.parentElement!==document.body && !p.className.includes('justify-center')) p=p.parentElement; (p||b.parentElement).style.display='none';} return 1})()`);
const shot = async (n) => { await hideDemoBar(); await sleep(150); const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}${n}.png`, Buffer.from(r.result.data, 'base64')); console.log('shot', n); };
const click = (txt) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(txt)}); if(b){b.click();return true} return false})()`);
const go = async (hash, wait = 1600) => { await send('Page.navigate', { url: B + hash }); await sleep(wait); };
const B = 'http://localhost:5199/';
await send('Page.enable');

// 2. Demo mode.
await send('Page.navigate', { url: B }); await sleep(1500);
await ev(`localStorage.clear(); localStorage.setItem('chipsplit_mode','demo'); localStorage.setItem('chipsplit_theme','light'); 1`);
await send('Page.reload'); await sleep(2500);
await view(844); await go('#/'); await shot('dashboard');
await go('#/groups'); await shot('groups');
const clubUrl = await ev(`(()=>{const a=[...document.querySelectorAll('a[href^="#/groups/"]')].find(a=>a.textContent.includes('Friday club')); return a && a.getAttribute('href')})()`);
const tripUrl = await ev(`(()=>{const a=[...document.querySelectorAll('a[href^="#/groups/"]')].find(a=>a.textContent.includes('Goa trip')); return a && a.getAttribute('href')})()`);
await view(1300); await go(clubUrl); await shot('club-games');
const game = await ev(`[...document.querySelectorAll('a[href*="/games/"]')].map(x=>x.getAttribute('href'))[0]`);
console.log('game', game);
await view(844); await go(clubUrl + '?tab=balances'); await shot('balances');
await go(game, 2000); await shot('game-live');
await ev(`document.querySelector('button[aria-label^="Rebuy"][aria-label$="for Suki"]').click()`); await sleep(300);
await ev(`document.querySelector('button[aria-label^="Rebuy"][aria-label$="for Suki"]').click()`); await sleep(3000);
await ev(`document.querySelector('button[aria-label="Suki gives chips back"]').click()`); await sleep(500);
await shot('panel');
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Done')?.click()`); await sleep(300);
// A Rummy group with one game a few hands in, made through the demo API.
const rummyUrl = await ev(`(async()=>{
  const { demoApi } = await import('/src/api/demoApi.ts');
  const d = await demoApi.loadAll(); const g = d.groups.find((x) => x.kind === 'rummy');
  const id = await demoApi.createRummyGame({ groupId: g.id, name: 'Game 1', pointLimit: 101, buyInCents: 1000, players: g.members.map((m) => ({ name: m.name, userId: m.user_id })) });
  const game = await demoApi.loadRummyGame(id);
  const ids = game.players.map((p) => p.id);
  for (const pts of [[0, 25, 40, 10], [20, 0, 35, 30], [15, 40, 0, 25]]) await demoApi.addRummyRound(id, ids.map((p, i) => ({ playerId: p, points: pts[i] })));
  return '#/groups/' + g.id + '|#/rummy/' + id;
})()`);
await send('Page.reload'); await sleep(2000);
await go(rummyUrl.split('|')[0]); await shot('rummy');
await go(rummyUrl.split('|')[1]); await shot('rummy-game');
await go('#/groups'); await click('New group'); await sleep(700); await shot('new-group');
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Cancel')?.click()`); await sleep(300);
// One-on-one expense with More options open.
await go('#/friends'); await shot('friends');
const friend = await ev(`[...document.querySelectorAll('a[href^="#/friends/"]')].map(a=>a.getAttribute('href'))[0]`);
await go(friend); await click('Add expense'); await sleep(800);
await shot('expense');
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim().startsWith('More options'))?.click()`); await sleep(400);
await shot('expense-more');
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Cancel')?.click()`); await sleep(300);
await go(tripUrl); await shot('trip');
await go(tripUrl + '?tab=settle'); await shot('trip-settle');

// New since the first PDF: friend page, Add a friend (both kinds), members & roles, History restore.
await go(friend); await shot('friend-detail');
await view(1400); await go(friend); await shot('friend-detail-full'); await view(844);
await go('#/friends'); await click('Add friend'); await sleep(700); await shot('add-friend');
await ev(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Guest, no email')?.click()`); await sleep(300);
await shot('add-friend-guest');
await go(tripUrl + '?tab=members'); await shot('members');
await ev(`(async()=>{ const { demoApi } = await import('/src/api/demoApi.ts'); const d = await demoApi.loadAll(); const g = d.groups.find(g=>g.name.includes('Goa trip')); await demoApi.deleteExpense(g.expenses[0].id); return 1 })()`);
await send('Page.reload'); await sleep(2000);
await go(tripUrl + '?tab=history'); await shot('history-restore');

// 3. The share images themselves, made by the app's own code from the demo data.
const imgs = await ev(`(async () => {
  const { seedDemo } = await import('/src/api/seed.ts');
  const L = await import('/src/lib/ledger.ts');
  const I = await import('/src/lib/summaryImage.ts');
  const d = seedDemo();
  const club = d.groups.find((g) => g.kind === 'club');
  const live = club.sessions.find((s) => s.status === 'open');
  const fin = club.sessions.filter((s) => s.status === 'final').sort((a, b) => b.played_on.localeCompare(a.played_on))[0];
  const name = (id) => L.memberName(club, id);
  const liveRows = live.results.map((r, i) => ({ ...r, buy_in_cents: [15000, 10000, 5000, 10000][i] ?? r.buy_in_cents, returned_cents: i === 1 ? 4000 : 0, cash_out_cents: i === 2 ? 3000 : 0 }));
  const toUrl = (b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  const finSum = L.gameTableData(club, fin, fin.results);
  return {
    live: await toUrl(await I.summaryPng(L.gameTableData(club, live, liveRows), name, 'table')),
    final: await toUrl(await I.summaryPng(finSum, name, 'table')),
    'final-settle': await toUrl(await I.summaryPng(finSum, name, 'settle')),
    balances: await toUrl(await I.summaryPng(L.summaryData(club), name, 'stands')),
    'balances-settle': await toUrl(await I.summaryPng(L.summaryData(club), name, 'settle')),
  };
})()`);
for (const [k, v] of Object.entries(imgs || {})) { fs.writeFileSync(`${OUT}img-${k}.png`, Buffer.from(v.split(',')[1], 'base64')); console.log('image', k); }
process.exit(0);
