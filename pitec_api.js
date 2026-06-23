/* ===== Conexión al Sheet "Fabrica Pitec" (vía Apps Script Web App) =====
   Pegá acá la URL del Web App que te da Google al publicar el script. */
const PITEC_API_URL = 'https://script.google.com/macros/s/AKfycby3gTgUUe0gKoaWryN-EirEdYnS9qdGF2K8yIjTGrcW3Kp6UhV7xF11voNLzyEqIUYAJg/exec';

/* ===== Velocidad =====
   1) CACHÉ por pestaña en sessionStorage → la comparten el shell y los iframes (misma pestaña
      del navegador) y sobrevive a los Ctrl+F5. TTL corto. Se borra sola al guardar (apiPost).
   2) AGRUPADO automático: si en el mismo instante se piden varias pestañas (Promise.all),
      se manda UN solo pedido 'readmulti' en vez de N idas y vueltas (Apps Script las encola). */
const _CACHE_TTL = 60 * 1000;   // 60s
const _mem = {};                // sheet -> {t, data}
let _pending = [];              // [{sheet, resolve, reject}]
let _flushTimer = null;
let _multiOk = true;            // si 'readmulti' no está deployado todavía, cae a lecturas sueltas

function _cacheGet(sheet){
  let e = _mem[sheet];
  if(!e){ try{ const s=sessionStorage.getItem('pcache:'+sheet); if(s){ e=JSON.parse(s); _mem[sheet]=e; } }catch(_){} }
  if(e && (Date.now()-e.t) < _CACHE_TTL) return e.data;
  return null;
}
function _cacheSet(sheet, data){
  const e={t:Date.now(), data}; _mem[sheet]=e;
  try{ sessionStorage.setItem('pcache:'+sheet, JSON.stringify(e)); }catch(_){}
}
function apiCacheClear(){
  for(const k in _mem) delete _mem[k];
  try{ Object.keys(sessionStorage).forEach(k=>{ if(k.indexOf('pcache:')===0) sessionStorage.removeItem(k); }); }catch(_){}
}

/* GET: leer datos. Ej: apiGet({action:'read',sheet:'Telares'}) / apiGet({action:'stock'}) */
async function apiGet(params){
  const a=(params.action||'').toLowerCase();
  if(a==='read' && params.sheet && Object.keys(params).length===2) return _readSheet(params.sheet);
  const url = PITEC_API_URL + '?' + new URLSearchParams(params).toString();
  const r = await fetch(url);
  return r.json();
}
function _readSheet(sheet){
  const c=_cacheGet(sheet); if(c!==null) return Promise.resolve(c);
  return new Promise((resolve,reject)=>{
    _pending.push({sheet,resolve,reject});
    if(!_flushTimer) _flushTimer=setTimeout(_flush,0);
  });
}
async function _flush(){
  _flushTimer=null;
  const batch=_pending; _pending=[];
  const need=[...new Set(batch.map(b=>b.sheet))].filter(s=>_cacheGet(s)===null);
  if(need.length){
    const got={};   // sheet -> array (SOLO las que salieron bien; nunca cacheamos errores)
    let multi=null;
    if(need.length>1 && _multiOk){
      try{ const obj=await _rawReadMulti(need);
        if(obj && typeof obj==='object' && !Array.isArray(obj) && !obj.error && need.some(s=>Array.isArray(obj[s]))) multi=obj;
        else _multiOk=false;   // backend viejo sin 'readmulti' → de ahora en más, lecturas sueltas
      }catch(_){ _multiOk=false; }
    }
    if(multi){ need.forEach(s=>{ if(Array.isArray(multi[s])) got[s]=multi[s]; }); }
    else {     // lecturas sueltas; las que fallan quedan SIN cachear para reintentar luego
      const res=await Promise.allSettled(need.map(s=>_rawRead(s)));
      need.forEach((s,i)=>{ if(res[i].status==='fulfilled') got[s]=res[i].value; });
    }
    Object.keys(got).forEach(s=>_cacheSet(s,got[s]));
  }
  batch.forEach(b=>{ const d=_cacheGet(b.sheet); if(d!==null) b.resolve(d); else b.reject(new Error('No se pudo leer '+b.sheet)); });
}
async function _rawRead(sheet){
  const r=await fetch(PITEC_API_URL+'?action=read&sheet='+encodeURIComponent(sheet));
  const j=await r.json(); if(!Array.isArray(j)) throw new Error('read '+sheet); return j;
}
async function _rawReadMulti(sheets){
  const r=await fetch(PITEC_API_URL+'?action=readmulti&sheets='+encodeURIComponent(sheets.join(','))); return r.json();
}

/* POST: escribir. Content-Type text/plain para evitar el preflight CORS de Apps Script.
   Escapo TODO lo no-ASCII a \uXXXX para que los acentos (ej "Día") no se corrompan
   al decodificar el body en Apps Script (su cold-start a veces no lo lee como UTF-8). */
function asciiSafe_(s){
  return s.replace(/[^\x00-\x7F]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}
async function apiPost(body){
  const r = await fetch(PITEC_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: asciiSafe_(JSON.stringify(body))
  });
  const j = await r.json();
  apiCacheClear();   // tras escribir, invalidar la caché para releer fresco
  return j;
}

function apiListo(){ return PITEC_API_URL && PITEC_API_URL.indexOf('PEGAR_ACA') === -1; }

/* ===== Fechas a prueba de zona horaria =====
   El Sheet/Apps Script serializa las fechas como "...Z" (UTC) aunque sean HORA DE PARED local.
   new Date(eso) corre la zona (-3 hs en Argentina): una fecha solo-día (00:00Z) cae al día
   anterior y una hora 12:30 se muestra 09:30. pDate arma un Date con los MISMOS números del
   texto, sin convertir zona. Usar pDate(v) en lugar de new Date(v) para CUALQUIER valor del Sheet. */
function pDate(v){
  if(v==null||v==='') return null;
  if(v instanceof Date) return isNaN(v)?null:v;
  if(typeof v==='string'){
    const m=v.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if(m) return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
    // dd/mm/yyyy por las dudas
    const m2=v.match(/(\d{2})\/(\d{2})\/(\d{4})/); if(m2) return new Date(+m2[3],+m2[2]-1,+m2[1]);
  }
  const d=new Date(v); return isNaN(d)?null:d;
}
