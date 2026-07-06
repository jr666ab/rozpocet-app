/* ===== Detail akce – záložky ===== */

const STATUS_NAZVY = { nabidka: 'Nabídka', prijato: 'Přijato', odmitnuto: 'Odmítnuto', hotovo: 'Hotovo' };

/* ---- výpočty ----
   DPH se počítá jednou sazbou z nastavení (⚙), ne po položkách. */
function nabidkaSoucty(akce){
  let bez = 0;
  for (const p of akce.nabidka) {
    bez += U.num(p.mnozstvi) * U.num(p.jednotkovaCenaBezDph);
  }
  const sazba = DB.dph();
  const dphCelkem = bez * sazba / 100;
  return { bez, sazba, dph: { [sazba]: dphCelkem }, dphCelkem, s: bez + dphCelkem };
}

function vicePraceCelkem(akce){
  return akce.vicePrace.reduce((s, v) => s + U.num(v.mnozstvi) * U.num(v.cena), 0);
}

function realitaSoucty(akce){
  let nakup = 0, zeSkladu = 0;
  for (const r of akce.realita) {
    if (r.typ === 'sklad') zeSkladu += U.num(r.mnozstvi) * U.num(r.cena);
    else nakup += U.num(r.nakoupenoMnozstvi) * U.num(r.cena);
  }
  return { nakup, zeSkladu };
}

/* ---- hlavní render detailu ---- */
function renderAkceDetail(el, akceId, tab){
  const akce = DB.akce(akceId);
  if (!akce) { location.hash = '#/akce'; return; }
  document.getElementById('titulek').textContent = akce.nazev;

  const taby = [
    ['nabidka', 'Nabídka'], ['realita', 'Útrata'], ['viceprace', 'Vícepráce'],
    ['denik', 'Deník'], ['galerie', 'Galerie']
  ];
  el.innerHTML = `
    <div class="akce-hlava">
      <div>
        ${akce.adresa ? `<div class="akce-adresa">📍 ${U.esc(akce.adresa)}</div>` : ''}
        <span class="badge badge-${akce.status}">${STATUS_NAZVY[akce.status] || akce.status}</span>
      </div>
      <button class="icon-btn" id="akceMenu" title="Možnosti akce">⋮</button>
    </div>
    <div class="taby">${taby.map(([k, n]) =>
      `<button class="tab${k === tab ? ' aktivni' : ''}" data-tab="${k}">${n}</button>`).join('')}
    </div>
    <div id="tabObsah"></div>`;

  el.querySelectorAll('.tab').forEach(b =>
    b.onclick = () => { location.hash = `#/akce/${akceId}/${b.dataset.tab}`; });
  el.querySelector('#akceMenu').onclick = () => akceMenuModal(akce);

  const obsah = el.querySelector('#tabObsah');
  if (tab === 'realita') tabRealita(obsah, akce);
  else if (tab === 'viceprace') tabVicePrace(obsah, akce);
  else if (tab === 'denik') tabDenik(obsah, akce);
  else if (tab === 'galerie') tabGalerie(obsah, akce);
  else tabNabidka(obsah, akce);
}

function prekresliTab(){ render(); }

/* ---- menu akce ---- */
function akceMenuModal(akce){
  const ov = U.modal(`
    <h2>${U.esc(akce.nazev)}</h2>
    <button class="btn btn-velky" id="mUpravit">✏️ Upravit název a adresu</button>
    <div class="sekce-nadpis">Stav akce</div>
    <div class="btn-rada">
      ${Object.entries(STATUS_NAZVY).map(([k, n]) =>
        `<button class="btn ${akce.status === k ? 'btn-plny' : 'btn-obrys'}" data-status="${k}">${n}</button>`).join('')}
    </div>
    <button class="btn btn-velky btn-cerveny" id="mSmazat" style="margin-top:14px">🗑 Smazat akci</button>`);

  ov.querySelectorAll('[data-status]').forEach(b => b.onclick = () => {
    akce.status = b.dataset.status;
    if (akce.status === 'hotovo' && !akce.datumDokonceni) akce.datumDokonceni = U.dnes();
    if (akce.status !== 'hotovo') akce.datumDokonceni = null;
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  });
  ov.querySelector('#mUpravit').onclick = () => {
    U.zavriModal(ov);
    const ov2 = U.modal(`
      <h2>Upravit akci</h2>
      <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(akce.nazev)}"></div>
      <div class="pole"><label>Adresa</label><input id="fAdresa" value="${U.esc(akce.adresa || '')}"></div>
      <div class="modal-akce">
        <button class="btn btn-obrys" id="fZrusit">Zrušit</button>
        <button class="btn btn-plny" id="fUlozit">Uložit</button>
      </div>`);
    ov2.querySelector('#fZrusit').onclick = () => U.zavriModal(ov2);
    ov2.querySelector('#fUlozit').onclick = () => {
      const n = ov2.querySelector('#fNazev').value.trim();
      if (!n) { U.toast('Zadej název', 'chyba'); return; }
      akce.nazev = n;
      akce.adresa = ov2.querySelector('#fAdresa').value.trim();
      DB.uloz(); U.zavriModal(ov2); prekresliTab();
    };
  };
  ov.querySelector('#mSmazat').onclick = async () => {
    if (!confirm(`Opravdu smazat akci „${akce.nazev}" včetně všech dat a fotek?`)) return;
    U.zavriModal(ov);
    try { await FotoDB.smazProAkci(akce.id); } catch (e) {}
    DB.smazAkci(akce.id);
    U.toast('Akce smazána');
    location.hash = '#/akce';
  };
}

/* ============================================================
   ZÁLOŽKA: NABÍDKOVÝ ROZPOČET
   ============================================================ */
