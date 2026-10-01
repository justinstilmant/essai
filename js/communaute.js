/* ============================================================
   JUST GO — Signalements communautaires (à la Waze)
   Stockage partagé : Firestore, collection « signalements »
   Types : police, accident, travaux, ralentissement, obstacle, panne
   Chaque signalement expire tout seul ; les autres conducteurs
   peuvent confirmer (👍) ou dire qu'il n'est plus là (👎).
   Chargé APRÈS main.js et justgo.js.
   ============================================================ */
(() => {
    const H = 3600e3;
    const TYPES = {
        police:         ['👮', 'Police',          2 * H],
        accident:       ['💥', 'Accident',        2 * H],
        travaux:        ['🚧', 'Travaux',        12 * H],
        ralentissement: ['🐌', 'Ralentissement', 0.75 * H],
        obstacle:       ['⚠️', 'Obstacle',        2 * H],
        panne:          ['🚗', 'Véhicule arrêté', 1.5 * H]
    };
    let items = [];                 // signalements actifs
    const markers = new Map();      // id -> marker
    const annonces = new Set();     // ids déjà annoncés à voix haute
    let panel = null, infoEl = null;

    // On attend que la carte, Firestore et l'utilisateur soient prêts
    const attente = setInterval(() => {
        if (typeof map !== 'undefined' && map && typeof db !== 'undefined' && firebase.auth().currentUser) {
            clearInterval(attente);
            try { demarrer(); } catch (e) { console.warn('Communauté :', e); }
        }
    }, 700);

    function col() { return db.collection('signalements'); }

    function demarrer() {
        creerBouton();
        creerLigneInfo();
        col().where('expires', '>', Date.now()).onSnapshot(snap => {
            items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            dessiner();
        }, err => console.warn('Signalements (règles Firestore ?)', err.code));
        setInterval(() => { items = items.filter(i => i.expires > Date.now()); dessiner(); }, 60000);
        setInterval(annoncerDevant, 5000);
    }

    /* ---------- Envoi ---------- */
    async function signaler(type) {
        if (!pos) { alert('Position GPS non fixée.'); return; }
        const t = TYPES[type];
        try {
            await col().add({
                type, lat: pos.lat, lon: pos.lon, ts: Date.now(),
                expires: Date.now() + t[2], ok: 1, gone: 0,
                uid: firebase.auth().currentUser.uid
            });
            parler('Merci, signalement envoyé');
        } catch (e) { alert('Envoi impossible : ' + e.code); }
        fermerPanneau();
    }

    async function voter(it, ok) {
        const inc = firebase.firestore.FieldValue.increment(1);
        const upd = ok ? { ok: inc, expires: Date.now() + TYPES[it.type][2] / 2 }
                       : { gone: inc };
        if (!ok && (it.gone || 0) + 1 >= 3) upd.expires = 0;    // 3 « plus là » = supprimé
        try { await col().doc(it.id).update(upd); } catch (e) { console.warn(e.code); }
    }

    /* ---------- Affichage ---------- */
    function dessiner() {
        const ids = new Set(items.map(i => i.id));
        markers.forEach((m, id) => { if (!ids.has(id)) { m.remove(); markers.delete(id); } });
        items.forEach(it => {
            if (markers.has(it.id) || !TYPES[it.type]) return;
            const [emoji, label] = TYPES[it.type];
            const el = document.createElement('div');
            el.textContent = emoji;
            el.style.cssText = 'font-size:18px;background:#fff;border:3px solid #7c3aed;border-radius:50%;width:32px;height:32px;' +
                'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
            const pop = document.createElement('div');
            const min = Math.max(1, Math.round((Date.now() - it.ts) / 60000));
            pop.innerHTML = `<div style="font-weight:700;color:#111">${emoji} ${label}</div>` +
                `<div style="font-size:12px;color:#555;margin:2px 0 8px">signalé il y a ${min} min · 👍 ${it.ok || 0}</div>`;
            const b = (txt, ok) => {
                const x = document.createElement('button');
                x.textContent = txt;
                x.style.cssText = 'margin-right:6px;padding:6px 10px;border-radius:10px;background:#e5e7eb;color:#111;font-size:13px';
                x.onclick = () => { voter(it, ok); markers.get(it.id)?.getPopup().remove(); };
                return x;
            };
            pop.append(b('👍 Toujours là', true), b('👎 Plus là', false));
            markers.set(it.id, new maplibregl.Marker({ element: el }).setLngLat([it.lon, it.lat])
                .setPopup(new maplibregl.Popup({ offset: 18 }).setDOMContent(pop)).addTo(map));
        });
        if (infoEl) infoEl.textContent = items.length ? `${items.length} signalement(s)` : 'Aucun';
    }

    /* ---------- Alerte vocale sur l'itinéraire ---------- */
    function annoncerDevant() {
        if (typeof nav === 'undefined' || !nav) return;
        items.forEach(it => {
            if (annonces.has(it.id) || !TYPES[it.type]) return;
            try {
                const r = chercherSurRoute([it.lon, it.lat], 0, nav.coords.length - 2);
                const devant = alongDe(r) - nav.along;
                if (r.d < 60 && devant > 0 && devant < 1500) {
                    annonces.add(it.id);
                    parler(`${TYPES[it.type][1]} signalé dans ${Math.max(100, Math.round(devant / 100) * 100)} mètres`);
                }
            } catch (e) { /* itinéraire pas prêt */ }
        });
    }

    /* ---------- Interface ---------- */
    function creerBouton() {
        const b = document.createElement('button');
        b.innerHTML = '📣<span style="display:block;font-size:11px;font-weight:700">Signaler</span>';
        b.className = 'absolute z-10 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl shadow-2xl px-4 py-3 text-2xl';
        b.style.cssText = 'right:1.5rem;top:50%;transform:translateY(-50%)';
        b.onclick = ouvrirPanneau;
        document.body.appendChild(b);
    }

    function ouvrirPanneau() {
        if (panel) return;
        panel = document.createElement('div');
        panel.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
        const grille = Object.entries(TYPES).map(([k, [e, l]]) =>
            `<button data-t="${k}" class="bg-gray-800 hover:bg-purple-600 text-white rounded-2xl py-6 text-4xl flex flex-col items-center gap-2">${e}<span class="text-sm font-bold">${l}</span></button>`).join('');
        panel.innerHTML = `<div class="bg-gray-900 rounded-3xl p-5 w-[560px] max-w-[94vw]">
            <div class="flex justify-between items-center mb-4"><h3 class="text-white font-bold">Que veux-tu signaler ?</h3>
            <button id="cm-x" class="text-gray-400 text-2xl px-2">×</button></div>
            <div class="grid grid-cols-3 gap-3">${grille}</div></div>`;
        panel.onclick = e => { if (e.target === panel || e.target.id === 'cm-x') fermerPanneau(); };
        panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => signaler(b.dataset.t));
        document.body.appendChild(panel);
    }
    function fermerPanneau() { panel?.remove(); panel = null; }

    function creerLigneInfo() {
        const ref = document.getElementById('info-incidents')?.parentElement;
        if (!ref) return;
        const row = ref.cloneNode(true);
        row.querySelector('span:first-child').textContent = '📣 Communauté :';
        infoEl = row.querySelector('span:last-child');
        infoEl.id = 'info-communaute';
        infoEl.textContent = '—';
        ref.after(row);
    }
})();
