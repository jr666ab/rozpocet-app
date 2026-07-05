/* ===== Sklad – globální napříč akcemi ===== */
function renderSklad(el){
  document.getElementById('titulek').textContent = 'Sklad';
  const sklad = DB.data.sklad;
  const hodnota = sklad.reduce((s, p) => s + U.num(p.mnozstvi) * U.num(p.cena), 0);

  el.innerHTML = `
    <div class="stat-mrizka">
      <div class="stat-karta"><div class="stat-cislo">${sklad.length}</div><div class="stat-popis">položek</div></div>
      <div class="stat-karta"><div class="stat-cislo">${U.kc(hodnota)}</div><div class="stat-popis">hodnota skladu</div></div>
    </div>
    <button class="btn btn-plny btn-velky" id="sPridat">+ Přidat položku</button>
    <input class="hledani" id="sHledat" placeholder="Hledat ve skladu…">
    <div id="sSeznam"></div>`;

  const seznam = el.querySelector('#sSeznam');
  const hledat = el.querySelector('#sHledat');

  function vypis(){
    const q = hledat.value.trim().toLowerCase();
    const polozky = sklad.filter(p =>
      !q || (p.nazev || '').toLowerCase().includes(q) || (p.kod || '').toLowerCase().includes(q));
    seznam.innerHTML = polozky.length ? polozky.map(p => {
      const zdroj = p.zdrojAkceId ? DB.akce(p.zdrojAkceId) : null;
      return `<div class="radek" data-id="${p.id}" style="cursor:pointer">
        <div class="radek-info">
          <div class="radek-nazev">${U.esc(p.nazev)}${p.kod ? `<span class="stitek">${U.esc(p.kod)}</span>` : ''}</div>
          <div class="radek-sub">${U.mn(p.mnozstvi)} ${U.esc(p.jednotka || '')} × ${U.kc(p.cena)}${zdroj ? ' · z akce ' + U.esc(zdroj.nazev) : ''} · ${U.fmtDatum(p.datum)}</div>
        </div>
        <div class="radek-cena">${U.kc(U.num(p.mnozstvi) * U.num(p.cena))}</div>
      </div>`;
    }).join('') : `<div class="prazdno">${sklad.length ? 'Nic nenalezeno' : 'Sklad je prázdný.<br>Plní se zbytky z akcí nebo ručně.'}</div>`;

    seznam.querySelectorAll('.radek').forEach(r =>
      r.onclick = () => skladPolozkaModal(sklad.find(p => p.id === r.dataset.id)));
  }
  hledat.oninput = U.debounce(vypis, 200);
  vypis();

  el.querySelector('#sPridat').onclick = () => skladPolozkaModal(null);
}

function skladPolozkaModal(p){
  const x = p || {};
  const ov = U.modal(`
    <h2>${p ? 'Upravit položku skladu' : 'Nová položka skladu'}</h2>
    <div class="pole"><label>Název</label><input id="fNazev" value="${U.esc(x.nazev || '')}"></div>
    <div class="pole"><label>Kód (nepovinné)</label><input id="fKod" value="${U.esc(x.kod || '')}"></div>
    <div class="pole-rada">
      <div class="pole"><label>Množství</label><input id="fMn" type="text" inputmode="decimal" value="${x.mnozstvi ?? ''}"></div>
      <div class="pole"><label>Jednotka</label><input id="fJednotka" value="${U.esc(x.jednotka || 'ks')}"></div>
    </div>
    <div class="pole"><label>Cena/MJ</label><input id="fCena" type="text" inputmode="decimal" value="${x.cena ?? ''}"></div>
    <div class="modal-akce">
      ${p ? '<button class="btn btn-cerveny" id="fSmazat">Smazat</button>' : ''}
      <button class="btn btn-plny" id="fUlozit">Uložit</button>
    </div>`);

  ov.querySelector('#fUlozit').onclick = () => {
    const nazev = ov.querySelector('#fNazev').value.trim();
    if (!nazev) { U.toast('Zadej název', 'chyba'); return; }
    const data = {
      nazev, kod: ov.querySelector('#fKod').value.trim(),
      mnozstvi: U.num(ov.querySelector('#fMn').value),
      jednotka: ov.querySelector('#fJednotka').value.trim(),
      cena: U.num(ov.querySelector('#fCena').value)
    };
    if (p) Object.assign(p, data);
    else DB.data.sklad.push({ id: U.uid(), zdrojAkceId: null, datum: U.dnes(), ...data });
    DB.uloz(); U.zavriModal(ov); render();
  };
  const sm = ov.querySelector('#fSmazat');
  if (sm) sm.onclick = () => {
    if (!confirm(`Smazat „${p.nazev}" ze skladu?`)) return;
    DB.data.sklad = DB.data.sklad.filter(i => i.id !== p.id);
    DB.uloz(); U.zavriModal(ov); render();
  };
}