function tabNabidka(el, akce){
  const s = nabidkaSoucty(akce);
  const zdrojStitek = { databaze: 'ceník', vzor: 'vzor', rucni: '' };

  el.innerHTML = `
    <div class="btn-rada">
      <button class="btn btn-plny" id="nRucne">+ Ručně</button>
      <button class="btn" id="nDatabaze">📚 Z ceníku</button>
      <button class="btn" id="nVzor">🧩 Vzor</button>
    </div>
    ${akce.nabidka.length ? akce.nabidka.map(p => {
      const celkem = U.num(p.mnozstvi) * U.num(p.jednotkovaCenaBezDph);
      const st = zdrojStitek[p.zdroj];
      return `<div class="radek nabidka-radek" data-id="${p.id}">
        <div class="radek-info">
          <div class="radek-nazev" data-detail style="cursor:pointer">${U.esc(p.nazev)}${st ? `<span class="stitek">${st}</span>` : ''}</div>
          <div class="radek-sub">${U.kc(p.jednotkovaCenaBezDph)}/${U.esc(p.jednotka || 'ks')}</div>
          <div class="mn-stepper">
            <button data-krok="-1" type="button">−</button>
            <input data-mn type="text" inputmode="decimal" value="${U.num(p.mnozstvi)}">
            <span class="mn-jednotka">${U.esc(p.jednotka || 'ks')}</span>
            <button data-krok="1" type="button">+</button>
          </div>
        </div>
        <div class="radek-cena" data-celkem>${U.kc(celkem)}</div>
      </div>`;
    }).join('') : '<div class="prazdno">Nabídka je prázdná.<br>Přidej položky ručně, z ceníku nebo vlož vzor.</div>'}

    <div class="karta souhrn" id="nSouhrn"></div>

    <div class="btn-rada">
      <button class="btn" id="nPdf">🖨 PDF nabídky</button>
      ${akce.status === 'nabidka' ? `
        <button class="btn btn-zeleny" id="nPrijato">✓ Přijato</button>
        <button class="btn btn-cerveny" id="nOdmitnuto">✗ Odmítnuto</button>` : ''}
    </div>`;

  aktualizujNabidkaSouhrn(el, akce);

  el.querySelectorAll('.nabidka-radek').forEach(radek => {
    const p = akce.nabidka.find(x => x.id === radek.dataset.id);
    const inp = radek.querySelector('[data-mn]');

    const ulozMnozstvi = noveMn => {
      p.mnozstvi = Math.max(0, noveMn);
      DB.uloz();
      radek.querySelector('[data-celkem]').textContent =
        U.kc(U.num(p.mnozstvi) * U.num(p.jednotkovaCenaBezDph));
      aktualizujNabidkaSouhrn(el, akce);
    };

    // ťuknutí do políčka = psaní množství rovnou v seznamu
    inp.oninput = U.debounce(() => ulozMnozstvi(U.num(inp.value)), 350);
    inp.onblur = () => { inp.value = U.num(p.mnozstvi); };

    // tlačítka +/−
    radek.querySelectorAll('[data-krok]').forEach(b => b.onclick = () => {
      ulozMnozstvi(U.num(p.mnozstvi) + Number(b.dataset.krok));
      inp.value = U.num(p.mnozstvi);
    });

    // detail (úprava názvu, ceny, smazání) jen přes název položky
    radek.querySelector('[data-detail]').onclick = () => nabidkaPolozkaModal(akce, p);
  });
  el.querySelector('#nRucne').onclick = () => nabidkaPolozkaModal(akce, null);
  el.querySelector('#nDatabaze').onclick = () => vyberZCeniku(akce);
  el.querySelector('#nVzor').onclick = () => vlozVzorModal(akce);
  el.querySelector('#nPdf').onclick = () => tiskniNabidku(akce);
  const bPri = el.querySelector('#nPrijato'), bOdm = el.querySelector('#nOdmitnuto');
  if (bPri) bPri.onclick = () => { akce.status = 'prijato'; DB.uloz(); U.toast('Akce přijata 🎉'); prekresliTab(); };
  if (bOdm) bOdm.onclick = () => { akce.status = 'odmitnuto'; DB.uloz(); U.toast('Akce odmítnuta'); prekresliTab(); };
}

function aktualizujNabidkaSouhrn(el, akce){
  const cil = el.querySelector('#nSouhrn');
  if (!cil) return;
  const s = nabidkaSoucty(akce);
  cil.innerHTML = `
    <div class="souhrn-radek"><span>Celkem bez DPH</span><b>${U.kc(s.bez)}</b></div>
    <div class="souhrn-radek"><span>DPH ${s.sazba} %</span><span>${U.kc(s.dphCelkem)}</span></div>
    <div class="souhrn-radek velky"><span>Celkem s DPH</span><b>${U.kc(s.s)}</b></div>`;
}

function nabidkaPolozkaModal(akce, polozka){
  const p = polozka || {};
  const ov = U.modal(`
    <h2>${polozka ? 'Upravit položku' : 'Nová položka'}</h2>
    <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(p.nazev || '')}"></div>
    <div class="pole-rada">
      <div class="pole"><label>Množství</label><input id="fMnozstvi" type="text" inputmode="decimal" value="${p.mnozstvi ?? 1}"></div>
      <div class="pole"><label>Jednotka</label><input id="fJednotka" value="${U.esc(p.jednotka || 'ks')}"></div>
    </div>
    <div class="pole"><label>Cena/MJ bez DPH</label><input id="fCena" type="text" inputmode="decimal" value="${p.jednotkovaCenaBezDph ?? ''}"></div>
    <div class="modal-akce">
      ${polozka ? '<button class="btn btn-cerveny" id="fSmazat">Smazat</button>' : ''}
      <button class="btn btn-plny" id="fUlozit">Uložit</button>
    </div>`);

  ov.querySelector('#fUlozit').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název položky', 'chyba'); return; }
    const data = {
      nazev,
      mnozstvi: U.num(ov.querySelector('#fMnozstvi').value),
      jednotka: ov.querySelector('#fJednotka').value.trim(),
      jednotkovaCenaBezDph: U.num(ov.querySelector('#fCena').value),
      sazbaDph: polozka ? polozka.sazbaDph : DB.dph()
    };
    if (polozka) Object.assign(polozka, data);
    else akce.nabidka.push({ id: U.uid(), zdroj: 'rucni', ...data });
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  };
  const sm = ov.querySelector('#fSmazat');
  if (sm) sm.onclick = () => {
    akce.nabidka = akce.nabidka.filter(x => x.id !== polozka.id);
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  };
}

