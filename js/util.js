/* ===== Pomocné funkce ===== */
window.U = {
  uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  esc(s){
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  },

  num(v){
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  },

  kc(n){ return U.num(n).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' Kč'; },
  mn(n){ return U.num(n).toLocaleString('cs-CZ', { maximumFractionDigits: 3 }); },

  dnes(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },

  fmtDatum(d){
    if (!d) return '';
    const p = String(d).slice(0, 10).split('-');
    return p.length === 3 ? `${+p[2]}. ${+p[1]}. ${p[0]}` : d;
  },

  toast(zprava, typ){
    const t = document.createElement('div');
    t.className = 'toast' + (typ ? ' toast-' + typ : '');
    t.textContent = zprava;
    document.getElementById('toasty').appendChild(t);
    requestAnimationFrame(() => t.classList.add('videt'));
    setTimeout(() => { t.classList.remove('videt'); setTimeout(() => t.remove(), 300); }, 2600);
  },

  modal(html){
    const ov = document.createElement('div');
    ov.className = 'modal-pozadi';
    ov.innerHTML = `<div class="modal">${html}</div>`;
    ov.addEventListener('click', e => { if (e.target === ov) U.zavriModal(ov); });
    document.getElementById('modaly').appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('videt'));
    return ov;
  },

  zavriModal(ov){
    if (!ov) ov = document.querySelector('#modaly .modal-pozadi:last-child');
    if (!ov || ov.dataset.zavreno) return;
    ov.dataset.zavreno = '1';
    ov.style.pointerEvents = 'none';
    ov.querySelectorAll('button, input, select, textarea').forEach(x => x.disabled = true);
    ov.classList.remove('videt');
    setTimeout(() => ov.remove(), 200);
  },

  pickFile(accept, multiple){
    return new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file';
      if (accept) i.accept = accept;
      if (multiple) i.multiple = true;
      i.onchange = () => res(multiple ? [...i.files] : i.files[0]);
      i.click();
    });
  },

  // zmenšení fotky před uložením (šetří místo v úložišti)
  zmensiFoto(file, max = 1600, kvalita = 0.82){
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > max) {
          const k = max / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        c.toBlob(b => b ? res(b) : rej(new Error('Fotku se nepodařilo zpracovat')), 'image/jpeg', kvalita);
      };
      img.onerror = () => { URL.revokeObjectURL(img.src); rej(new Error('Soubor není obrázek')); };
      img.src = URL.createObjectURL(file);
    });
  },

  stahni(blob, nazev){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nazev;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },

  debounce(fn, ms){
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
};
