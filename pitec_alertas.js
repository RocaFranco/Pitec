/* ===== Pitec · Alertas de stock mínimo =====
   Calcula, por su cuenta (sin abrir las pantallas), qué hay bajo mínimo en:
   - Stock MP   → mínimo por GRUPO de material (col "Grupo" + "Mínimo" en Cat Materia Prima).
                  Se suman TODOS los códigos del grupo: un código en 0 no alerta si el grupo tiene stock.
   - Stock Varios → mínimo por ARTÍCULO (col "Mínimo" en Cat Varios).
   Devuelve { mp:{low,items:[{grupo,total,min}]}, varios:{low,items:[{art,stock,min}]} }.
   Pensado para que el shell muestre el chip de aviso. Tolera columnas/datos faltantes (no alerta). */
(function(){
  const _num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const _key = v => String(v || '').trim();

  window.alertasStock = async function(){
    const vacio = { mp:{low:false,items:[]}, varios:{low:false,items:[]} };
    if(typeof apiGet !== 'function' || (typeof apiListo === 'function' && !apiListo())) return vacio;

    let cat, entMP, retMP, lam, h1, h2, matLam, matHil, cv, entV, retV;
    try {
      [cat, entMP, retMP, lam, h1, h2, matLam, matHil, cv, entV, retV] = await Promise.all([
        apiGet({action:'read',sheet:'Cat Materia Prima'}),
        apiGet({action:'read',sheet:'Entrada MP'}),
        apiGet({action:'read',sheet:'Retiro MP'}),
        apiGet({action:'read',sheet:'Laminadora'}),
        apiGet({action:'read',sheet:'Hiladora 1'}),
        apiGet({action:'read',sheet:'Hiladora 2'}),
        apiGet({action:'read',sheet:'Material Laminadora'}),
        apiGet({action:'read',sheet:'Material Hiladoras'}),
        apiGet({action:'read',sheet:'Cat Varios'}),
        apiGet({action:'read',sheet:'Entrada Varios'}),
        apiGet({action:'read',sheet:'Retiro Varios'}),
      ]);
    } catch(e){ return vacio; }

    // ===== MP: stock por código (igual que pitec_stock_mp), agrupado por CATEGORÍA =====
    const grupoOf = {}, minG = {};
    (cat||[]).forEach(r=>{
      const c=_key(r['Código']); if(!c) return;
      const g=_key(r['Categoría'])||c;     // grupo = categoría; sin categoría → su propio código
      grupoOf[c]=g;
      const m=_num(r['Mínimo']); if(m>0) minG[g]=Math.max(minG[g]||0,m);
    });
    const entra={}, retiro={}, cons={};
    const add=(o,c,k)=>{ c=_key(c); if(c) o[c]=(o[c]||0)+_num(k); };
    (entMP||[]).forEach(r=>add(entra,r['Código MP'],r['Kg']));
    (retMP||[]).forEach(r=>add(retiro,r['Código MP'],r['Kg']));
    const LAM=[['Código PP','Kg PP'],['Código PE','Kg PE'],['Código Master','Kg Master'],['Código Reciclado','Kg Reciclado']];
    const HIL=[['Código Carbonato','Kg Carbonato'],['Código Master','Kg Master'],['Código PP','Kg PP'],['Código Reciclado','Kg Reciclado']];
    (lam||[]).forEach(r=>LAM.forEach(p=>add(cons,r[p[0]],r[p[1]])));
    [h1,h2].forEach(hh=>(hh||[]).forEach(r=>HIL.forEach(p=>add(cons,r[p[0]],r[p[1]]))));
    (matLam||[]).forEach(r=>add(cons,r['Código'],r['Kg']));
    (matHil||[]).forEach(r=>add(cons,r['Código'],r['Kg']));
    const cods=[...new Set([...Object.keys(grupoOf),...Object.keys(entra),...Object.keys(retiro),...Object.keys(cons)])];
    const grpTot={};
    cods.forEach(c=>{ const st=(entra[c]||0)-(cons[c]||0)-(retiro[c]||0); const g=grupoOf[c]||c; grpTot[g]=(grpTot[g]||0)+st; });
    const mpItems=[];
    Object.keys(minG).forEach(g=>{ const tot=grpTot[g]||0; if(tot<minG[g]) mpItems.push({grupo:g,total:tot,min:minG[g]}); });

    // ===== Varios: stock por artículo (igual que pitec_stock_varios) =====
    const catRows=cv||[];
    const minByArt={};
    catRows.forEach(r=>{ const a=_key(r['Artículo']); if(a){ const m=_num(r['Mínimo']); if(m>0) minByArt[a]=m; } });
    const catArt=catRows.map(r=>_key(r['Artículo'])).filter(Boolean);
    let autoSet=new Set(catRows.filter(r=>_key(r['Descuento'])).map(r=>_key(r['Artículo'])).filter(Boolean));
    if(!autoSet.size && catArt.includes('Cuchillas ABB-50')) autoSet=new Set(['Cuchillas ABB-50']);
    let cuchHil=0; [h1,h2].forEach(hh=>(hh||[]).forEach(r=>cuchHil+=_num(r['Unidades Cuchillas'])));
    const cuchArt=catRows.filter(r=>_key(r['Descuento']).toLowerCase().includes('hilad')).map(r=>_key(r['Artículo']))[0]
                 || [...autoSet][0] || (catArt.includes('Cuchillas ABB-50')?'Cuchillas ABB-50':null);
    const entraV={}, retV2={};
    const addV=(o,a,c)=>{ a=_key(a); if(a) o[a]=(o[a]||0)+_num(c); };
    (entV||[]).forEach(r=>addV(entraV,r['Artículo'],r['Cantidad']));
    (retV||[]).forEach(r=>addV(retV2,r['Artículo'],r['Cantidad']));
    const arts=[...new Set([...catArt,...Object.keys(entraV),...Object.keys(retV2)])];
    const varItems=[];
    arts.forEach(a=>{ const e=entraV[a]||0; let s=retV2[a]||0; if(a===cuchArt) s+=cuchHil; const stock=e-s;
      const min=minByArt[a]; if(min!=null && stock<min) varItems.push({art:a,stock,min}); });

    return { mp:{low:mpItems.length>0,items:mpItems}, varios:{low:varItems.length>0,items:varItems} };
  };
})();
