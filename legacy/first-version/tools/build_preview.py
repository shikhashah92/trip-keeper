#!/usr/bin/env python3
"""Build dist/preview.html: a copy of app/index.html that works inside the Claude artifact viewer.

The viewer blocks alert/confirm/prompt, downloads, print, service workers and sometimes IndexedDB,
so this swaps in in-page replacements and seeds a clearly marked sample trip.
Usage: python3 tools/build_preview.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / 'app' / 'index.html').read_text()
style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
body = re.search(r'<body>(.*)</body>', src, re.S).group(1)

# ---------- CSS ----------
m = re.search(r'@media\(prefers-color-scheme:dark\)\{:root\{(.*?)\}\}', style)
dv = m.group(1)
style = style.replace(m.group(0), '@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){' + dv + ';color-scheme:dark}}\n:root[data-theme="dark"]{' + dv + ';color-scheme:dark}')
assert 'padding:calc(14px + env(safe-area-inset-top)) 16px 10px' in style
style = style.replace('padding:calc(14px + env(safe-area-inset-top)) 16px 10px', 'padding:14px 16px 10px')
assert 'main{padding:0 14px 16px' in style
style = style.replace('main{padding:0 14px 16px', 'main{padding:0 16px 16px')
style += """
#toast{position:fixed;left:16px;right:16px;bottom:calc(92px + env(safe-area-inset-bottom,0px));max-width:608px;margin:0 auto;z-index:80;background:var(--ink);color:var(--bg);padding:12px 14px;border-radius:10px;display:none;text-align:center;font-size:14px}
#toast.show{display:block}
#ask{position:fixed;inset:0;background:#0008;z-index:90;display:flex;align-items:center;justify-content:center;padding:16px}
#ask .dlg{background:var(--card);color:var(--ink);border-radius:14px;padding:16px;width:100%;max-width:340px}
"""


# ---------- JS ----------
def rep(old, new, cnt=1):
    global body
    assert body.count(old) == cnt, (body.count(old), old[:70])
    body = body.replace(old, new)


# no print button (print dialog is blocked in the viewer)
rep('<button class="btn alt" id="tbPrint">🖨️ PDF</button>', '')
rep(" $('#tbPrint').onclick=printPlan;", "")
# service worker not available in the viewer
rep("if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});", "")
# in-page confirm (browser dialogs never show in the viewer)
rep("confirm(", "await ask(", 6)
body = re.sub(r"async function pinOff\(\)\{.*?\n\}\n", """function pinOff(){
  sheet(`<h3>Remove PIN</h3><label>Current PIN</label><input id="po" type="password" inputmode="numeric" autocomplete="off"><button class="btn" id="po_go">Remove PIN</button><button class="btn alt" id="po_x">Cancel</button>`);
  $('#po_x').onclick=closeSheet;
  $('#po_go').onclick=async()=>{ if(await hashPin($('#po').value,pinRec.salt)!==pinRec.hash){ alert('Wrong PIN.'); return; } await del('meta','pin'); pinRec=null; closeSheet(); render(); };
}
""", body, count=1, flags=re.S)
assert 'prompt(' not in body

# storage with in-memory fallback
rep("const getAll = s => P(store(s).getAll());", "const mem={items:new Map(),bookings:new Map(),files:new Map(),expenses:new Map(),meta:new Map()};\nconst getMeta = k => db ? P(store('meta').get(k)) : Promise.resolve(mem.meta.get(k));\nconst getAll = s => db ? P(store(s).getAll()) : Promise.resolve([...mem[s].values()]);")
rep("const put = (s,v) => P(store(s,'readwrite').put(v));", "const put = (s,v) => db ? P(store(s,'readwrite').put(v)) : (mem[s].set(v.id??v.k,v),Promise.resolve());")
rep("const del = (s,id) => P(store(s,'readwrite').delete(id));", "const del = (s,id) => db ? P(store(s,'readwrite').delete(id)) : (mem[s].delete(id),Promise.resolve());")
rep("const clearAll = () => Promise.all(['items','bookings','files','expenses','meta'].map(s=>P(store(s,'readwrite').clear())));", "const clearAll = () => Promise.all(['items','bookings','files','expenses','meta'].map(s=>db?P(store(s,'readwrite').clear()):Promise.resolve(mem[s].clear())));")
rep("const t = await P(store('meta').get('trip')); if(t) trip = t;", "const t = await getMeta('trip'); if(t) trip = t;")
rep("pinRec = (await P(store('meta').get('pin'))) || null;", "pinRec = (await getMeta('pin')) || null;")

# helpers: toast, ask, download shim, sample trip
rep("/* ---------- nearby ---------- */", r"""/* ---------- viewer helpers ---------- */
function toast(m){ let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t); } t.textContent=m; t.className='show'; clearTimeout(toast.h); toast.h=setTimeout(()=>{ t.className=''; },3400); }
window.alert=toast;
const ask=msg=>new Promise(res=>{ const o=document.createElement('div'); o.id='ask';
  o.innerHTML=`<div class="dlg"><div>${esc(msg)}</div><div class="row"><button class="btn alt" id="ask_n">Cancel</button><button class="btn" id="ask_y">OK</button></div></div>`;
  document.body.appendChild(o); const done=v=>{ o.remove(); res(v); };
  o.querySelector('#ask_n').onclick=()=>done(false); o.querySelector('#ask_y').onclick=()=>done(true); });
