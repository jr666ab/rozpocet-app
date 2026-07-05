/* ===== Ceníky – materiál, práce, vzory + import CSV/XLSX ===== */

function renderDatabaze(el, tab){
  document.getElementById('titulek').textContent = 'Ceníky';
  tab = ['material', 'prace', 'vzory'].includes(tab) ? tab : 'material';

  el.innerHTML = `
    <div class="taby">
      <button class="tab${tab === 'material' ? ' aktivni' : ''}" data-tab="material">Materiál</button>
      <button class="tab${tab === 'prace' ? ' aktivni' : ''}" data-tab="prace">Práce</button>
      <button class="tab${tab === 'vzory' ? ' aktivni' : ''}" data-tab="vzory">Vzory</button>
    </div>
    <div id="dbObsah"></div>`;

  el.querySelectorAll('.tab').forEach(b =>
    b.onclick = () => { location.hash = `#/databaze/${b.dataset.tab}`; });

  const obsah = el.querySelector('#dbObsah');
  if (tab === 'vzory') dbVzory(obsah);
  else dbCenik(obsah, tab === 'material' ? 'polozky' : 'prace');
}

/* ---- ceník materiálu / prací (seskupeno do okruhů) ---- */
function dbCenik(el, kolekce){
  const seznamDat = DB.data[kolekce];
  const prir = U.num(DB.data.nastaveni.prirazka);

  el.innerHTML = `
    <div class="btn-rada">
      <button class="btn btn-plny" id="dbPridat">+ Ručně</button>
      <button class="btn" id="dbImport">⬆ Import</button>
      <button class="btn" id="dbTisk">🖨 Tisk</button>
    </div>
    <div class="btn-rada">
      <button class="btn" id="dbVychozi">📥 Načíst výchozí ceník</button>
      ${seznamDat.length ? '<button class="btn btn-cerveny" id="dbSmazatVse">🗑 Smazat vše</button>' : ''}
    </div>
    ${prir ? `<div class="radek-sub" style="margin:2px 4px 8px">Ceny v tabulce jsou navýšené o přirážku ${prir} % (nastavení ⚙).</div>` : ''}
    <input class="hledani" id="dbHledat" placeholder="Hledat… (${seznamDat.length} položek)">
    <div id="dbSeznam"></div>`;

  const seznam = el.querySelector('#dbSeznam');
  const hledat = el.querySelector('#dbHledat');

  function vypis(){
    const q = hledat.value.trim().toLowerCase();
    const vysledky = seznamDat.filter(p =>
      !q || (p.nazev || '').toLowerCase().includes(q) || (p.kod || '').toLowerCase().includes(q));

    if (!vysledky.length) {
      seznam.innerHTML = `<div class="prazdno">${seznamDat.length ? 'Nic nenalezeno' : 'Ceník je prázdný.<br>Načti výchozí ceník, nahraj soubor nebo přidej ručně.'}</div>`;
      return;
    }
    const skupiny = {};
    for (const p of vysledky) {
      const k = p.kategorie || 'Bez okruhu';
      (skupiny[k] = skupiny[k] || []).push(p);
    }
    const poradi = Object.keys(skupiny).sort((a, b) => a.localeCompare(b, 'cs'));
    seznam.innerHTML = poradi.map(kat => `
      <div class="sekce-nadpis">${U.esc(kat)} <span style="color:var(--akcent);font-weight:700">(${skupiny[kat].length})</span></div>
      ${skupiny[kat].map(p => {
        const c = DB.sPrirazkou(p.cena);
        return `<div class="radek" data-id="${p.id}" style="cursor:pointer">
          <div class="radek-info">
            <div class="radek-nazev">${U.esc(p.nazev)}${p.kod ? `<span class="stitek">${U.esc(p.kod)}</span>` : ''}</div>
            <div class="radek-sub">DPH ${U.num(p.sazbaDph ?? 21)} %${p.poznamka ? ' · ' + U.esc(p.poznamka) : ''}</div>
          </div>
          <div class="radek-cena">${U.kc(c)}<div class="radek-sub" style="font-weight:400">/${U.esc(p.jednotka || 'ks')}</div></div>
        </div>`;
      }).join('')}`).join('');

    seznam.querySelectorAll('.radek').forEach(r =>
      r.onclick = () => cenikPolozkaModal(kolekce, seznamDat.find(p => p.id === r.dataset.id)));
  }
  hledat.oninput = U.debounce(vypis, 200);
  vypis();

  el.querySelector('#dbPridat').onclick = () => cenikPolozkaModal(kolekce, null);
  el.querySelector('#dbImport').onclick = () => importModal(kolekce);
  el.querySelector('#dbTisk').onclick = () => tiskniCenik(kolekce);
  el.querySelector('#dbVychozi').onclick = () => nactiVychoziModal();
  const smazVse = el.querySelector('#dbSmazatVse');
  if (smazVse) smazVse.onclick = () => {
    if (!confirm(`Opravdu smazat celý ceník (${seznamDat.length} položek)?`)) return;
    DB.data[kolekce] = [];
    DB.ulozSdilene(); render();
  };
}