/* výběr z ceníku (materiál / práce) */
function vyberZCeniku(akce){
  let typ = 'polozky';
  const ov = U.modal(`
    <h2>Přidat z ceníku</h2>
    <div class="taby" style="box-shadow:none;border:1px solid var(--linka)">
      <button class="tab aktivni" data-typ="polozky">Materiál</button>
      <button class="tab" data-typ="prace">Práce</button>
    </div>
    <input class="hledani" id="cHledat" placeholder="Hledat…">
    <div class="modal-seznam" id="cSeznam" style="max-height:45vh;overflow-y:auto"></div>`);

  const seznam = ov.querySelector('#cSeznam');
  const hledat = ov.querySelector('#cHledat');

  function vypis(){
    const q = hledat.value.trim().toLowerCase();
    const zdroj = DB.data[typ].filter(x =>
      !q || (x.nazev || '').toLowerCase().includes(q) || (x.kod || '').toLowerCase().includes(q));
    seznam.innerHTML = zdroj.length ? zdroj.slice(0, 100).map(x => `
      <div class="radek" data-id="${x.id}">
        <div class="radek-info">
          <div class="radek-nazev">${U.esc(x.nazev)}</div>
          <div class="radek-sub">${x.kod ? U.esc(x.kod) + ' · ' : ''}${U.kc(x.cena)}/${U.esc(x.jednotka || 'ks')}${x.trh ? ' · trh: ' + U.esc(x.trh) + ' Kč' : ''}</div>
        </div>
      </div>`).join('')
      : `<div class="prazdno">${DB.data[typ].length ? 'Nic nenalezeno' : 'Ceník je prázdný – nahraj ho v záložce Ceníky'}</div>`;

    seznam.querySelectorAll('.radek').forEach(r => r.onclick = () => {
      const x = DB.data[typ].find(i => i.id === r.dataset.id);
      const cenaPrir = DB.sPrirazkou(x.cena);
      const prir = U.num(DB.data.nastaveni.prirazka);
      const ov2 = U.modal(`
        <h2>${U.esc(x.nazev)}</h2>
        <div class="pole"><label>Množství (${U.esc(x.jednotka || 'ks')})</label>
          <input id="fMn" type="text" inputmode="decimal" value="1"></div>
        <div class="radek-sub" style="margin-bottom:10px">Cena ${U.kc(cenaPrir)}/${U.esc(x.jednotka || 'ks')}${prir ? ` (vč. přirážky ${prir} %)` : ''}${x.trh ? `<br>📊 trh 2026: ${U.esc(x.trh)} Kč` : ''}</div>
        <div class="modal-akce"><button class="btn btn-plny" id="fOk">Přidat do nabídky</button></div>`);
      const inp = ov2.querySelector('#fMn'); inp.focus(); inp.select();
      ov2.querySelector('#fOk').onclick = () => {
        akce.nabidka.push({
          id: U.uid(), zdroj: 'databaze', nazev: x.nazev,
          mnozstvi: U.num(inp.value) || 1, jednotka: x.jednotka || 'ks',
          jednotkovaCenaBezDph: cenaPrir, sazbaDph: U.num(x.sazbaDph ?? DB.dph())
        });
        DB.uloz(); U.zavriModal(ov2); U.zavriModal(ov);
        U.toast('Přidáno do nabídky'); prekresliTab();
      };
    });
  }
  ov.querySelectorAll('[data-typ]').forEach(b => b.onclick = () => {
    typ = b.dataset.typ;
    ov.querySelectorAll('[data-typ]').forEach(x => x.classList.toggle('aktivni', x === b));
    vypis();
  });
  hledat.oninput = U.debounce(vypis, 200);
  vypis();
}

/* vložení vzoru */
function vlozVzorModal(akce){
  const ov = U.modal(`
    <h2>Vložit vzor</h2>
    <div class="modal-seznam" style="max-height:55vh;overflow-y:auto">
      ${DB.data.vzory.length ? DB.data.vzory.map(v => {
        const celkem = (v.polozky || []).reduce((s, p) => s + U.num(p.mnozstvi) * U.num(p.jednotkovaCena), 0);
        return `<div class="radek" data-id="${v.id}">
          <div class="radek-info">
            <div class="radek-nazev">${U.esc(v.nazev)}</div>
            <div class="radek-sub">${(v.polozky || []).length} položek${v.popis ? ' · ' + U.esc(v.popis) : ''}</div>
          </div>
          <div class="radek-cena">${U.kc(celkem)}</div>
        </div>`;
      }).join('') : '<div class="prazdno">Žádné vzory – vytvoř je v záložce Ceníky → Vzory</div>'}
    </div>`);

  ov.querySelectorAll('.radek').forEach(r => r.onclick = () => {
    const v = DB.data.vzory.find(x => x.id === r.dataset.id);
    for (const p of (v.polozky || [])) {
      akce.nabidka.push({
        id: U.uid(), zdroj: 'vzor', nazev: p.nazev,
        mnozstvi: U.num(p.mnozstvi) || 1, jednotka: p.jednotka || 'ks',
        jednotkovaCenaBezDph: DB.sPrirazkou(p.jednotkovaCena), sazbaDph: U.num(p.sazbaDph ?? DB.dph())
      });
    }
    DB.uloz(); U.zavriModal(ov);
    U.toast(`Vzor „${v.nazev}" vložen (${(v.polozky || []).length} položek)`);
    prekresliTab();
  });
}

