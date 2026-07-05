/* ===== Cloudová synchronizace (Firebase Firestore, anonymní přihlášení) =====
   - žádné přihlašovací údaje: zařízení dostane skryté anonymní ID
   - lokální data (localStorage) jsou vždy hlavní; cloud je záloha
   - OSOBNÍ data (akce, sklad, nastavení): uzivatele/{uid}/kolekce/{nazev}
   - SPOLEČNÉ ceníky (materiál, práce, vzory): sdilene/{nazev}
     → sdílí se mezi všemi uživateli appky; zapisovat smí správce,
       ostatní je mají ke čtení a automaticky se jim aktualizují */

window.Sync = {
  stav: 'vypnuto',       // vypnuto | pripojuji | zapnuto | chyba
  uid: null,
  _fs: null, _m: null, _casovac: null, _ignorujSnapshot: false,
  OSOBNI: ['akce', 'sklad', 'nastaveni'],
  SDILENE: ['polozky', 'prace', 'vzory'],

  async start(){
    if (!window.FIREBASE_CONFIG) return;
    this.stav = 'pripojuji';
    try {
      const [appM, authM, fsM] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js')
      ]);
      this._m = { ...appM, ...authM, ...fsM };
      const app = this._m.initializeApp(window.FIREBASE_CONFIG);
      const auth = this._m.getAuth(app);
      this._fs = this._m.getFirestore(app);

      const cred = await this._m.signInAnonymously(auth);
      this.uid = cred.user.uid;
      this.stav = 'zapnuto';

      if (!DB.data.sdileneCas || typeof DB.data.sdileneCas !== 'object') DB.data.sdileneCas = {};

      await this._prvniSyncOsobni();
      await this._prvniSyncSdilene();
      this._posluchej();
      console.log('[Sync] Cloud běží, ID zařízení:', this.uid);
    } catch (e) {
      this.stav = 'chyba';
      console.warn('[Sync] Cloud se nepodařilo připojit (appka jede lokálně):', e);
    }
  },

  _metaRef(){ return this._m.doc(this._fs, 'uzivatele', this.uid); },
  _osobniRef(k){ return this._m.doc(this._fs, 'uzivatele', this.uid, 'kolekce', k); },
  _sdileneRef(k){ return this._m.doc(this._fs, 'sdilene', k); },

  _ulozLokalne(){
    try { localStorage.setItem(DB.KEY, JSON.stringify(DB.data)); } catch (e) {}
  },

  /* ---------- osobní data (akce, sklad, nastavení) ---------- */
  async _prvniSyncOsobni(){
    const meta = await this._m.getDoc(this._metaRef());
    const cloudCas = meta.exists() ? (meta.data().lastZmena || 0) : 0;
    const lokalCas = DB.data.lastZmena || 0;
    if (cloudCas > lokalCas) await this._stahniOsobni(cloudCas);
    else if (lokalCas > cloudCas) await this._nahrajOsobni();
  },

  async _stahniOsobni(cloudCas){
    for (const k of this.OSOBNI) {
      const snap = await this._m.getDoc(this._osobniRef(k));
      if (snap.exists()) {
        try { DB.data[k] = JSON.parse(snap.data().json); } catch (e) {}
      }
    }
    DB.data.lastZmena = cloudCas;
    this._ulozLokalne();
    if (typeof render === 'function') render();
    console.log('[Sync] Osobní data stažena z cloudu');
  },

  async _nahrajOsobni(){
    if (this.stav !== 'zapnuto') return;
    const cas = DB.data.lastZmena || Date.now();
    this._ignorujSnapshot = true;
    try {
      for (const k of this.OSOBNI) {
        await this._m.setDoc(this._osobniRef(k), { json: JSON.stringify(DB.data[k] ?? null) });
      }
      await this._m.setDoc(this._metaRef(), { lastZmena: cas, aktualizovano: new Date().toISOString() });
    } catch (e) {
      console.warn('[Sync] Nahrání osobní zálohy selhalo:', e);
    } finally {
      setTimeout(() => { this._ignorujSnapshot = false; }, 1500);
    }
  },

  /* ---------- společné ceníky (materiál, práce, vzory) ---------- */
  async _prvniSyncSdilene(){
    for (const k of this.SDILENE) {
      const snap = await this._m.getDoc(this._sdileneRef(k));
      if (snap.exists()) {
        this._aplikujSdilene(k, snap.data());
      } else if ((DB.data[k] || []).length) {
        // v cloudu ještě nic není a lokálně data máme → nabídnout je všem
        await this._nahrajSdilene(k, DB.data.cenikyZmena || Date.now());
      }
    }
    this._ulozLokalne();
  },

  _aplikujSdilene(k, data){
    const znamyCas = DB.data.sdileneCas[k] || 0;
    if ((data.lastZmena || 0) <= znamyCas) return false;
    try {
      DB.data[k] = JSON.parse(data.json) || [];
      DB.data.sdileneCas[k] = data.lastZmena || Date.now();
      return true;
    } catch (e) { return false; }
  },

  async _nahrajSdilene(k, cas){
    try {
      await this._m.setDoc(this._sdileneRef(k), {
        json: JSON.stringify(DB.data[k] ?? []),
        lastZmena: cas,
        aktualizovano: new Date().toISOString()
      });
      DB.data.sdileneCas[k] = cas;
      console.log('[Sync] Společný ceník nahrán:', k);
    } catch (e) {
      // zařízení nemá právo zapisovat ceníky (není správce) – změna zůstává lokální
      console.warn('[Sync] Ceník se nepodařilo nahrát (jen správce může):', k);
    }
  },

  async _pushSdileneVse(){
    const cas = DB.data.cenikyZmena || 0;
    const posledni = Math.max(0, ...this.SDILENE.map(k => DB.data.sdileneCas[k] || 0));
    if (cas <= posledni) return;   // ceníky se od poslední synchronizace nezměnily
    this._ignorujSnapshot = true;
    try {
      for (const k of this.SDILENE) await this._nahrajSdilene(k, cas);
      this._ulozLokalne();
    } finally {
      setTimeout(() => { this._ignorujSnapshot = false; }, 1500);
    }
  },

  /* ---------- naslouchání změnám z jiných zařízení ---------- */
  _posluchej(){
    this._m.onSnapshot(this._metaRef(), snap => {
      if (this._ignorujSnapshot || !snap.exists()) return;
      const cloudCas = snap.data().lastZmena || 0;
      if (cloudCas > (DB.data.lastZmena || 0)) this._stahniOsobni(cloudCas);
    });
    for (const k of this.SDILENE) {
      this._m.onSnapshot(this._sdileneRef(k), snap => {
        if (this._ignorujSnapshot || !snap.exists()) return;
        if (this._aplikujSdilene(k, snap.data())) {
          this._ulozLokalne();
          if (typeof render === 'function') render();
          console.log('[Sync] Společný ceník aktualizován:', k);
        }
      });
    }
  },

  /* volá se po každém uložení dat – nahrává se souhrnně s odstupem */
  naplanujPush(){
    if (this.stav !== 'zapnuto') return;
    clearTimeout(this._casovac);
    this._casovac = setTimeout(() => {
      this._nahrajOsobni();
      this._pushSdileneVse();
    }, 2500);
  }
};
