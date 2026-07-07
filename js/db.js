/* ===== Datová vrstva =====
   Strukturovaná data: localStorage (JSON)
   Fotky: IndexedDB (blob)
   Pozn.: připraveno tak, aby šlo později vyměnit za Firebase (stejná struktura jako spec). */

window.DB = {
  KEY: 'rozpocet_v1',
  data: null,

  init(){
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.data = null; }
    if (!this.data || typeof this.data !== 'object') this.data = {};
    const d = this.data;
    d.akce     = Array.isArray(d.akce)     ? d.akce     : [];
    d.sklad    = Array.isArray(d.sklad)    ? d.sklad    : [];
    d.polozky  = Array.isArray(d.polozky)  ? d.polozky  : [];   // ceník materiálu
    d.prace    = Array.isArray(d.prace)    ? d.prace    : [];   // ceník prací
    d.vzory    = Array.isArray(d.vzory)    ? d.vzory    : [];
    d.nastaveni = d.nastaveni && typeof d.nastaveni === 'object' ? d.nastaveni : {};
    if (d.nastaveni.vychoziDph == null) d.nastaveni.vychoziDph = 21;
    if (d.nastaveni.prirazka == null) d.nastaveni.prirazka = 0;
    for (const a of d.akce) {
      a.nabidka   = Array.isArray(a.nabidka)   ? a.nabidka   : [];
      a.realita   = Array.isArray(a.realita)   ? a.realita   : [];
      a.vicePrace = Array.isArray(a.vicePrace) ? a.vicePrace : [];
      a.denik     = Array.isArray(a.denik)     ? a.denik     : [];
      a.zalohy    = Array.isArray(a.zalohy)    ? a.zalohy    : [];
      a.faktury   = Array.isArray(a.faktury)   ? a.faktury   : [];
    }
  },

  uloz(){
    this.data.lastZmena = Date.now();
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
    catch (e) { U.toast('Data se nepodařilo uložit – plné úložiště?', 'chyba'); }
    if (window.Sync) Sync.naplanujPush();
  },

  /* uložení po změně ceníků (materiál/práce/vzory) – ty se sdílí se všemi */
  ulozSdilene(){
    this.data.cenikyZmena = Date.now();
    this.uloz();
  },

  /* výchozí sazba DPH z nastavení (⚙) */
  dph(){
    const d = U.num(this.data.nastaveni.vychoziDph);
    return d > 0 ? d : 21;
  },

  /* cena z ceníku po přirážce (navýšení celého ceníku o X %) */
  sPrirazkou(cena){
    const p = U.num(this.data.nastaveni.prirazka);
    return U.num(cena) * (1 + p / 100);
  },

  /* dohledá položku v ceníku podle názvu (materiál i práce dohromady).
     Vrací { cena, jednotka } — cena je součet práce+materiál (montáž komplet). */
  cenaZCeniku(nazev){
    const k = String(nazev || '').toLowerCase().trim();
    if (!k) return null;
    let cena = 0, jednotka = '', nalezeno = false;
    for (const kol of ['polozky', 'prace']) {
      const it = this.data[kol].find(p => (p.nazev || '').toLowerCase().trim() === k);
      if (it) { cena += U.num(it.cena); jednotka = jednotka || it.jednotka; nalezeno = true; }
    }
    return nalezeno ? { cena, jednotka: jednotka || 'ks' } : null;
  },

  /* efektivní cena položky vzoru: vlastní cena, jinak živě z ceníku */
  cenaVzorPolozky(p){
    if (U.num(p.jednotkovaCena) > 0) return U.num(p.jednotkovaCena);
    const z = this.cenaZCeniku(p.nazev);
    return z ? z.cena : 0;
  },

  /* načtení výchozího sloučeného ceníku (Stefan + Windisch) */
  nactiVychoziCenik(rezim){
    const zdroj = window.CENIK_DATA;
    if (!zdroj) return { pridano: 0 };
    let pridano = 0;
    const kopie = x => JSON.parse(JSON.stringify(x));
    for (const kol of ['polozky', 'prace', 'vzory']) {
      if (rezim === 'nahradit') this.data[kol] = [];
      const existKody = new Set(this.data[kol].map(i => (i.nazev || '').toLowerCase().trim()));
      for (const it of (zdroj[kol] || [])) {
        if (rezim === 'doplnit' && existKody.has((it.nazev || '').toLowerCase().trim())) continue;
        const novy = kopie(it);
        novy.id = U.uid();
        if (novy.polozky) novy.polozky.forEach(p => p.id = U.uid());
        this.data[kol].push(novy);
        pridano++;
      }
    }
    this.ulozSdilene();
    return { pridano };
  },

  akce(id){ return this.data.akce.find(a => a.id === id); },

  novaAkce(nazev, adresa){
    const a = {
      id: U.uid(), nazev, adresa: adresa || '',
      datumZalozeni: U.dnes(), status: 'nabidka',
      nabidka: [], realita: [], vicePrace: [], denik: [], zalohy: [], faktury: []
    };
    this.data.akce.unshift(a);
    this.uloz();
    return a;
  },

  smazAkci(id){
    this.data.akce = this.data.akce.filter(a => a.id !== id);
    this.uloz();
  }
};

/* ===== Fotky v IndexedDB =====
   záznam: { id, akceId, datum (YYYY-MM-DD), zdroj ('denik'|'faktura'|'galerie'), nazev, blob } */
window.FotoDB = {
  _db: null,

  open(){
    return new Promise((res, rej) => {
      if (this._db) return res(this._db);
      const r = indexedDB.open('rozpocet-fotky', 1);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('fotky')) {
          const st = d.createObjectStore('fotky', { keyPath: 'id' });
          st.createIndex('akceId', 'akceId', { unique: false });
        }
      };
      r.onsuccess = () => { this._db = r.result; res(this._db); };
      r.onerror = () => rej(r.error);
    });
  },

  async pridej(foto){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('fotky', 'readwrite');
      tx.objectStore('fotky').put(foto);
      tx.oncomplete = () => res(foto);
      tx.onerror = () => rej(tx.error);
    });
  },

  async proAkci(akceId){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('fotky', 'readonly');
      const rq = tx.objectStore('fotky').index('akceId').getAll(akceId);
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
    });
  },

  async smaz(id){
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('fotky', 'readwrite');
      tx.objectStore('fotky').delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },

  async smazProAkci(akceId){
    const fotky = await this.proAkci(akceId);
    for (const f of fotky) await this.smaz(f.id);
  }
};