/* ============================================================
   ZÁLOŽKA: SKUTEČNÁ ÚTRATA
   ============================================================ */
function tabRealita(el, akce){
  const nakupy = akce.realita.filter(r => r.typ !== 'sklad');
  const zeSkladu = akce.realita.filter(r => r.typ === 'sklad');

  el.innerHTML = `
    <div class="karta souhrn" id="rSouhrn"></div>

    <div class="sekce-nadpis">Nákupy</div>
    <div id="rNakupy">${nakupy.map(r => nakupKartaHtml(akce, r)).join('') ||
      '<div class="prazdno">Zatím žádné nákupy</div>'}</div>
    <button class="btn btn-velky" id="rPridatNakup">+ Přidat nákup</button>

    <div class="sekce-nadpis">Ze skladu</div>
    <div id="rSklad">${zeSkladu.map(r => `
      <div class="radek" data-sklad-radek="${r.id}">
        <div class="radek-info">
          <div class="radek-nazev">${U.esc(r.nazev)}<span class="stitek">sklad</span></div>
          <div class="radek-sub">${U.mn(r.mnozstvi)} ${U.esc(r.jednotka || '')} · hodnota ${U.kc(U.num(r.mnozstvi) * U.num(r.cena))} (už zaplaceno dřív)</div>
        </div>
        <button class="btn btn-mini btn-cerveny" data-vratit="${r.id}">Vrátit</button>
      </div>`).join('') || '<div class="prazdno">Nic ze skladu</div>'}</div>
    <button class="btn btn-velky" id="rZeSkladu">📦 Použít ze skladu</button>

    <div class="sekce-nadpis">Faktury a dodáky</div>
    <div class="karta">
      <button class="btn" id="rFoto">📷 Vyfotit / nahrát doklad</button>
      <div class="denik-fotky" id="rFotky" style="margin-top:10px"></div>
      <div class="radek-sub" style="margin-top:8px">Automatické vytěžení dokladů (OCR) doplníme po napojení na server – zatím zapisuj řádky ručně.</div>
    </div>`;

  aktualizujRealitaSouhrn(el, akce);

  // interaktivní vstupy nákupů
  el.querySelectorAll('[data-nakup]').forEach(karta => {
    const r = akce.realita.find(x => x.id === karta.dataset.nakup);
    karta.querySelectorAll('input[data-pole]').forEach(inp => {
      inp.oninput = () => {
        r[inp.dataset.pole] = U.num(inp.value);
        DB.uloz();
        aktualizujZbytek(karta, akce, r);
        aktualizujRealitaSouhrn(el, akce);
      };
    });
    karta.querySelector('[data-smazat]').onclick = () => {
      if (!confirm(`Smazat nákup „${r.nazev}"?`)) return;
      akce.realita = akce.realita.filter(x => x.id !== r.id);
      DB.uloz(); prekresliTab();
    };
    aktualizujZbytek(karta, akce, r);
  });

  // vrácení položky ze skladu
  el.querySelectorAll('[data-vratit]').forEach(b => b.onclick = () => {
    const r = akce.realita.find(x => x.id === b.dataset.vratit);
    let sk = DB.data.sklad.find(s => s.id === r.skladId);
    if (sk) sk.mnozstvi = U.num(sk.mnozstvi) + U.num(r.mnozstvi);
    else DB.data.sklad.push({
      id: r.skladId || U.uid(), nazev: r.nazev, kod: r.kod || '',
      mnozstvi: U.num(r.mnozstvi), jednotka: r.jednotka || '', cena: U.num(r.cena),
      zdrojAkceId: r.zdrojAkceId || null, datum: U.dnes()
    });
    akce.realita = akce.realita.filter(x => x.id !== r.id);
    DB.uloz(); U.toast('Vráceno do skladu'); prekresliTab();
  });

  el.querySelector('#rPridatNakup').onclick = () => pridatNakupModal(akce);
  el.querySelector('#rZeSkladu').onclick = () => zeSkladuModal(akce);
  el.querySelector('#rFoto').onclick = async () => {
    const soubory = await U.pickFile('image/*', true);
    if (!soubory || !soubory.length) return;
    for (const f of soubory) {
      try {
        const blob = await U.zmensiFoto(f);
        await FotoDB.pridej({ id: U.uid(), akceId: akce.id, datum: U.dnes(), zdroj: 'faktura', nazev: f.name, blob });
      } catch (e) { U.toast('Soubor se nepodařilo nahrát', 'chyba'); }
    }
    U.toast('Doklad uložen do galerie');
    nactiFotky(el.querySelector('#rFotky'), akce.id, 'faktura');
  };
  nactiFotky(el.querySelector('#rFotky'), akce.id, 'faktura');
}

function nakupKartaHtml(akce, r){
  const vazba = r.nabidkaId ? akce.nabidka.find(p => p.id === r.nabidkaId) : null;
  return `<div class="karta" data-nakup="${r.id}">
    <div class="nakup-hlava">
      <b>${U.esc(r.nazev)}</b>
      <button class="btn btn-mini btn-cerveny" data-smazat>🗑</button>
    </div>
    ${vazba ? `<div class="radek-sub">V nabídce: ${U.mn(vazba.mnozstvi)} ${U.esc(vazba.jednotka || '')} × ${U.kc(vazba.jednotkovaCenaBezDph)}</div>` : ''}
    <div class="nakup-pole">
      <label>Koupeno (${U.esc(r.jednotka || 'ks')})<input type="text" inputmode="decimal" data-pole="nakoupenoMnozstvi" value="${r.nakoupenoMnozstvi ?? ''}"></label>
      <label>Cena/MJ<input type="text" inputmode="decimal" data-pole="cena" value="${r.cena ?? ''}"></label>
      <label>Použito<input type="text" inputmode="decimal" data-pole="pouzitoMnozstvi" value="${r.pouzitoMnozstvi ?? ''}"></label>
    </div>
    <div class="nakup-zbytek" data-zbytek></div>
  </div>`;
}

