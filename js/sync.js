/* ===== Cloudová záloha (Firebase Firestore, anonymní přihlášení) =====
   - žádné přihlašovací údaje: zařízení dostane skryté anonymní ID
   - lokální data (localStorage) jsou vždy hlavní; cloud je záloha
   - struktura: uzivatele/{uid} (meta) + uzivatele/{uid}/kolekce/{nazev}
   - vyhrává novější verze podle časového razítka lastZmena */

window.Sync = {
  stav: 'vypnuto',       // vypnuto | pripojuji | zapnuto | chyba
  _fs: null, _uid: null, _casovac: null, _ignorujSnapshot: false,
  KOLEKCE: ['akce', 'sklad', 'polozky', 'prace', 'vzory', 'nastaveni'],

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
      this._uid = cred.user.uid;
      this.stav = 'zapnuto';

      await this._prvniSync();
      this._posluchej();
      console.log('[Sync] Cloudová záloha běží, ID zařízení:', this._uid);
    } catch (e) {
      this.stav = 'chyba';
      console.warn('[Sync] Cloud se nepodařilo připojit (appka jede lokálně):', e);
    }
  },

  _metaRef(){ return this._m.doc(this._fs, 'uzivatele', this._uid); },
  _kolRef(nazev){ return this._m.doc(this._fs, 'uzivatele', this._uid, 'kolekce', nazev); },

  async _prvniSync(){
    const meta = await this._m.getDoc(this._metaRef());
    const cloudCas = meta.exists() ? (meta.data().lastZmena || 0) : 0;
    const lokalCas = DB.data.lastZmena || 0;
    if (cloudCas > lokalCas) await this._stahni(cloudCas);
    else if (lokalCas > cloudCas) await this._nahraj();
  },

  async _stahni(cloudCas){
    const nova = {};
    for (const k of this.KOLEKCE) {
      const snap = await this._m.getDoc(this._kolRef(k));
      if (snap.exists()) {
        try { nova[k] = JSON.parse(snap.data().json); } catch (e) {}
      }
    }
    for (const k of this.KOLEKCE) {
      if (nova[k] !== undefined) DB.data[k] = nova[k];
    }
    DB.data.lastZmena = cloudCas;
    try { localStorage.setItem(DB.KEY, JSON.stringify(DB.data)); } catch (e) {}
    if (typeof render === 'function') render();
    console.log('[Sync] Data stažena z cloudu');
  },

  async _nahraj(){
    if (this.stav !== 'zapnuto') return;
    const cas = DB.data.lastZmena || Date.now();
    this._ignorujSnapshot = true;
    try {
      for (const k of this.KOLEKCE) {
        await this._m.setDoc(this._kolRef(k), { json: JSON.stringify(DB.data[k] ?? null) });
      }
      await this._m.setDoc(this._metaRef(), { lastZmena: cas, aktualizovano: new Date().toISOString() });
      console.log('[Sync] Záloha nahrána do cloudu');
    } catch (e) {
      console.warn('[Sync] Nahrání zálohy selhalo:', e);
    } finally {
      setTimeout(() => { this._ignorujSnapshot = false; }, 1500);
    }
  },

  _posluchej(){
    this._m.onSnapshot(this._metaRef(), snap => {
      if (this._ignorujSnapshot || !snap.exists()) return;
      const cloudCas = snap.data().lastZmena || 0;
      if (cloudCas > (DB.data.lastZmena || 0)) this._stahni(cloudCas);
    });
  },

  /* volá se po každém uložení dat – nahrává se souhrnně s odstupem */
  naplanujPush(){
    if (this.stav !== 'zapnuto') return;
    clearTimeout(this._casovac);
    this._casovac = setTimeout(() => this._nahraj(), 2500);
  }
};
