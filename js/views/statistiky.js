/* ===== Statistiky napříč akcemi ===== */
function renderStatistiky(el){
  document.getElementById('titulek').textContent = 'Přehled';
  const akce = DB.data.akce;
  const aktivni = akce.filter(a => a.status === 'prijato').length;
  const hotove = akce.filter(a => a.status === 'hotovo').length;
  const skladHodnota = DB.data.sklad.reduce((s, p) => s + U.num(p.mnozstvi) * U.num(p.cena), 0);

  const relevantni = akce.filter(a => a.status === 'prijato' || a.status === 'hotovo');
  let celkovaMarze = 0;

  const radky = relevantni.map(a => {
    const n = nabidkaSoucty(a).bez;
    const v = vicePraceCelkem(a);
    const r = realitaSoucty(a).nakup;
    const marze = n + v - r;
    celkovaMarze += marze;
    const proc = (n + v) > 0 ? (marze / (n + v) * 100) : 0;
    return `<div class="karta" data-id="${a.id}" style="cursor:pointer">
      <div class="nakup-hlava">
        <b>${U.esc(a.nazev)}</b>
        <span class="badge badge-${a.status}">${STATUS_NAZVY[a.status]}</span>
      </div>
      <div class="souhrn" style="margin-top:8px">
        <div class="souhrn-radek"><span>Nabídka</span><span>${U.kc(n)}</span></div>
        ${v ? `<div class="souhrn-radek"><span>Vícepráce</span><span>+ ${U.kc(v)}</span></div>` : ''}
        <div class="souhrn-radek"><span>Nakoupeno</span><span>− ${U.kc(r)}</span></div>
        <div class="souhrn-radek velky"><span>Marže</span>
          <b class="${marze >= 0 ? 'plus' : 'minus'}">${U.kc(marze)} (${proc.toFixed(1)} %)</b></div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="stat-mrizka">
      <div class="stat-karta"><div class="stat-cislo">${aktivni}</div><div class="stat-popis">rozjeté akce</div></div>
      <div class="stat-karta"><div class="stat-cislo">${hotove}</div><div class="stat-popis">hotové akce</div></div>
      <div class="stat-karta"><div class="stat-cislo">${U.kc(skladHodnota)}</div><div class="stat-popis">hodnota skladu</div></div>
      <div class="stat-karta"><div class="stat-cislo ${celkovaMarze >= 0 ? '' : 'minus'}">${U.kc(celkovaMarze)}</div><div class="stat-popis">marže celkem</div></div>
    </div>
    <div class="sekce-nadpis">Akce (přijaté a hotové)</div>
    ${radky || '<div class="prazdno">Zatím žádné přijaté akce</div>'}`;

  el.querySelectorAll('.karta[data-id]').forEach(k =>
    k.onclick = () => { location.hash = `#/akce/${k.dataset.id}/realita`; });
}