function aktualizujZbytek(karta, akce, r){
  const cil = karta.querySelector('[data-zbytek]');
  const zbytek = U.num(r.nakoupenoMnozstvi) - U.num(r.pouzitoMnozstvi);
  const j = U.esc(r.jednotka || '');
  const celkem = `<span>Nákup celkem: <b>${U.kc(U.num(r.nakoupenoMnozstvi) * U.num(r.cena))}</b></span>`;

  if (r.presunutoDoSkladu) {
    cil.innerHTML = `${celkem}<span class="zbytek-ok">📦 Zbytek ${U.mn(r.presunutoMnozstvi)} ${j} přesunut do skladu</span>`;
    return;
  }
  if (zbytek > 0) {
    cil.innerHTML = `${celkem}<span><span class="zbytek-plus">Zbytek ${U.mn(zbytek)} ${j}</span>
      <button class="btn btn-mini" data-do-skladu style="margin-left:6px">→ Do skladu</button></span>`;
    cil.querySelector('[data-do-skladu]').onclick = () => presunDoSkladu(akce, r);
  } else if (zbytek < 0) {
    cil.innerHTML = `${celkem}<span class="zbytek-minus">Použito o ${U.mn(-zbytek)} ${j} víc než koupeno!</span>`;
  } else {
    cil.innerHTML = `${celkem}<span class="zbytek-ok">✓ Vše spotřebováno</span>`;
  }
}

function presunDoSkladu(akce, r){
  const zbytek = U.num(r.nakoupenoMnozstvi) - U.num(r.pouzitoMnozstvi);
  if (zbytek <= 0) return;
  const ov = U.modal(`
    <h2>Přesunout do skladu</h2>
    <div class="pole"><label>Množství (${U.esc(r.jednotka || 'ks')})</label>
      <input id="fMn" type="text" inputmode="decimal" value="${zbytek}"></div>
    <div class="pole"><label>Cena/MJ (jde upravit)</label>
      <input id="fCena" type="text" inputmode="decimal" value="${r.cena ?? ''}"></div>
    <div class="modal-akce"><button class="btn btn-plny" id="fOk">📦 Uložit do skladu</button></div>`);
  ov.querySelector('#fOk').onclick = () => {
    const mn = U.num(ov.querySelector('#fMn').value);
    if (mn <= 0) { U.toast('Zadej množství', 'chyba'); return; }
    DB.data.sklad.push({
      id: U.uid(), nazev: r.nazev, kod: r.kod || '', mnozstvi: mn,
      jednotka: r.jednotka || '', cena: U.num(ov.querySelector('#fCena').value),
      zdrojAkceId: akce.id, datum: U.dnes()
    });
    r.presunutoDoSkladu = true;
    r.presunutoMnozstvi = mn;
    DB.uloz(); U.zavriModal(ov);
    U.toast('Přesunuto do skladu'); prekresliTab();
  };
}

function aktualizujRealitaSouhrn(el, akce){
  const cil = el.querySelector('#rSouhrn');
  if (!cil) return;
  const n = nabidkaSoucty(akce);
  const r = realitaSoucty(akce);
  const vp = vicePraceCelkem(akce);
  const vydelekZaklad = n.bez - r.nakup;            // bez víceprací
  const vydelekCelkem = n.bez + vp - r.nakup;       // s vícepracemi
  const procZaklad = n.bez > 0 ? (vydelekZaklad / n.bez * 100) : 0;
  const procCelkem = (n.bez + vp) > 0 ? (vydelekCelkem / (n.bez + vp) * 100) : 0;
  cil.innerHTML = `
    <div class="souhrn-radek"><span>Nabídka (bez DPH)</span><b>${U.kc(n.bez)}</b></div>
    <div class="souhrn-radek"><span>Předpokládaný náklad (nakoupeno)</span><b>${U.kc(r.nakup)}</b></div>
    <div class="souhrn-radek"><span>Ze skladu (už zaplaceno)</span><span>${U.kc(r.zeSkladu)}</span></div>
    <div class="souhrn-radek"><span>Předpokládaný výdělek</span>
      <b class="${vydelekZaklad >= 0 ? 'plus' : 'minus'}">${vydelekZaklad >= 0 ? '+' : ''}${U.kc(vydelekZaklad)} (${procZaklad.toFixed(1)} %)</b></div>
    ${vp ? `
    <div class="souhrn-radek" style="border-top:1px solid var(--linka);padding-top:8px;margin-top:4px">
      <span>Vícepráce (nad rámec nabídky)</span><b>+ ${U.kc(vp)}</b></div>
    <div class="souhrn-radek velky"><span>Výdělek vč. víceprací</span>
      <b class="${vydelekCelkem >= 0 ? 'plus' : 'minus'}">${vydelekCelkem >= 0 ? '+' : ''}${U.kc(vydelekCelkem)} (${procCelkem.toFixed(1)} %)</b></div>` : ''}`;
}