const _ac=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.hasAttribute('download')){ toast('Saving files works in the installed app on your phone, not in this preview.'); return; } return _ac.call(this); };

/* ---------- sample trip ---------- */
async function loadSample(){
  const d=n=>addDays(today(),n);
  trip={k:'trip',name:'Sample: Spain',start:d(0),end:d(5),final:true,home:'INR',rates:{EUR:95},budget:120000,country:'Spain',lastCur:'EUR'};
  await put('meta',trip);
  const B=[
    {type:'flight',title:'BOM → MAD',ref:'XK92LM',start:d(0)+'T02:40',end:d(0)+'T07:55',place:'Madrid Barajas Airport'},
    {type:'hotel',title:'Hotel Gran Vía',ref:'GV55012',start:d(0)+'T15:00',end:d(2)+'T11:00',place:'Gran Vía 34, Madrid'},
    {type:'train',title:'Renfe Madrid → Barcelona',ref:'RN8841',start:d(2)+'T13:00',end:d(2)+'T15:45',place:'Madrid Atocha Station'},
    {type:'hotel',title:'Hotel Arts Barcelona',ref:'HAB48213',start:d(2)+'T16:30',end:d(5)+'T11:00',place:'Carrer de la Marina 19, Barcelona'}];
  for(const b of B) await put('bookings',{id:uid(),notes:'',...b});
  const I=[[0,'13:30','Lunch at Mercado de San Miguel','Mercado de San Miguel, Madrid'],[0,'17:00','Prado Museum','Museo del Prado, Madrid'],
    [1,'10:00','Royal Palace tour','Palacio Real, Madrid'],[1,'20:30','Tapas in La Latina','La Latina, Madrid'],
    [3,'10:00','Sagrada Família tour','Sagrada Família, Barcelona'],[4,'11:00','Park Güell','Park Güell, Barcelona']];
  for(const [n,t,title,place] of I) await put('items',{id:uid(),date:d(n),time:t,title,place,notes:''});
  const X=[[0,35,'transport','Airport taxi'],[0,28.5,'food','Lunch at the market'],[0,15,'sights','Museum tickets']];
  for(const [n,amount,cat,desc] of X) await put('expenses',{id:uid(),date:d(n),amount,currency:'EUR',cat,desc});
  await load();
}
const seeded=()=>{ try{ return localStorage.getItem('tk-seeded')==='1'; }catch(_){ return false; } };
const markSeeded=()=>{ try{ localStorage.setItem('tk-seeded','1'); }catch(_){} };

/* ---------- nearby ---------- */""")
rep("function viewHome(){", "function viewHome0(){")
rep("function viewPlan0(){", r"""function viewHome(){
  viewHome0();
  if((trip.name||'').startsWith('Sample:')) $('#main').insertAdjacentHTML('afterbegin','<div class="card"><span class="badge warn">Sample trip</span><div class="hint" style="margin-top:6px">Example data so you can look around. Add your own, or clear it in More → Delete everything.</div></div>');
}

function viewPlan0(){""")
rep("db = await open(); await load(); render(); if(pinRec) showLock();",
    "try{ db = await open(); }catch(_){ db = null; }\n  await load();\n  if(!trip.start&&!items.length&&!bookings.length&&!expenses.length&&!seeded()){ await loadSample(); markSeeded(); }\n  render(); if(pinRec) showLock();")

out = '<title>Trip Keeper</title>\n<style>' + style + '</style>\n' + body.strip() + '\n'
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
(dist / 'preview.html').write_text(out)
print('wrote', dist / 'preview.html', len(out), 'bytes')