function nactiVychoziModal(){
  const z = window.CENIK_DATA || {};
  const ov = U.modal(`
    <h2>Načíst výchozí ceník</h2>
    <div class="radek-sub" style="margin-bottom:12px">
      Sloučený ceník RD Štrnberk (Stefan) + Windisch: ${(z.polozky||[]).length} materiál, ${(z.prace||[]).length} práce, ${(z.vzory||[]).length} vzory. Rozdělený do okruhů.
    </div>
    <button class="btn btn-velky btn-plny" id="vDoplnit">➕ Doplnit (přidá jen chybějící)</button>
    <button class="btn btn-velky btn-obrys" id="vNahradit">♻ Nahradit celý ceník</button>
    <button class="btn btn-velky" id="vZrusit">Zrušit</button>`);
  ov.querySelector('#vZrusit').onclick = () => U.zavriModal(ov);
  ov.querySelector('#vDoplnit').onclick = () => {
    const r = DB.nactiVychoziCenik('doplnit');
    U.zavriModal(ov); U.toast(`Doplněno ${r.pridano} položek`); render();
  };
  ov.querySelector('#vNahradit').onclick = () => {
    if (!confirm('Nahradit celý ceník výchozím? Tvoje úpravy se ztratí.')) return;
    const r = DB.nactiVychoziCenik('nahradit');
    U.zavriModal(ov); U.toast(`Načteno ${r.pridano} položek`); render();
  };
}