function pridatNakupModal(akce){
  const volne = akce.nabidka;
  const ov = U.modal(`
    <h2>Přidat nákup</h2>
    <div class="pole"><label>Navázat na položku nabídky (nepovinné)</label>
      <select id="fVazba">
        <option value="">— bez vazby —</option>
        ${volne.map(p => `<option value="${p.id}">${U.esc(p.nazev)} (${U.mn(p.mnozstvi)} ${U.esc(p.jednotka || '')})</option>`).join('')}
      </select></div>
    <div class="pole"><label>Název</label><input id="fNazev"></div>
    <div class="pole-rada">
      <div class="pole"><label>Koupeno</label><input id="fKoupeno" type="text" inputmode="decimal"></div>
      <div class="pole"><label>Jednotka</label><input id="fJednotka" value="ks"></div>
    </div>
    <div class="pole-rada">
      <div class="pole"><label>Cena/MJ</label><input id="fCena" type="text" inputmode="decimal"></div>
      <div class="pole"><label>Použito</label><input id="fPouzito" type="text" inputmode="decimal"></div>
    </div>
    <div class="modal-akce"><button class="btn btn-plny" id="fOk">Přidat</button></div>`);

  const sel = ov.querySelector('#fVazba');
  sel.onchange = () => {
    const p = akce.nabidka.find(x => x.id === sel.value);
    if (!p) return;
    ov.querySelector('#fNazev').value = p.nazev;
    ov.querySelector('#fJednotka').value = p.jednotka || 'ks';
    ov.querySelector('#fKoupeno').value = p.mnozstvi;
    ov.querySelector('#fPouzito').value = p.mnozstvi;
    ov.querySelector('#fCena').value = p.jednotkovaCenaBezDph;
  };
  ov.querySelector('#fOk').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
    const koupeno = U.num(ov.querySelector('#fKoupeno').value);
    const pouzitoRaw = ov.querySelector('#fPouzito').value.trim();
    akce.realita.push({
      id: U.uid(), typ: 'nakup',
      nabidkaId: sel.value || null, nazev,
      jednotka: ov.querySelector('#fJednotka').value.trim(),
      nakoupenoMnozstvi: koupeno,
      cena: U.num(ov.querySelector('#fCena').value),
      pouzitoMnozstvi: pouzitoRaw === '' ? koupeno : U.num(pouzitoRaw)
    });
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  };
}

function zeSkladuModal(akce){
  const dostupne = DB.data.sklad.filter(s => U.num(s.mnozstvi) > 0);
  const ov = U.modal(`
    <h2>Použít ze skladu</h2>
    ${dostupne.length ? `
    <div class="pole"><label>Položka skladu</label>
      <select id="fSklad">
        ${dostupne.map(s => `<option value="${s.id}">${U.esc(s.nazev)} — ${U.mn(s.mnozstvi)} ${U.esc(s.jednotka || '')} (${U.kc(s.cena)}/MJ)</option>`).join('')}
      </select></div>
    <div class="pole"><label>Množství</label><input id="fMn" type="text" inputmode="decimal"></div>
    <div class="modal-akce"><button class="btn btn-plny" id="fOk">Použít</button></div>`
    : '<div class="prazdno">Sklad je prázdný</div>'}`);

  const ok = ov.querySelector('#fOk');
  if (!ok) return;
  ok.onclick = () => {
    const s = DB.data.sklad.find(x => x.id === ov.querySelector('#fSklad').value);
    const mn = U.num(ov.querySelector('#fMn').value);
    if (mn <= 0) { U.toast('Zadej množství', 'chyba'); return; }
    if (mn > U.num(s.mnozstvi)) { U.toast(`Ve skladu je jen ${U.mn(s.mnozstvi)} ${s.jednotka || ''}`, 'chyba'); return; }
    s.mnozstvi = U.num(s.mnozstvi) - mn;
    akce.realita.push({
      id: U.uid(), typ: 'sklad', skladId: s.id, nazev: s.nazev, kod: s.kod || '',
      jednotka: s.jednotka || '', mnozstvi: mn, cena: U.num(s.cena),
      zdrojAkceId: s.zdrojAkceId || null
    });
    if (U.num(s.mnozstvi) <= 0) DB.data.sklad = DB.data.sklad.filter(x => x.id !== s.id);
    DB.uloz(); U.zavriModal(ov);
    U.toast('Odečteno ze skladu'); prekresliTab();
  };
}

/* ============================================================
   ZÁLOŽKA: VÍCE PRÁCE
   ============================================================ */
function tabVicePrace(el, akce){
  const celkem = vicePraceCelkem(akce);
  el.innerHTML = `
    <button class="btn btn-plny btn-velky" id="vPridat">+ Přidat vícepráci</button>
    ${akce.vicePrace.length ? akce.vicePrace.map(v => `
      <div class="radek" data-id="${v.id}" style="cursor:pointer">
        <div class="radek-info">
          <div class="radek-nazev">${U.esc(v.nazev)}</div>
          <div class="radek-sub">${U.fmtDatum(v.datum)}${v.popis ? ' · ' + U.esc(v.popis) : ''} · ${U.mn(v.mnozstvi)} × ${U.kc(v.cena)}</div>
        </div>
        <div class="radek-cena">${U.kc(U.num(v.mnozstvi) * U.num(v.cena))}</div>
      </div>`).join('') : '<div class="prazdno">Žádné vícepráce</div>'}
    <div class="karta souhrn">
      <div class="souhrn-radek velky" style="border:none;padding:0;margin:0"><span>Vícepráce celkem</span><b>${U.kc(celkem)}</b></div>
    </div>`;

  el.querySelector('#vPridat').onclick = () => vicePraceModal(akce, null);
  el.querySelectorAll('.radek[data-id]').forEach(r =>
    r.onclick = () => vicePraceModal(akce, akce.vicePrace.find(v => v.id === r.dataset.id)));
}

