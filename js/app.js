/* ===== Router + start aplikace ===== */

function render(){
  const h = location.hash || '#/akce';
  const casti = h.split('/');          // ['#', 'akce', 'ID', 'tab']
  const sekce = casti[1] || 'akce';
  const id = casti[2];
  const tab = casti[3];

  const view = document.getElementById('view');
  const zpet = document.getElementById('btnZpet');

  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('aktivni', ('#/' + sekce).startsWith(b.dataset.route)));

  if (sekce === 'akce' && id) {
    zpet.classList.remove('skryt');
    renderAkceDetail(view, id, tab || 'nabidka');
  } else {
    zpet.classList.add('skryt');
    if (sekce === 'sklad') renderSklad(view);
    else if (sekce === 'databaze') renderDatabaze(view, id);
    else if (sekce === 'statistiky') renderStatistiky(view);
    else renderHome(view);
  }
  window.scrollTo(0, 0);
}

function nastaveniModal(){
  const n = DB.data.nastaveni;
  const ov = U.modal(`
    <h2>Moje firma (pro PDF nabídky)</h2>
    <div class="pole"><label>Jméno / firma</label><input id="nFirma" value="${U.esc(n.firma || '')}"></div>
    <div class="pole"><label>Adresa</label><input id="nAdresa" value="${U.esc(n.adresa || '')}"></div>
    <div class="pole-rada">
      <div class="pole"><label>IČO</label><input id="nIco" value="${U.esc(n.ico || '')}"></div>
      <div class="pole"><label>DIČ</label><input id="nDic" value="${U.esc(n.dic || '')}"></div>
    </div>
    <div class="pole-rada">
      <div class="pole"><label>Telefon</label><input id="nTel" value="${U.esc(n.telefon || '')}"></div>
      <div class="pole"><label>E-mail</label><input id="nEmail" value="${U.esc(n.email || '')}"></div>
    </div>
    <div class="sekce-nadpis" style="margin-left:0">Ceník a ceny</div>
    <div class="pole-rada">
      <div class="pole"><label>Výchozí sazba DPH %</label><input id="nDph" type="text" inputmode="numeric" value="${U.num(n.vychoziDph ?? 21)}"></div>
      <div class="pole"><label>Přirážka na ceník %</label><input id="nPrir" type="text" inputmode="decimal" value="${U.num(n.prirazka ?? 0)}"></div>
    </div>
    <div class="radek-sub" style="margin:-4px 0 4px">Přirážka navýší všechny ceny z ceníku o dané % (např. 15 = ceny +15 %). Používá se v ceníku i při vkládání do nabídky.</div>
    <div class="modal-akce"><button class="btn btn-plny" id="nUlozit">Uložit</button></div>
    <div class="radek-sub" style="margin-top:12px">
      Cloud: ${window.Sync && Sync.stav === 'zapnuto' ? '✅ záloha běží' : (window.FIREBASE_CONFIG ? '⏳ připojuji…' : '⚪ vypnutý (data jen v zařízení)')}
      ${window.Sync && Sync.uid ? `<br>ID zařízení: <code style="user-select:all">${Sync.uid}</code>` : ''}
    </div>`);

  ov.querySelector('#nUlozit').onclick = () => {
    Object.assign(DB.data.nastaveni, {
      firma: ov.querySelector('#nFirma').value.trim(),
      adresa: ov.querySelector('#nAdresa').value.trim(),
      ico: ov.querySelector('#nIco').value.trim(),
      dic: ov.querySelector('#nDic').value.trim(),
      telefon: ov.querySelector('#nTel').value.trim(),
      email: ov.querySelector('#nEmail').value.trim(),
      vychoziDph: U.num(ov.querySelector('#nDph').value) || 21,
      prirazka: U.num(ov.querySelector('#nPrir').value)
    });
    DB.uloz(); U.zavriModal(ov);
    U.toast('Nastavení uloženo');
    render();
  };
}

/* ---- start ---- */
DB.init();

document.getElementById('btnZpet').onclick = () => { location.hash = '#/akce'; };
document.getElementById('btnNastaveni').onclick = nastaveniModal;
document.querySelectorAll('#nav button').forEach(b =>
  b.onclick = () => { location.hash = b.dataset.route; });

window.addEventListener('hashchange', render);
render();

if (window.Sync) Sync.start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
