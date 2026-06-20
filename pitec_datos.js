/* ===== Datos compartidos Pitec — PARCHE de prototipo =====
   Espejo de la pestaña "Cat Materia Prima" del Sheet (Franco la mantiene ahí).
   Al conectar el sistema, esto se reemplaza por lectura directa del Sheet.
   uso: Laminadora / Hiladora / Ambas / SIN USO (SIN USO no aparece en ningún desplegable). */
const MP_CATALOGO=[
 {cod:'XSD 6200T',cat:'PP',uso:'Laminadora'},
 {cod:'PP H-103',cat:'PP',uso:'Laminadora'},
 {cod:'1100T',cat:'PP',uso:'Laminadora'},
 {cod:'LYD6200K',cat:'PP',uso:'Hiladora'},
 {cod:'1102L',cat:'PP',uso:'Hiladora'},
 {cod:'KYD 6110',cat:'PP',uso:'Hiladora'},
 {cod:'1102K',cat:'PP',uso:'Hiladora'},
 {cod:'PP H 503HS',cat:'PP',uso:'Hiladora'},
 {cod:'PG 480',cat:'PP',uso:'Hiladora'},
 {cod:'9048',cat:'Master',uso:'Hiladora'},
 {cod:'30080',cat:'Master',uso:'Laminadora'},
 {cod:'30040',cat:'Master',uso:'Laminadora'},
 {cod:'AMARILLO 114247',cat:'Master',uso:'Laminadora'},
 {cod:'VERDE 113227',cat:'Master',uso:'Laminadora'},
 {cod:'60SW',cat:'Master',uso:'Laminadora'},
 {cod:'1001 BR',cat:'Carbonato',uso:'Hiladora'},
 {cod:'APC',cat:'Recuperado',uso:'SIN USO'},
 {cod:'ALTA PLASTICA',cat:'Recuperado',uso:'Ambas'},
 {cod:'APP',cat:'Recuperado',uso:'Ambas'},
 {cod:'722',cat:'PE',uso:'Laminadora'},
 {cod:'BC818',cat:'PE',uso:'Laminadora'},
 {cod:'REC INDDARNYL',cat:'Recuperado',uso:'Hiladora'},
 {cod:'901021',cat:'Master',uso:'SIN USO'},
];
/* <option>s filtrados por categoría y máquina. SIN USO nunca aparece (no matchea sector ni 'Ambas'). */
function mpOptions(cat, sector){
  const list = MP_CATALOGO.filter(m=>
      (!cat || m.cat===cat) && (!sector || m.uso===sector || m.uso==='Ambas')
    ).map(m=>m.cod);
  return '<option value="">— Elegir código —</option>'+list.map(c=>'<option>'+c+'</option>').join('');
}