function vicePraceModal(akce, v){
  const x = v || {};
  const ov = U.modal(`
    <h2>${v ? 'Upravit vícepráci' : 'Nová vícepráce'}</h2>
    <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(x.nazev || '')}"></div>
    <div class="pole"><label>Popis</label><input id="fPopis" value="${U.esc(x.popis || '')}"></div>
    <div class="pole-rada">
      <div class="pole"><label>Množství</label><input id="fMn" type="text" inputmode="decimal" value="${x.mnozstvi ?? 1}"></div>
      <div class="pole"><label>Cena/MJ</label><input id="fCena" type="text" inputmode="decimal" value="${x.cena ?? ''}"></div>
    </div>
    <div class="pole"><label>Datum</label><input id="fDatum" type="date" value="${x.datum || U.dnes()}"></div>
    <div class="modal-akce">
      ${v ? '<button class="btn btn-cerveny" id="fSmazat">Smazat</button>' : ''}
      <button class="btn btn-plny" id="fUlozit">Uložit</button>
    </div>`);

  ov.querySelector('#fUlozit').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
    const data = {
      nazev, popis: ov.querySelector('#fPopis').value.trim(),
      mnozstvi: U.num(ov.querySelector('#fMn').value),
      cena: U.num(ov.querySelector('#fCena').value),
      datum: ov.querySelector('#fDatum').value || U.dnes()
    };
    if (v) Object.assign(v, data);
    else akce.vicePrace.push({ id: U.uid(), ...data });
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  };
  const sm = ov.querySelector('#fSmazat');
  if (sm) sm.onclick = () => {
    akce.vicePrace = akce.vicePrace.filter(i => i.id !== v.id);
    DB.uloz(); U.zavriModal(ov); prekresliTab();
  };
}

/* ============================================================
   ZÁLOŽKA: STAVEBNÍ DENÍK
   ============================================================ */
let aktivniDiktovani = null;

function tabDenik(el, akce){
  const dny = [...akce.denik].sort((a, b) => b.datum.localeCompare(a.datum));
  el.innerHTML = `
    <button class="btn btn-plny btn-velky" id="dNovy">+ Nový zápis dne</button>
    ${dny.map(z => `
      <div class="karta denik-den" data-den="${z.id}">
        <div class="denik-hlava">
          <b>${U.fmtDatum(z.datum)}</b>
          <button class="icon-btn" data-mic title="Diktovat">🎤</button>
          <button class="icon-btn" data-foto title="Přidat fotky">📷</button>
          <button class="icon-btn" data-smazat title="Smazat den">🗑</button>
        </div>
        <textarea placeholder="Co se dnes dělalo…">${U.esc(z.text || '')}</textarea>
        <div class="denik-fotky" data-fotky></div>
      </div>`).join('') || '<div class="prazdno">Deník je prázdný.<br>Založ zápis a diktuj mikrofonem 🎤</div>'}`;

  el.querySelector('#dNovy').onclick = () => {
    const ov = U.modal(`
      <h2>Nový zápis</h2>
      <div class="pole"><label>Datum</label><input id="fDatum" type="date" value="${U.dnes()}"></div>
      <div class="modal-akce"><button class="btn btn-plny" id="fOk">Založit</button></div>`);
    ov.querySelector('#fOk').onclick = () => {
      const datum = ov.querySelector('#fDatum').value || U.dnes();
      if (akce.denik.some(z => z.datum === datum)) { U.toast('Zápis pro tento den už existuje', 'chyba'); return; }
      akce.denik.push({ id: U.uid(), datum, text: '' });
      DB.uloz(); U.zavriModal(ov); prekresliTab();
    };
  };

  el.querySelectorAll('[data-den]').forEach(blok => {
    const z = akce.denik.find(x => x.id === blok.dataset.den);
    const ta = blok.querySelector('textarea');
    ta.oninput = U.debounce(() => { z.text = ta.value; DB.uloz(); }, 400);

    blok.querySelector('[data-mic]').onclick = e => toggleDiktovani(e.currentTarget, ta, z);

    blok.querySelector('[data-foto]').onclick = async () => {
      const soubory = await U.pickFile('image/*', true);
      if (!soubory || !soubory.length) return;
      for (const f of soubory) {
        try {
          const blob = await U.zmensiFoto(f);
          await FotoDB.pridej({ id: U.uid(), akceId: akce.id, datum: z.datum, zdroj: 'denik', nazev: f.name, blob });
        } catch (err) { U.toast('Fotku se nepodařilo nahrát', 'chyba'); }
      }
      nactiFotky(blok.querySelector('[data-fotky]'), akce.id, 'denik', z.datum);
    };

    blok.querySelector('[data-smazat]').onclick = () => {
      if (!confirm(`Smazat zápis z ${U.fmtDatum(z.datum)}? (fotky zůstanou v galerii)`)) return;
      akce.denik = akce.denik.filter(x => x.id !== z.id);
      DB.uloz(); prekresliTab();
    };

    nactiFotky(blok.querySelector('[data-fotky]'), akce.id, 'denik', z.datum);
  });
}

function toggleDiktovani(btn, textarea, zaznam){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    U.toast('Prohlížeč diktování neumí – použij mikrofon 🎤 na klávesnici telefonu', 'chyba');
    textarea.focus();
    return;
  }

  // druhé ťuknutí = stop
  if (aktivniDiktovani) {
    aktivniDiktovani.chciDiktovat = false;
    try { aktivniDiktovani.stop(); } catch (e) {}
    return;
  }

  const r = new SR();
  r.lang = 'cs-CZ';
  r.continuous = true;
  r.interimResults = true;
  r.chciDiktovat = true;

  const puvodniPlaceholder = textarea.placeholder;

  r.onresult = e => {
    let finalni = '', prubezne = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalni += e.results[i][0].transcript;
      else prubezne += e.results[i][0].transcript;
    }
    if (finalni) {
      const mezera = textarea.value && !/\s$/.test(textarea.value) ? ' ' : '';
      textarea.value += mezera + finalni.trim();
      zaznam.text = textarea.value;
      DB.uloz();
      textarea.scrollTop = textarea.scrollHeight;
    }
    // průběžný náhled toho, co appka právě slyší
    textarea.placeholder = prubezne ? '… ' + prubezne : puvodniPlaceholder;
  };

  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      r.chciDiktovat = false;
      U.toast('Povol appce přístup k mikrofonu (nastavení prohlížeče)', 'chyba');
    } else if (e.error === 'network') {
      r.chciDiktovat = false;
      U.toast('Diktování potřebuje internet', 'chyba');
    }
    // 'no-speech' a 'aborted' neřešíme – onend to restartuje
  };

  // prohlížeč rozpoznávání sám po pauze vypíná → dokud uživatel nezastavil, nastartovat znovu
  r.onend = () => {
    if (r.chciDiktovat) {
      try { r.start(); return; } catch (e) {}
    }
    aktivniDiktovani = null;
    btn.classList.remove('nahravam');
    textarea.placeholder = puvodniPlaceholder;
  };

  try { r.start(); } catch (e) { U.toast('Diktování se nepodařilo spustit', 'chyba'); return; }
  aktivniDiktovani = r;
  btn.classList.add('nahravam');
  U.toast('🎤 Diktuj… (dalším ťuknutím zastavíš)');
}

