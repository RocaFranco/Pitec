/* ===== Conexión al Sheet "Fabrica Pitec" (vía Apps Script Web App) =====
   Pegá acá la URL del Web App que te da Google al publicar el script. */
const PITEC_API_URL = 'https://script.google.com/macros/s/AKfycby3gTgUUe0gKoaWryN-EirEdYnS9qdGF2K8yIjTGrcW3Kp6UhV7xF11voNLzyEqIUYAJg/exec';

/* ===== Velocidad (sin datos viejos) =====
   La velocidad viene del AGRUPADO, NO de guardar datos viejos:
   - AGRUPADO: si en el mismo instante se piden varias pestañas (Promise.all), se manda UN solo
     pedido 'readmulti' en vez de N idas y vueltas (Apps Script las encola). Es un pedido FRESCO.
   - La caché es PRÁCTICAMENTE NULA (1,5s, solo en memoria): solo evita pedir DOS veces lo mismo
     en el mismísimo instante. No persiste: cada Ctrl+F5 y cada dispositivo leen siempre fresco. */
const _CACHE_TTL = 1500;   // 1,5 s — prácticamente nulo
const _mem = {};                // sheet -> {t, data}
let _pending = [];              // [{sheet, resolve, reject}]
let _flushTimer = null;
let _multiOk = true;            // si 'readmulti' no está deployado todavía, cae a lecturas sueltas

function _cacheGet(sheet){
  const e = _mem[sheet];                       // SOLO memoria (no persiste entre recargas)
  if(e && (Date.now()-e.t) < _CACHE_TTL) return e.data;
  return null;
}
function _cacheSet(sheet, data){
  _mem[sheet]={t:Date.now(), data};
}
function apiCacheClear(){
  for(const k in _mem) delete _mem[k];
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
        else if(obj && obj.error) _multiOk=false;   // definitivo: backend viejo sin 'readmulti'
        // si falló transitorio dejamos multi=null y caemos a lecturas sueltas SOLO esta vez
      }catch(_){ /* transitorio: NO desactivar readmulti; esta vez cae a lecturas sueltas */ }
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
/* fetch con TIMEOUT (corta cuelgues) + REINTENTO. Solo para LECTURAS (es seguro reintentar leer).
   Las escrituras (apiPost) NUNCA se reintentan solas para no duplicar cargas. */
async function _fetchJsonRetry(url, opts){
  opts=opts||{}; const tries=opts.tries||2, timeoutMs=opts.timeoutMs||20000, validate=opts.validate;
  let lastErr;
  for(let i=0;i<tries;i++){
    const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const r=await fetch(url,{signal:ctrl.signal}); clearTimeout(to);
      const j=await r.json();
      if(validate && !validate(j)) throw new Error('respuesta inválida');
      return j;
    }catch(e){ clearTimeout(to); lastErr=e; if(i<tries-1) await new Promise(s=>setTimeout(s,1200)); }
  }
  throw lastErr;
}
async function _rawRead(sheet){
  return _fetchJsonRetry(PITEC_API_URL+'?action=read&sheet='+encodeURIComponent(sheet), {validate:Array.isArray});
}
async function _rawReadMulti(sheets){
  // sin validar la forma: si el backend no soporta readmulti devuelve {error} y _flush lo maneja
  return _fetchJsonRetry(PITEC_API_URL+'?action=readmulti&sheets='+encodeURIComponent(sheets.join(',')));
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
