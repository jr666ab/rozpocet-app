/* ===== Úvodní obrazovka – seznam akcí ===== */
function renderHome(el){
  document.getElementById('titulek').textContent = 'Rozpočty';
  const akce = DB.data.akce;

  el.innerHTML = `
    <button class="btn btn-plny btn-velky" id="novaAkce">+ Nová akce</button>
    ${akce.length ? akce.map(a => {
      const s = nabidkaSoucty(a);
      return `<div class="karta akce-karta" data-id="${a.id}">
        <div class="radek-info">
          <div class="akce-nazev">${U.esc(a.nazev)}</div>
          <div class="radek-sub">${a.adresa ? U.esc(a.adresa) + ' · ' : ''}${U.fmtDatum(a.datumZalozeni)}</div>
        </div>
        <div class="akce-karta-vpravo">
          <span class="badge badge-${a.status}">${STATUS_NAZVY[a.status] || a.status}</span>
          <div class="akce-cena">${U.kc(s.bez)}</div>
        </div>
      </div>`;
    }).join('') : `<div class="prazdno">Zatím tu není žádná akce.<br>Založ první tlačítkem nahoře 👆</div>`}`;

  el.querySelector('#novaAkce').onclick = () => {
    const ov = U.modal(`
      <h2>Nová akce</h2>
      <div class="pole"><label>Název</label><input id="fNazev" placeholder="např. RD Novákovi – elektro"></div>
      <div class="pole"><label>Adresa</label><input id="fAdresa" placeholder="nepovinné"></div>
      <div class="modal-akce"><button class="btn btn-plny" id="fOk">Založit akci</button></div>`);
    const inp = ov.querySelector('#fNazev'); inp.focus();
    ov.querySelector('#fOk').onclick = () => {
      const nazev = inp.value.trim();
      if (!nazev) { U.toast('Zadej název akce', 'chyba'); return; }
      const a = DB.novaAkce(nazev, ov.querySelector('#fAdresa').value.trim());
      U.zavriModal(ov);
      location.hash = `#/akce/${a.id}/nabidka`;
    };
  };

  el.querySelectorAll('.akce-karta').forEach(k =>
    k.onclick = () => { location.hash = `#/akce/${k.dataset.id}/nabidka`; });
}