function cenikPolozkaModal(kolekce, p){
  const jeMaterial = kolekce === 'polozky';
  const x = p || {};
  const ov = U.modal(`
    <h2>${p ? 'Upravit položku' : (jeMaterial ? 'Nový materiál' : 'Nová práce')}</h2>
    <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(x.nazev || '')}"></div>
    ${jeMaterial ? `<div class="pole"><label>Kód (nepovinné)</label><input id="fKod" value="${U.esc(x.kod || '')}"></div>` : ''}
    <div class="pole-rada">
      <div class="pole"><label>Cena bez DPH</label><input id="fCena" type="text" inputmode="decimal" value="${x.cena ?? ''}"></div>
      <div class="pole"><label>Jednotka</label><input id="fJednotka" value="${U.esc(x.jednotka || (jeMaterial ? 'ks' : 'hod'))}"></div>
    </div>
    <div class="pole-rada">
      <div class="pole"><label>Sazba DPH %</label><input id="fDph" type="text" inputmode="numeric" value="${x.sazbaDph ?? DB.data.nastaveni.vychoziDph ?? 21}"></div>
      <div class="pole"><label>Okruh</label><input id="fKat" list="katList" value="${U.esc(x.kategorie || '')}" placeholder="např. Kabely"></div>
    </div>
    <datalist id="katList">${cenikKategorie(kolekce).map(k => `<option value="${U.esc(k)}">`).join('')}</datalist>
    <div class="modal-akce">
      ${p ? '<button class="btn btn-cerveny" id="fSmazat">Smazat</button>' : ''}
      <button class="btn btn-plny" id="fUlozit">Uložit</button>
    </div>`);

  ov.querySelector('#fUlozit').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
    const kodInp = ov.querySelector('#fKod');
    const data = {
      nazev,
      kod: kodInp ? kodInp.value.trim() : '',
      cena: U.num(ov.querySelector('#fCena').value),
      jednotka: ov.querySelector('#fJednotka').value.trim(),
      sazbaDph: U.num(ov.querySelector('#fDph').value),
      kategorie: ov.querySelector('#fKat').value.trim()
    };
    if (p) Object.assign(p, data);
    else DB.data[kolekce].push({ id: U.uid(), ...data });
    DB.ulozSdilene(); U.zavriModal(ov); render();
  };
  const sm = ov.querySelector('#fSmazat');
  if (sm) sm.onclick = () => {
    DB.data[kolekce] = DB.data[kolekce].filter(i => i.id !== p.id);
    DB.ulozSdilene(); U.zavriModal(ov); render();
  };
}

/* seznam existujících okruhů (pro našeptávač) */
function cenikKategorie(kolekce){
  const s = new Set();
  for (const p of DB.data[kolekce]) if (p.kategorie) s.add(p.kategorie);
  return [...s].sort((a, b) => a.localeCompare(b, 'cs'));
}