/* ============================================================
   ZÁLOŽKA: GALERIE
   ============================================================ */
async function tabGalerie(el, akce){
  el.innerHTML = `
    <div class="btn-rada">
      <button class="btn btn-plny" id="gPridat">📷 Přidat fotky</button>
      <button class="btn" id="gZip">⬇ Export ZIP</button>
    </div>
    <div class="galerie-grid" id="gGrid"><div class="prazdno">Načítám…</div></div>`;

  const grid = el.querySelector('#gGrid');
  const badge = { denik: 'deník', faktura: 'doklad', galerie: 'foto' };

  async function vypis(){
    let fotky = [];
    try { fotky = await FotoDB.proAkci(akce.id); } catch (e) {}
    fotky.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    if (!fotky.length) { grid.innerHTML = '<div class="prazdno" style="grid-column:1/-1">Žádné fotky</div>'; return; }
    grid.innerHTML = fotky.map(f => `
      <div class="foto" data-id="${f.id}">
        <img alt="" loading="lazy">
        <span class="foto-badge">${badge[f.zdroj] || 'foto'}</span>
      </div>`).join('');
    grid.querySelectorAll('.foto').forEach(div => {
      const f = fotky.find(x => x.id === div.dataset.id);
      div.querySelector('img').src = URL.createObjectURL(f.blob);
      div.onclick = () => {
        const ov = U.modal(`
          <div class="lightbox"><img src="${URL.createObjectURL(f.blob)}"></div>
          <div class="radek-sub" style="margin-top:8px">${U.fmtDatum(f.datum)} · ${badge[f.zdroj] || 'foto'}${f.nazev ? ' · ' + U.esc(f.nazev) : ''}</div>
          <div class="modal-akce">
            <button class="btn btn-cerveny" id="lSmazat">🗑 Smazat</button>
            <button class="btn btn-obrys" id="lZavrit">Zavřít</button>
          </div>`);
        ov.querySelector('#lZavrit').onclick = () => U.zavriModal(ov);
        ov.querySelector('#lSmazat').onclick = async () => {
          if (!confirm('Smazat fotku?')) return;
          await FotoDB.smaz(f.id);
          U.zavriModal(ov); vypis();
        };
      };
    });
  }
  vypis();

  el.querySelector('#gPridat').onclick = async () => {
    const soubory = await U.pickFile('image/*', true);
    if (!soubory || !soubory.length) return;
    for (const f of soubory) {
      try {
        const blob = await U.zmensiFoto(f);
        await FotoDB.pridej({ id: U.uid(), akceId: akce.id, datum: U.dnes(), zdroj: 'galerie', nazev: f.name, blob });
      } catch (e) { U.toast('Fotku se nepodařilo nahrát', 'chyba'); }
    }
    vypis();
  };

  el.querySelector('#gZip').onclick = () => exportujZip(akce);
}

async function exportujZip(akce){
  if (typeof JSZip === 'undefined') { U.toast('Export se ještě načítá, zkus to za chvíli', 'chyba'); return; }
  U.toast('Připravuji ZIP…');
  const zip = new JSZip();
  const data = {
    exportovano: new Date().toISOString(),
    akce: { ...akce },
    nastaveni: DB.data.nastaveni
  };
  zip.file('akce.json', JSON.stringify(data, null, 2));

  let fotky = [];
  try { fotky = await FotoDB.proAkci(akce.id); } catch (e) {}
  const slozka = zip.folder('fotky');
  for (const f of fotky) {
    slozka.file(`${f.datum || 'bez-data'}_${f.zdroj || 'foto'}_${f.id}.jpg`, f.blob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const bezpecnyNazev = akce.nazev.replace(/[^\w\děščřžýáíéúůťďňó -]/gi, '').trim().replace(/\s+/g, '-') || 'akce';
  U.stahni(blob, `${bezpecnyNazev}_${U.dnes()}.zip`);
  U.toast(`Export hotový (${fotky.length} fotek)`);
}

/* ---- pomocné: náhledy fotek ---- */
async function nactiFotky(cil, akceId, zdroj, datum){
  if (!cil) return;
  let fotky = [];
  try { fotky = await FotoDB.proAkci(akceId); } catch (e) {}
  fotky = fotky.filter(f => f.zdroj === zdroj && (!datum || f.datum === datum));
  cil.innerHTML = '';
  for (const f of fotky) {
    const img = document.createElement('img');
    img.className = 'foto-mini';
    img.src = URL.createObjectURL(f.blob);
    img.onclick = () => {
      const ov = U.modal(`
        <div class="lightbox"><img src="${URL.createObjectURL(f.blob)}"></div>
        <div class="modal-akce">
          <button class="btn btn-cerveny" id="lSmazat">🗑 Smazat</button>
          <button class="btn btn-obrys" id="lZavrit">Zavřít</button>
        </div>`);
      ov.querySelector('#lZavrit').onclick = () => U.zavriModal(ov);
      ov.querySelector('#lSmazat').onclick = async () => {
        if (!confirm('Smazat fotku?')) return;
        await FotoDB.smaz(f.id);
        U.zavriModal(ov);
        nactiFotky(cil, akceId, zdroj, datum);
      };
    };
    cil.appendChild(img);
  }
}
