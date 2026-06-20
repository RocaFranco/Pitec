/* ===== Conexión al Sheet "Fabrica Pitec" (vía Apps Script Web App) =====
   Pegá acá la URL del Web App que te da Google al publicar el script. */
const PITEC_API_URL = 'https://script.google.com/macros/s/AKfycby3gTgUUe0gKoaWryN-EirEdYnS9qdGF2K8yIjTGrcW3Kp6UhV7xF11voNLzyEqIUYAJg/exec';

/* GET: leer datos. Ej: apiGet({action:'stock'}) / apiGet({action:'read',sheet:'Telares'}) */
async function apiGet(params){
  const url = PITEC_API_URL + '?' + new URLSearchParams(params).toString();
  const r = await fetch(url);
  return r.json();
}

/* POST: escribir. Content-Type text/plain para evitar el preflight CORS de Apps Script.
   Escapo TODO lo no-ASCII a \uXXXX para que los acentos (ej "Dia"/"Dia") no se corrompan
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
  return r.json();
}

function apiListo(){ return PITEC_API_URL && PITEC_API_URL.indexOf('PEGAR_ACA') === -1; }
