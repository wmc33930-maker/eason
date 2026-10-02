'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-password';
const PUBLIC_BASE = (process.env.PUBLIC_BASE || '').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
const defaultDB = { prizes: [
  { name: 'SUPER 大獎', amount: 200000, probability: 0.1 },
  { name: '幸運獎', amount: 50000, probability: 0.9 },
  { name: '好運獎', amount: 10000, probability: 9 },
  { name: '安慰獎', amount: 1000, probability: 90 }
], cards: {}, dailyCounters: {} };
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2)); return structuredClone(defaultDB); }
}
let db = loadDB();
function saveDB() { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }
function taipeiDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, ''); }
function nextCardNumber() {
  const date = taipeiDate();
  const next = (db.dailyCounters[date] || 0) + 1;
  db.dailyCounters[date] = next;
  return `${date}-${String(next).padStart(3, '0')}`;
}
function pickPrize() {
  const r = Math.random() * 100;
  let sum = 0;
  for (const prize of db.prizes) { sum += Number(prize.probability); if (r < sum) return prize; }
  return db.prizes[db.prizes.length - 1];
}
function send(res, status, body, type='application/json; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); }
function readBody(req) { return new Promise((resolve, reject) => { let s=''; req.on('data', c => { s += c; if (s.length > 1024*1024) reject(new Error('Body too large')); }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function authorized(req) { return req.headers['x-admin-key'] === ADMIN_KEY; }
function adminPage() { return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>帶財商號｜刮刮卡後台</title><style>
*{box-sizing:border-box}body{margin:0;background:#180d0a;color:#f9e7bd;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}.wrap{max-width:980px;margin:auto;padding:20px}.panel{background:#2b1710;border:1px solid #b98a38;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 8px 25px #0005}h1{color:#ffd46b;margin:0 0 6px}.muted{color:#d0b98d;font-size:13px}input,button{font:inherit;border-radius:8px;padding:10px;border:1px solid #9c773c}input{background:#fff9e8;color:#26170d;max-width:100%;width:100%}button{background:#c91e13;color:#fff5d9;border:1px solid #ffcf65;font-weight:700;cursor:pointer}.btn2{background:#5b351d}.row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:center;margin:8px 0}.stats{display:flex;gap:12px;flex-wrap:wrap}.stats>*{flex:1;min-width:140px}@media(max-width:650px){.row{grid-template-columns:1fr 1fr}.row input:first-child{grid-column:span 2}.wrap{padding:12px}.panel{padding:13px}}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #684727;overflow-wrap:anywhere}a{color:#ffdc79}
</style><div class="wrap"><h1>帶財商號｜幸運刮刮卡</h1><div class="muted">財神爺模板・獎項設定・批次產生獨立網址</div><div id="login" class="panel"><h3>管理員登入</h3><input id="key" type="password" placeholder="輸入管理密鑰"><button style="margin-top:10px;width:100%" onclick="login()">登入後台</button><p class="muted">密鑰由網站管理者在環境變數 ADMIN_KEY 設定。</p></div><div id="app" hidden>
<div class="panel"><h2>獎項與中獎機率</h2><div id="prizes"></div><button class="btn2" onclick="addPrize()">＋ 新增獎項</button><p class="muted">所有機率加總必須等於 100%，才可儲存。</p><button onclick="savePrizes()">儲存獎項設定</button><div id="sum" class="muted"></div></div>
<div class="panel"><h2>批次建立刮刮卡</h2><label>建立張數（可輸入任意正整數）</label><input id="count" type="number" min="1" max="5000" value="200"><p class="muted">編號依台灣日期自動產生，例如 20261002-001；午夜重置，舊網址仍有效。</p><button onclick="createCards()">建立刮刮卡網址</button><div id="created"></div></div>
<div class="panel"><h2>已建立的卡片</h2><button class="btn2" onclick="loadCards()">重新整理列表</button><div style="overflow:auto;margin-top:10px"><table><thead><tr><th>編號</th><th>狀態</th><th>獎項</th><th>網址</th></tr></thead><tbody id="cards"></tbody></table></div></div></div></div>
<script>let K=sessionStorage.getItem('daicaiAdminKey')||'';const api=async(p,opts={})=>{const r=await fetch(p,{...opts,headers:{'Content-Type':'application/json','x-admin-key':K,...opts.headers}});const j=await r.json();if(!r.ok)throw Error(j.error||'操作失敗');return j};function login(){K=document.getElementById('key').value;api('/api/admin/prizes').then(()=>{sessionStorage.setItem('daicaiAdminKey',K);document.getElementById('login').hidden=true;document.getElementById('app').hidden=false;renderPrizes().then(loadCards)}).catch(e=>alert(e.message))}if(K){document.getElementById('key').value=K;login()}function prizeRows(items){document.getElementById('prizes').innerHTML=items.map((p,i)=>\`<div class="row"><input data-f="name" data-i="\${i}" value="\${esc(p.name)}" placeholder="獎項名稱"><input data-f="amount" data-i="\${i}" type="number" min="0" value="\${p.amount}" placeholder="金額"><input data-f="probability" data-i="\${i}" type="number" min="0" max="100" step="0.01" value="\${p.probability}" placeholder="機率 %"><button class="btn2" onclick="removePrize(\${i})">刪除</button></div>\`).join('');document.querySelectorAll('#prizes input').forEach(x=>x.addEventListener('input',updateSum));updateSum()}function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}async function renderPrizes(){const d=await api('/api/admin/prizes');prizeRows(d.prizes)}function collect(){let out=[];const rows=[...document.querySelectorAll('#prizes .row')];for(const row of rows){const v={};row.querySelectorAll('input').forEach(i=>v[i.dataset.f]=i.dataset.f==='name'?i.value:Number(i.value));out.push(v)}return out}function updateSum(){const s=collect().reduce((a,p)=>a+(Number(p.probability)||0),0);document.getElementById('sum').textContent='目前機率總和：'+s.toFixed(2)+'% '+(Math.abs(s-100)<0.001?'（符合 100%）':'（需調整至 100%）')}function addPrize(){const p=collect();p.push({name:'新獎項',amount:0,probability:0});prizeRows(p)}function removePrize(i){const p=collect();p.splice(i,1);prizeRows(p)}async function savePrizes(){try{const prizes=collect();await api('/api/admin/prizes',{method:'PUT',body:JSON.stringify({prizes})});alert('獎項設定已儲存')}catch(e){alert(e.message)}}async function createCards(){try{const count=Number(document.getElementById('count').value);const d=await api('/api/admin/cards',{method:'POST',body:JSON.stringify({count})});document.getElementById('created').innerHTML='<p>已建立 '+d.cards.length+' 張：</p>'+d.cards.slice(0,10).map(c=>\`<div><a target="_blank" href="\${c.url}">\${c.number}</a>　<button class="btn2" onclick="navigator.clipboard.writeText('\${c.url}')">複製網址</button></div>\`).join('')+(d.cards.length>10?'<p class="muted">其餘網址請在卡片列表查看。</p>':'');loadCards()}catch(e){alert(e.message)}}async function loadCards(){try{const d=await api('/api/admin/cards');document.getElementById('cards').innerHTML=d.cards.map(c=>\`<tr><td>\${esc(c.number)}</td><td>\${c.revealed?'已刮開':'未刮開'}</td><td>\${c.revealed?esc(c.prize.name)+' / '+c.prize.amount:'—'}</td><td><a target="_blank" href="\${c.url}">開啟</a> <button class="btn2" onclick="navigator.clipboard.writeText('\${c.url}')">複製</button></td></tr>\`).join('')}catch(e){}} </script></html>`; }
function cardPage(token) {
  const c = db.cards[token];
  if (!c) return '<!doctype html><meta charset="utf-8"><h2>找不到這張刮刮卡</h2>';
  const number = c.number;
  const shownPrize = c.revealed ? '<div class="prize">' + escapeHTML(c.prize.name) + '<br><b>' + String(Number(c.prize.amount)).replace(/,/g,'') + ' 星幣</b></div>' : '<div class="prize" id="prize">刮開看看你的幸運獎項！</div>';
  const canvas = c.revealed ? '' : '<canvas class="scratch" id="scratch"></canvas>';
  const button = c.revealed ? '' : '<button class="btn" id="reveal">查看刮獎結果</button>';
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>帶財商號｜幸運刮刮卡</title><style>*{box-sizing:border-box}body{margin:0;background:#260c08;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}.stage{width:min(100vw,600px);margin:0 auto;position:relative;aspect-ratio:2/3;background:url('/public/caishen-template.jpg') top/100% 100% no-repeat;overflow:hidden}.idplate{position:absolute;left:17%;top:28.1%;width:66%;height:14.4%;background:#fff0c8;display:flex;align-items:center;justify-content:center;color:#6b1b0e;font-size:clamp(16px,5vw,31px);font-weight:900;letter-spacing:1px;text-shadow:0 1px #fff}.prize{position:absolute;left:8.5%;top:45%;width:83%;height:27.8%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#68160d;font-size:clamp(18px,5vw,30px);font-weight:900;padding:12px}.prize b{font-size:1.25em;margin-top:10px}.scratch{position:absolute;left:8.5%;top:44.5%;width:83%;height:28%;touch-action:none;cursor:crosshair}.tip{text-align:center;color:#ffe7b2;padding:10px 18px;font-size:14px}.btn{display:block;margin:6px auto 20px;border:1px solid #ffcf65;border-radius:20px;background:#be2113;color:#fff0c8;padding:10px 24px;font-size:16px}.status{text-align:center;color:#ffe7b2;font-size:13px;padding:0 10px 18px}</style><div class="stage"><div class="idplate">${escapeHTML(number)}</div>${shownPrize}${canvas}</div><div class="tip">刮開銀色區域，看看你的幸運獎項</div><div class="status">請截圖保存結果，依活動規則向帶財商號確認。</div>${button}<script>const token=${JSON.stringify(token)};const canvas=document.getElementById('scratch');if(canvas){const ctx=canvas.getContext('2d');function setup(){const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1;canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.scale(d,d);const g=ctx.createLinearGradient(0,0,r.width,r.height);g.addColorStop(0,'#b9b9b9');g.addColorStop(.5,'#858585');g.addColorStop(1,'#c8c8c8');ctx.fillStyle=g;ctx.fillRect(0,0,r.width,r.height);ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillText('刮開看看你的幸運獎項',r.width/2,r.height/2);ctx.globalCompositeOperation='destination-out'}setup();let down=false;function erase(e){if(!down)return;const r=canvas.getBoundingClientRect(),p=e;ctx.beginPath();ctx.arc(p.clientX-r.left,p.clientY-r.top,22,0,Math.PI*2);ctx.fill()}canvas.addEventListener('pointerdown',e=>{down=true;canvas.setPointerCapture(e.pointerId);erase(e)});canvas.addEventListener('pointermove',erase);canvas.addEventListener('pointerup',()=>down=false);document.getElementById('reveal').onclick=async()=>{try{const r=await fetch('/api/card/'+token+'/reveal',{method:'POST'});const d=await r.json();if(!r.ok)throw Error(d.error);location.reload()}catch(e){alert(e.message)}}}</script></html>`;
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const server = http.createServer(async (req,res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (u.pathname === '/health') return send(res,200,{ok:true});
    if (u.pathname === '/public/caishen-template.jpg' && req.method==='GET') { const img=path.join(__dirname,'public','caishen-template.jpg'); res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400'}); return fs.createReadStream(img).pipe(res); }
    if (u.pathname === '/admin' && req.method==='GET') return send(res,200,adminPage(),'text/html; charset=utf-8');
    const cm = u.pathname.match(/^\/c\/([a-f0-9]{32})$/); if (cm && req.method==='GET') return send(res,200,cardPage(cm[1]),'text/html; charset=utf-8');
    if (u.pathname.startsWith('/api/admin/')) {
      if (!authorized(req)) return send(res,401,{error:'管理密鑰錯誤'});
      if (u.pathname==='/api/admin/prizes' && req.method==='GET') return send(res,200,{prizes:db.prizes});
      if (u.pathname==='/api/admin/prizes' && req.method==='PUT') { const b=await readBody(req); if(!Array.isArray(b.prizes)||!b.prizes.length) return send(res,400,{error:'至少需要一個獎項'}); const total=b.prizes.reduce((s,p)=>s+Number(p.probability),0); if(b.prizes.some(p=>!String(p.name||'').trim()||!Number.isFinite(Number(p.amount))||Number(p.amount)<0||!Number.isFinite(Number(p.probability))||Number(p.probability)<0)||Math.abs(total-100)>0.001) return send(res,400,{error:'獎項資料不完整，或中獎機率總和不是 100%'}); db.prizes=b.prizes.map(p=>({name:String(p.name).trim(),amount:Number(p.amount),probability:Number(p.probability)})); saveDB(); return send(res,200,{ok:true}); }
      if (u.pathname==='/api/admin/cards' && req.method==='POST') { const b=await readBody(req); const count=Number(b.count); if(!Number.isInteger(count)||count<1||count>5000) return send(res,400,{error:'張數請輸入 1 至 5000 的整數'}); const cards=[]; for(let i=0;i<count;i++){const token=crypto.randomBytes(16).toString('hex'); const card={number:nextCardNumber(),createdAt:new Date().toISOString(),revealed:false,prize:pickPrize()};db.cards[token]=card;cards.push({token,number:card.number,url:`${PUBLIC_BASE}/c/${token}`});} saveDB(); return send(res,201,{cards}); }
      if (u.pathname==='/api/admin/cards' && req.method==='GET') { const cards=Object.entries(db.cards).map(([token,c])=>({token,number:c.number,revealed:c.revealed,prize:c.revealed?c.prize:null,url:`${PUBLIC_BASE}/c/${token}`})).sort((a,b)=>b.number.localeCompare(a.number)); return send(res,200,{cards}); }
    }
    const reveal=u.pathname.match(/^\/api\/card\/([a-f0-9]{32})\/reveal$/); if(reveal&&req.method==='POST'){const c=db.cards[reveal[1]];if(!c)return send(res,404,{error:'找不到這張卡'});if(!c.revealed){c.revealed=true;c.revealedAt=new Date().toISOString();saveDB()}return send(res,200,{number:c.number,prize:c.prize,revealed:true})}
    return send(res,404,{error:'Not found'});
  } catch(e) { return send(res,500,{error:'伺服器錯誤'}); }
});
server.listen(PORT,'0.0.0.0',()=>console.log(`daicai scratch card listening on ${PORT}; data=${DATA_DIR}`));