/* ---- vzory ---- */
function dbVzory(el){
  el.innerHTML = `
    <div class="btn-rada">
      <button class="btn btn-plny" id="vzNovy">+ Nový vzor</button>
      <button class="btn" id="vzImport">⬆ Import ze souboru</button>
    </div>
    ${DB.data.vzory.length ? DB.data.vzory.map(v => {
      const celkem = (v.polozky || []).reduce((s, p) => s + U.num(p.mnozstvi) * U.num(p.jednotkovaCena), 0);
      return `<details class="vzor" data-id="${v.id}">
        <summary>
          <span style="flex:1">${U.esc(v.nazev)}</span>
          <span class="radek-sub">${(v.polozky || []).length} pol. · ${U.kc(celkem)}</span>
        </summary>
        <div class="vzor-obsah">
          ${v.popis ? `<div class="radek-sub" style="margin:8px 0">${U.esc(v.popis)}</div>` : ''}
          <div style="margin-top:8px">
          ${(v.polozky || []).map(p => `
            <div class="radek" data-pid="${p.id}" style="cursor:pointer">
              <div class="radek-info">
                <div class="radek-nazev">${U.esc(p.nazev)}</div>
                <div class="radek-sub">${U.mn(p.mnozstvi)} ${U.esc(p.jednotka || '')} × ${U.kc(p.jednotkovaCena)} · DPH ${U.num(p.sazbaDph ?? 21)} %</div>
              </div>
              <div class="radek-cena">${U.kc(U.num(p.mnozstvi) * U.num(p.jednotkovaCena))}</div>
            </div>`).join('') || '<div class="prazdno">Vzor je prázdný</div>'}
          </div>
          <div class="btn-rada">
            <button class="btn btn-mini" data-akce="pridat">+ Položka</button>
            <button class="btn btn-mini" data-akce="prejmenovat">✏️ Upravit</button>
            <button class="btn btn-mini btn-cerveny" data-akce="smazat">🗑 Smazat vzor</button>
          </div>
        </div>
      </details>`;
    }).join('') : '<div class="prazdno">Žádné vzory.<br>Vzor = sada položek (např. „rozvaděč 12 modulů"), kterou vložíš do nabídky jedním klikem.</div>'}`;

  el.querySelector('#vzNovy').onclick = () => {
    const ov = U.modal(`
      <h2>Nový vzor</h2>
      <div class="pole"><label>Název</label><input id="fNazev" placeholder="např. Rozvaděč 12 modulů"></div>
      <div class="pole"><label>Popis (nepovinné)</label><input id="fPopis"></div>
      <div class="modal-akce"><button class="btn btn-plny" id="fOk">Vytvořit</button></div>`);
    ov.querySelector('#fOk').onclick = () => {
      const nazev = ov.querySelector('#fNazev').value.trim();
      if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
      DB.data.vzory.push({ id: U.uid(), nazev, popis: ov.querySelector('#fPopis').value.trim(), polozky: [] });
      DB.ulozSdilene(); U.zavriModal(ov); render();
    };
  };
  el.querySelector('#vzImport').onclick = () => importModal('vzor');

  el.querySelectorAll('details.vzor').forEach(det => {
    const v = DB.data.vzory.find(x => x.id === det.dataset.id);

    det.querySelectorAll('.radek[data-pid]').forEach(r =>
      r.onclick = () => vzorPolozkaModal(v, v.polozky.find(p => p.id === r.dataset.pid)));

    det.querySelector('[data-akce="pridat"]').onclick = () => vzorPolozkaModal(v, null);

    det.querySelector('[data-akce="prejmenovat"]').onclick = () => {
      const ov = U.modal(`
        <h2>Upravit vzor</h2>
        <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(v.nazev)}"></div>
        <div class="pole"><label>Popis</label><input id="fPopis" value="${U.esc(v.popis || '')}"></div>
        <div class="modal-akce"><button class="btn btn-plny" id="fOk">Uložit</button></div>`);
      ov.querySelector('#fOk').onclick = () => {
        const nazev = ov.querySelector('#fNazev').value.trim();
        if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
        v.nazev = nazev; v.popis = ov.querySelector('#fPopis').value.trim();
        DB.ulozSdilene(); U.zavriModal(ov); render();
      };
    };

    det.querySelector('[data-akce="smazat"]').onclick = () => {
      if (!confirm(`Smazat vzor „${v.nazev}"?`)) return;
      DB.data.vzory = DB.data.vzory.filter(x => x.id !== v.id);
      DB.ulozSdilene(); render();
    };
  });
}

function vzorPolozkaModal(vzor, p){
  const x = p || {};
  const ov = U.modal(`
    <h2>${p ? 'Upravit položku vzoru' : 'Položka vzoru'}</h2>
    <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(x.nazev || '')}"></div>
    <div class="pole-rada">
      <div class="pole"><label>Množství</label><input id="fMn" type="text" inputmode="decimal" value="${x.mnozstvi ?? 1}"></div>
      <div class="pole"><label>Jednotka</label><input id="fJednotka" value="${U.esc(x.jednotka || 'ks')}"></div>
    </div>
    <div class="pole-rada">
      <div class="pole"><label>Cena bez DPH</label><input id="fCena" type="text" inputmode="decimal" value="${x.jednotkovaCena ?? ''}"></div>
      <div class="pole"><label>DPH %</label><input id="fDph" type="text" inputmode="numeric" value="${x.sazbaDph ?? 21}"></div>
    </div>
    <div class="modal-akce">
      ${p ? '<button class="btn btn-cerveny" id="fSmazat">Smazat</button>' : ''}
      <button class="btn btn-plny" id="fUlozit">Uložit</button>
    </div>`);

  ov.querySelector('#fUlozit').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
    const data = {
      nazev,
      mnozstvi: U.num(ov.querySelector('#fMn').value),
      jednotka: ov.querySelector('#fJednotka').value.trim(),
      jednotkovaCena: U.num(ov.querySelector('#fCena').value),
      sazbaDph: U.num(ov.querySelector('#fDph').value)
    };
    if (p) Object.assign(p, data);
    else vzor.polozky.push({ id: U.uid(), ...data });
    DB.ulozSdilene(); U.zavriModal(ov); render();
  };
  const sm = ov.querySelector('#fSmazat');
  if (sm) sm.onclick = () => {
    vzor.polozky = vzor.polozky.filter(i => i.id !== p.id);
    DB.ulozSdilene(); U.zavriModal(ov); render();
  };
}

