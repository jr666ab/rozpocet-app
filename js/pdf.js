/* ===== Tisk / PDF nabídky =====
   Návrh řešení: čistá tisková stránka + systémový dialog "Uložit jako PDF".
   Výhoda: bezchybná čeština (žádné problémy s fonty), nulové závislosti.
   Později jde vyměnit za pdf-lib s vloženým fontem, layout zůstane stejný. */

/* posun data o N měsíců (pro platnost nabídky) */
function plusMesicu(datumISO, mesicu){
  const [y, m, d] = datumISO.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1 + mesicu, d);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function tiskniNabidku(akce){
  const n = DB.data.nastaveni || {};
  const s = nabidkaSoucty(akce);

  // datum vystavení se uloží při prvním tisku a už se nemění
  if (!akce.nabidkaVystavena) { akce.nabidkaVystavena = U.dnes(); DB.uloz(); }
  const vystavena = akce.nabidkaVystavena;
  const platnostDo = plusMesicu(vystavena, 6);

  const radky = akce.nabidka.map((p, i) => {
    const celkem = U.num(p.mnozstvi) * U.num(p.jednotkovaCenaBezDph);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${U.esc(p.nazev)}</td>
      <td class="r">${U.mn(p.mnozstvi)}</td>
      <td class="c">${U.esc(p.jednotka || '')}</td>
      <td class="r">${U.kc(p.jednotkovaCenaBezDph)}</td>
      <td class="r">${U.kc(celkem)}</td>
    </tr>`;
  }).join('');

  const rozpadDph = `<tr><td>DPH ${s.sazba} %</td><td class="r">${U.kc(s.dphCelkem)}</td></tr>`;

  const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<title>Nabídka – ${U.esc(akce.nazev)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#152523;padding:34px;font-size:13px}
  h1{font-size:22px;color:#0b5d57;margin-bottom:2px}
  .hlava{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}
  .firma{text-align:right;font-size:12px;line-height:1.5}
  .firma b{font-size:14px}
  .info{margin-bottom:16px;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin-bottom:14px}
  th{background:#e6f2f0;color:#0b5d57;font-size:11.5px;text-transform:uppercase;letter-spacing:.3px}
  th,td{border:1px solid #cfe0dd;padding:6px 8px;text-align:left}
  .r{text-align:right;white-space:nowrap} .c{text-align:center;white-space:nowrap}
  .soucty{width:auto;margin-left:auto;min-width:280px}
  .soucty td{border:none;padding:4px 8px;font-size:13.5px}
  .soucty tr.celkem td{border-top:2px solid #0f766e;font-weight:700;font-size:15px;padding-top:8px}
  .podminky{margin-top:22px;font-size:12px;background:#e6f2f0;border-left:4px solid #0f766e;padding:10px 14px;border-radius:0 8px 8px 0}
  .pata{margin-top:16px;font-size:11.5px;color:#6b7c78}
  @media print{ body{padding:10mm} }
</style></head><body>
  <div class="hlava">
    <div>
      <h1>Cenová nabídka</h1>
      <div class="info">
        <b>${U.esc(akce.nazev)}</b><br>
        ${akce.adresa ? U.esc(akce.adresa) + '<br>' : ''}
        Datum vystavení: <b>${U.fmtDatum(vystavena)}</b><br>
        Platnost nabídky: <b>do ${U.fmtDatum(platnostDo)}</b> (6 měsíců)
      </div>
    </div>
    <div class="firma">
      ${n.firma ? `<b>${U.esc(n.firma)}</b><br>` : ''}
      ${n.adresa ? U.esc(n.adresa) + '<br>' : ''}
      ${n.ico ? 'IČO: ' + U.esc(n.ico) + '<br>' : ''}
      ${n.dic ? 'DIČ: ' + U.esc(n.dic) + '<br>' : ''}
      ${n.telefon ? 'Tel: ' + U.esc(n.telefon) + '<br>' : ''}
      ${n.email ? U.esc(n.email) : ''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th class="c">#</th><th>Položka</th><th class="r">Množství</th><th class="c">MJ</th>
      <th class="r">Cena/MJ</th><th class="r">Celkem bez DPH</th>
    </tr></thead>
    <tbody>${radky || '<tr><td colspan="6" style="text-align:center;color:#999">Žádné položky</td></tr>'}</tbody>
  </table>

  <table class="soucty">
    <tr><td>Celkem bez DPH</td><td class="r">${U.kc(s.bez)}</td></tr>
    ${rozpadDph}
    <tr class="celkem"><td>Celkem s DPH</td><td class="r">${U.kc(s.s)}</td></tr>
  </table>

  <div class="podminky">
    Nabídka platí <b>6 měsíců</b> od data vystavení, tj. do ${U.fmtDatum(platnostDo)}.
    Do této doby musí být práce zahájeny — po uplynutí platnosti dojde k přepočítání cen
    dle aktuálního ceníku.
  </div>
  <div class="pata">Nabídka vystavena v aplikaci Rozpočty staveb.</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`;

  otevriTisk(html);
}

function otevriTisk(html){
  const w = window.open('', '_blank');
  if (!w) { U.toast('Prohlížeč zablokoval nové okno – povol vyskakovací okna', 'chyba'); return; }
  w.document.write(html);
  w.document.close();
}

/* ===== Tisk ceníku (materiál nebo práce), seskupeno do okruhů ===== */
function tiskniCenik(kolekce){
  const n = DB.data.nastaveni || {};
  const prir = U.num(n.prirazka);
  const nadpis = kolekce === 'prace' ? 'Ceník prací' : 'Ceník materiálu';
  const polozky = [...DB.data[kolekce]];
  if (!polozky.length) { U.toast('Ceník je prázdný', 'chyba'); return; }

  const skupiny = {};
  for (const p of polozky) {
    const k = p.kategorie || 'Bez okruhu';
    (skupiny[k] = skupiny[k] || []).push(p);
  }
  const poradi = U.seradKategorie(Object.keys(skupiny));

  const telo = poradi.map(kat => `
    <tr class="okruh"><td colspan="5">${U.esc(kat)}</td></tr>
    ${skupiny[kat].sort((a, b) =>
      (a.kod || 'zzz').localeCompare(b.kod || 'zzz', 'cs') ||
      (a.nazev || '').localeCompare(b.nazev || '', 'cs')).map(p => {
      const cena = DB.sPrirazkou(p.cena);
      const sDph = cena * (1 + DB.dph() / 100);
      return `<tr>
        <td>${U.esc(p.nazev)}</td>
        <td class="c">${U.esc(p.kod || '')}</td>
        <td class="c">${U.esc(p.jednotka || 'ks')}</td>
        <td class="r">${U.kc(cena)}</td>
        <td class="r">${U.kc(sDph)}</td>
      </tr>`;
    }).join('')}`).join('');

  const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<title>${nadpis}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#152523;padding:28px;font-size:12px}
  h1{font-size:20px;color:#0b5d57;margin-bottom:2px}
  .hlava{display:flex;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:6px}
  .firma{text-align:right;font-size:11px;line-height:1.5}
  .pozn{font-size:11px;color:#6b7c78;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#e6f2f0;color:#0b5d57;font-size:10.5px;text-transform:uppercase;position:sticky;top:0}
  th,td{border:1px solid #cfe0dd;padding:4px 7px;text-align:left;vertical-align:top}
  .r{text-align:right;white-space:nowrap}.c{text-align:center;white-space:nowrap}
  tr.okruh td{background:#0f766e;color:#fff;font-weight:700;font-size:12px}
  @media print{body{padding:8mm}tr{page-break-inside:avoid}}
</style></head><body>
  <div class="hlava">
    <div><h1>${nadpis}</h1><div style="font-size:11px">Datum: ${U.fmtDatum(U.dnes())} · ${polozky.length} položek</div></div>
    <div class="firma">
      ${n.firma ? `<b>${U.esc(n.firma)}</b><br>` : ''}
      ${n.ico ? 'IČO: ' + U.esc(n.ico) + '<br>' : ''}
      ${n.telefon ? 'Tel: ' + U.esc(n.telefon) : ''}
    </div>
  </div>
  <div class="pozn">Ceny za měrnou jednotku.${prir ? ` Navýšeno o přirážku ${prir} %.` : ''} Sloupce: bez DPH / s DPH.</div>
  <table>
    <thead><tr><th>Položka</th><th class="c">Kód</th><th class="c">MJ</th><th class="r">Cena bez DPH</th><th class="r">Cena s DPH</th></tr></thead>
    <tbody>${telo}</tbody>
  </table>
  <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
</body></html>`;

  otevriTisk(html);
}
