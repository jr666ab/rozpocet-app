/* ===== Přehled – statistiky napříč akcemi =====
   obrat  = nabídka bez DPH + vícepráce
   náklad = skutečné nákupy (realita)
   Předpoklad nákladů u rozjetých akcí: větší z (dosavadní nákupy,
   obrat × průměrný podíl nákladů z hotových akcí). */

function akceObrat(a){ return nabidkaSoucty(a).bez + vicePraceCelkem(a); }
function akceNaklad(a){ return realitaSoucty(a).nakup; }

function renderStatistiky(el){
  document.getElementById('titulek').textContent = 'Přehled';
  const akce = DB.data.akce;
  const rok = new Date().getFullYear();

  const rozjete = akce.filter(a => a.status === 'prijato');
  const hotove = akce.filter(a => a.status === 'hotovo');
  const hotoveLetos = hotove.filter(a =>
    String(a.datumDokonceni || a.datumZalozeni || '').startsWith(String(rok)));

  // obraty
  const obratHotove = hotove.reduce((s, a) => s + akceObrat(a), 0);
  const obratRozjete = rozjete.reduce((s, a) => s + akceObrat(a), 0);
  const obratSPlanem = obratHotove + obratRozjete;

  // náklady
  const nakladyCelkem = akce.reduce((s, a) => s + akceNaklad(a), 0);
  const nakladyHotove = hotove.reduce((s, a) => s + akceNaklad(a), 0);

  // průměrný podíl nákladů z hotových akcí (pro odhad u rozjetých)
  const podil = obratHotove > 0 ? nakladyHotove / obratHotove : null;

  let predpokladNakladyRozjete = 0;
  for (const a of rozjete) {
    const skutecne = akceNaklad(a);
    const odhad = podil != null ? akceObrat(a) * podil : 0;
    predpokladNakladyRozjete += Math.max(skutecne, odhad);
  }
  const predpokladVydelekRozjete = obratRozjete - predpokladNakladyRozjete;

  // výdělek za rok (hotové letos)
  const vydelekZaRok = hotoveLetos.reduce((s, a) => s + akceObrat(a) - akceNaklad(a), 0);

  const skladHodnota = DB.data.sklad.reduce((s, p) => s + U.num(p.mnozstvi) * U.num(p.cena), 0);

  const karta = (cislo, popis, barva) =>
    `<div class="stat-karta"><div class="stat-cislo${barva ? ' ' + barva : ''}">${cislo}</div><div class="stat-popis">${popis}</div></div>`;

  const relevantni = akce.filter(a => a.status === 'prijato' || a.status === 'hotovo');
  const radky = relevantni.map(a => {
    const n = nabidkaSoucty(a).bez;
    const v = vicePraceCelkem(a);
    const r = akceNaklad(a);
    const marze = n + v - r;
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
        <div class="souhrn-radek velky"><span>Výdělek</span>
          <b class="${marze >= 0 ? 'plus' : 'minus'}">${U.kc(marze)} (${proc.toFixed(1)} %)</b></div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="sekce-nadpis">Zakázky</div>
    <div class="stat-mrizka">
      ${karta(rozjete.length, 'rozjeté zakázky')}
      ${karta(hotoveLetos.length, `hotové akce ${rok}`)}
    </div>

    <div class="sekce-nadpis">Obrat</div>
    <div class="stat-mrizka">
      ${karta(U.kc(obratHotove), 'obrat – hotové akce')}
      ${karta(U.kc(obratSPlanem), 'obrat vč. rozjetých (s plánem)')}
    </div>

    <div class="sekce-nadpis">Náklady</div>
    <div class="stat-mrizka">
      ${karta(U.kc(nakladyCelkem), 'náklady celkem (nakoupeno)')}
      ${karta(U.kc(predpokladNakladyRozjete), 'předpokl. náklady – rozjeté akce')}
    </div>

    <div class="sekce-nadpis">Výdělek</div>
    <div class="stat-mrizka">
      ${karta(U.kc(predpokladVydelekRozjete), 'předpokl. výdělek – rozjeté akce', predpokladVydelekRozjete >= 0 ? 'plus' : 'minus')}
      ${karta(U.kc(vydelekZaRok), `výdělek ${rok} (hotové akce)`, vydelekZaRok >= 0 ? 'plus' : 'minus')}
    </div>

    <div class="stat-mrizka">
      ${karta(U.kc(skladHodnota), 'hodnota skladu')}
      ${karta(hotove.length, 'hotové akce celkem')}
    </div>
    ${podil != null ? `<div class="radek-sub" style="margin:0 4px 12px">Odhad nákladů u rozjetých akcí vychází z hotových zakázek (náklady tvoří ~${(podil * 100).toFixed(0)} % obratu) a z toho, co už je nakoupeno.</div>`
      : '<div class="radek-sub" style="margin:0 4px 12px">Odhad nákladů u rozjetých akcí zatím vychází jen z toho, co je nakoupeno – zpřesní se po první hotové zakázce.</div>'}

    <div class="sekce-nadpis">Akce (přijaté a hotové)</div>
    ${radky || '<div class="prazdno">Zatím žádné přijaté akce</div>'}`;

  el.querySelectorAll('.karta[data-id]').forEach(k =>
    k.onclick = () => { location.hash = `#/akce/${k.dataset.id}/realita`; });
}