/* ============================================================
   IMPORT CSV / XLSX
   cil: 'polozky' | 'prace' | 'vzor'
   ============================================================ */
async function parsujSoubor(file){
  const nazev = file.name.toLowerCase();
  if (nazev.endsWith('.csv') || nazev.endsWith('.txt')) {
    if (typeof Papa === 'undefined') throw new Error('Knihovna pro CSV se ještě načítá');
    return new Promise((res, rej) => {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: r => res(r.data),
        error: rej
      });
    });
  }
  if (typeof XLSX === 'undefined') throw new Error('Knihovna pro Excel se ještě načítá');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

function hadejSloupec(hlavicky, vzorce){
  for (let i = 0; i < hlavicky.length; i++) {
    const h = String(hlavicky[i]).toLowerCase();
    if (vzorce.some(v => h.includes(v))) return i;
  }
  return -1;
}

async function importModal(cil){
  const soubor = await U.pickFile('.csv,.txt,.xlsx,.xls');
  if (!soubor) return;

  let radky;
  try { radky = await parsujSoubor(soubor); }
  catch (e) { U.toast(e.message || 'Soubor se nepodařilo přečíst', 'chyba'); return; }
  if (!radky || radky.length < 1) { U.toast('Soubor je prázdný', 'chyba'); return; }

  const jeVzor = cil === 'vzor';
  const jeMaterial = cil === 'polozky';
  const hlavicky = radky[0].map((h, i) => String(h).trim() || `Sloupec ${i + 1}`);

  // pole k namapování
  const cilovaPole = [
    ['nazev', 'Název *'],
    ...(jeMaterial ? [['kod', 'Kód']] : []),
    ...(jeVzor ? [['mnozstvi', 'Množství']] : []),
    ['cena', 'Cena bez DPH'],
    ['jednotka', 'Jednotka'],
    ['dph', 'Sazba DPH'],
    ...(jeVzor ? [] : [['kategorie', 'Okruh']])
  ];
  const odhad = {
    nazev: hadejSloupec(hlavicky, ['náz', 'nazev', 'name', 'popis']),
    kod: hadejSloupec(hlavicky, ['kód', 'kod', 'ean', 'číslo', 'cislo']),
    mnozstvi: hadejSloupec(hlavicky, ['množ', 'mnoz', 'počet', 'pocet', 'qty']),
    cena: hadejSloupec(hlavicky, ['cena', 'price', 'kč', 'kc']),
    jednotka: hadejSloupec(hlavicky, ['jedn', 'mj', 'unit']),
    dph: hadejSloupec(hlavicky, ['dph', 'vat', 'sazba']),
    kategorie: hadejSloupec(hlavicky, ['okruh', 'kategor', 'skupin', 'sekce'])
  };

  const nazvyCilu = { polozky: 'materiálu', prace: 'prací', vzor: 'vzoru' };
  const ov = U.modal(`
    <h2>Import ${nazvyCilu[cil]} – ${U.esc(soubor.name)}</h2>
    ${jeVzor ? `<div class="pole"><label>Název vzoru</label>
      <input id="iVzorNazev" value="${U.esc(soubor.name.replace(/\.[^.]+$/, ''))}"></div>` : ''}
    <label style="display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:10px">
      <input type="checkbox" id="iHlavicka" checked style="width:18px;height:18px"> První řádek je hlavička
    </label>
    <div class="sekce-nadpis">Mapování sloupců</div>
    ${cilovaPole.map(([klic, popisek]) => `
      <div class="pole"><label>${popisek}</label>
        <select data-mapa="${klic}">
          <option value="-1">— nepoužít —</option>
          ${hlavicky.map((h, i) => `<option value="${i}"${odhad[klic] === i ? ' selected' : ''}>${U.esc(h)}</option>`).join('')}
        </select></div>`).join('')}
    <div class="pole-rada">
      <div class="pole"><label>Výchozí DPH % (když není ve sloupci)</label>
        <input id="iDph" type="text" inputmode="numeric" value="${DB.data.nastaveni.vychoziDph ?? 21}"></div>
      ${jeVzor ? '' : `<div class="pole"><label>Výchozí okruh</label>
        <input id="iKat" value="" placeholder="např. Materiál"></div>`}
    </div>
    <div class="sekce-nadpis">Náhled (první 4 řádky dat)</div>
    <div class="nahled-obal"><table class="nahled-tab">
      <tr>${hlavicky.map(h => `<th>${U.esc(h)}</th>`).join('')}</tr>
      ${radky.slice(1, 5).map(r => `<tr>${hlavicky.map((_, i) => `<td>${U.esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}
    </table></div>
    <div class="modal-akce">
      <button class="btn btn-obrys" id="iZrusit">Zrušit</button>
      <button class="btn btn-plny" id="iOk">Importovat</button>
    </div>`);

  ov.querySelector('#iZrusit').onclick = () => U.zavriModal(ov);
  ov.querySelector('#iOk').onclick = () => {
    const mapa = {};
    ov.querySelectorAll('[data-mapa]').forEach(s => mapa[s.dataset.mapa] = parseInt(s.value, 10));
    if (mapa.nazev < 0) { U.toast('Musíš namapovat sloupec s názvem', 'chyba'); return; }

    const vychoziDph = U.num(ov.querySelector('#iDph').value) || 21;
    const katInp = ov.querySelector('#iKat');
    const vychoziKat = katInp ? katInp.value.trim() : '';
    const maHlavicku = ov.querySelector('#iHlavicka').checked;
    const data = maHlavicku ? radky.slice(1) : radky;

    const vem = (r, klic) => mapa[klic] >= 0 ? r[mapa[klic]] : '';
    const nove = [];
    for (const r of data) {
      const nazev = String(vem(r, 'nazev') ?? '').trim();
      if (!nazev) continue;
      const dphHodnota = String(vem(r, 'dph') ?? '').trim();
      nove.push({
        id: U.uid(),
        nazev,
        kod: jeMaterial ? String(vem(r, 'kod') ?? '').trim() : undefined,
        mnozstvi: jeVzor ? (U.num(vem(r, 'mnozstvi')) || 1) : undefined,
        cena: U.num(vem(r, 'cena')),
        jednotka: String(vem(r, 'jednotka') ?? '').trim() || (cil === 'prace' ? 'hod' : 'ks'),
        sazbaDph: dphHodnota !== '' ? U.num(dphHodnota) : vychoziDph,
        kategorie: jeVzor ? undefined : (String(vem(r, 'kategorie') ?? '').trim() || vychoziKat)
      });
    }
    if (!nove.length) { U.toast('Nenašel jsem žádné platné řádky', 'chyba'); return; }

    if (jeVzor) {
      const nazevVzoru = ov.querySelector('#iVzorNazev').value.trim() || soubor.name;
      DB.data.vzory.push({
        id: U.uid(), nazev: nazevVzoru, popis: `Import ze souboru ${soubor.name}`,
        polozky: nove.map(n => ({
          id: n.id, nazev: n.nazev, mnozstvi: n.mnozstvi,
          jednotka: n.jednotka, jednotkovaCena: n.cena, sazbaDph: n.sazbaDph
        }))
      });
    } else {
      DB.data[cil].push(...nove);
    }
    DB.ulozSdilene(); U.zavriModal(ov);
    U.toast(`Importováno ${nove.length} položek ✓`);
    render();
  };
}
