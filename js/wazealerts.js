/* ============================================================
   JUST GO — Alertes communautaires (API OpenWeb Ninja, source Waze)
   Service tiers NON officiel : peut changer, se limiter ou s'arrêter.
   - 👥 marqueurs : police, accident, danger, ralentissement, route fermée
   - Pendant le guidage : alerte vocale pour ceux posés sur l'itinéraire
   - Appels uniquement pendant un guidage, toutes les 10 min + plafond d'appels par mois (quota gratuit très limité)
   Clé à saisir dans ⚙️ (« OpenWeb Ninja »). Chargé APRÈS justgo.js.
   ============================================================ */
(() => {
    const URL_API = 'https://api.openwebninja.com/waze/alerts-and-jams';
    const PERIODE = 600000;                 // 10 min entre deux appels
    const PLAFOND = 150;                    // appels max par MOIS (offre gratuite ≈ 100-200 ; modifiable : localStorage.waze_cap)
    const actif = () => localStorage.getItem('gps_waze') !== 'off';
    let data = [], markers = [], lastNav = null, lastFetch = 0, lastPos = null, infoEl = null, etat = '';
    const annonces = new Map();

    const attente = setInterval(() => {
        if (typeof map !== 'undefined' && map && typeof pos !== 'undefined' && pos) {
            clearInterval(attente);
            try { demarrer(); } catch (e) { console.warn('Alertes :', e); }
        }
    }, 1000);

    function demarrer() { creerBouton(); creerLigneInfo(); charger(true); setInterval(surveiller, 4000); }

    /* ---------- Quota ---------- */
    function appelsDuMois() {
        const m = new Date().toISOString().slice(0, 7);
        const o = JSON.parse(localStorage.getItem('waze_count') || '{}');
        return o.m === m ? o.n : 0;
    }
    function compter() {
        const m = new Date().toISOString().slice(0, 7);
        localStorage.setItem('waze_count', JSON.stringify({ m, n: appelsDuMois() + 1 }));
    }

    /* ---------- Chargement ---------- */
    function surveiller() {
        if (!actif() || !pos) return;
        const n = (typeof nav !== 'undefined') ? nav : null;
        const loin = lastPos && hav([pos.lon, pos.lat], [lastPos.lon, lastPos.lat]) > 5000;
        if (n !== lastNav || loin || Date.now() - lastFetch > PERIODE) charger(true);
        annoncer();
    }

    async function charger(force) {
        const key = getApiKey('openwebninja');
        if (!actif() || !pos || !map) return;
        if (!key) { etat = 'Clé requise'; majInfo(); return; }
        if (!force && Date.now() - lastFetch < PERIODE) return;
        if (typeof nav === 'undefined' || !nav) { etat = 'Actif pendant le guidage'; majInfo(); return; }   // on économise le quota
        if (appelsDuMois() >= (+localStorage.getItem('waze_cap') || PLAFOND)) { etat = 'Quota du mois atteint'; majInfo(); return; }
        lastFetch = Date.now(); lastNav = (typeof nav !== 'undefined') ? nav : null; lastPos = { lat: pos.lat, lon: pos.lon };
        let c = [pos.lon, pos.lat];
        if (lastNav && lastNav.total - lastNav.along > 9000) c = pointSurRoute(lastNav.along + 7000);   // zone devant nous
        const url = `${URL_API}?center=${c[1].toFixed(5)},${c[0].toFixed(5)}&radius=15&radius_units=KM&max_alerts=100&max_jams=0`;
        try {
            compter();
            const r = await fetch(url, { headers: { 'x-api-key': key } });
            if (!r.ok) { etat = r.status === 401 || r.status === 403 ? 'Clé refusée' : r.status === 429 ? 'Quota API dépassé' : 'Erreur ' + r.status; majInfo(); return; }
            const j = await r.json();
            const arr = (j.data && j.data.alerts) || j.alerts || (Array.isArray(j.data) ? j.data : []);
            etat = ''; afficher(arr);
        } catch (e) { etat = 'Injoignable (CORS ?)'; console.warn('Alertes', e); majInfo(); }
    }

    /* ---------- Lecture tolérante des champs ---------- */
    function norm(a) {
        const lat = a.latitude ?? a.lat ?? (a.location && a.location.y), lon = a.longitude ?? a.lon ?? a.lng ?? (a.location && a.location.x);
        if (lat == null || lon == null) return null;
        const type = String(a.type || '').toUpperCase(), sub = String(a.subtype || '').toUpperCase();
        let emoji = '⚠️', label = 'Alerte';
        if (type.includes('POLICE')) { emoji = '👮'; label = sub.includes('HIDING') ? 'Police (cachée)' : 'Police'; }
        else if (type.includes('ACCIDENT')) { emoji = '💥'; label = 'Accident'; }
        else if (type.includes('CLOSED')) { emoji = '⛔'; label = 'Route fermée'; }
        else if (type.includes('JAM')) { emoji = '🐌'; label = 'Ralentissement'; }
        else if (type.includes('HAZARD')) {
            label = 'Danger';
            if (sub.includes('CONSTRUCTION')) { emoji = '🚧'; label = 'Travaux'; }
            else if (sub.includes('CAR_STOPPED') || sub.includes('BROKEN')) { emoji = '🚗'; label = 'Véhicule arrêté'; }
            else if (sub.includes('OBJECT')) label = 'Objet sur la route';
            else if (sub.includes('POT_HOLE')) label = 'Nid-de-poule';
            else if (sub.includes('WEATHER') || sub.includes('FOG') || sub.includes('ICE') || sub.includes('FLOOD')) { emoji = '🌧️'; label = 'Météo dangereuse'; }
        }
        const id = String(a.alert_id ?? a.id ?? a.uuid ?? `${type}${sub}${(+lat).toFixed(4)}${(+lon).toFixed(4)}`);
        return { id, lat: +lat, lon: +lon, emoji, label, quand: a.publish_datetime_utc || a.pubMillis || null, up: a.num_thumbs_up ?? a.nThumbsUp ?? 0 };
    }

    function afficher(arr) {
        markers.forEach(m => m.remove()); markers = []; data = [];
        arr.map(norm).filter(Boolean).forEach(a => {
            data.push(a);
            const pin = document.createElement('div');
            pin.textContent = a.emoji;
            pin.style.cssText = 'font-size:16px;background:#fff;border:3px solid #0ea5e9;border-radius:50%;width:30px;height:30px;' +
                'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
            let age = '';
            if (a.quand) { const t = typeof a.quand === 'number' ? a.quand : Date.parse(a.quand); if (t) age = ` · il y a ${Math.max(1, Math.round((Date.now() - t) / 60000))} min`; }
            markers.push(new maplibregl.Marker({ element: pin }).setLngLat([a.lon, a.lat])
                .setPopup(new maplibregl.Popup({ offset: 16 }).setText(`${a.label}${age}${a.up ? ' · 👍 ' + a.up : ''}`)).addTo(map));
        });
        if (lastNav) {
            lastNav.waze = data.map(a => { const r = chercherSurRoute([a.lon, a.lat], 0, lastNav.coords.length - 2); return { ...a, off: r.d, along: alongDe(r) }; })
                .filter(a => a.off < 80).sort((x, y) => x.along - y.along);
        }
        majInfo();
    }

    /* ---------- Alertes vocales ---------- */
    function dire(d, a) { parler(`${a.label} signalé dans ${d < 150 ? 'quelques mètres' : Math.max(100, Math.round(d / 100) * 100) + ' mètres'}`); }
    function annoncer() {
        if (!actif() || !data.length || !pos) return;
        const now = Date.now();
        if (typeof nav !== 'undefined' && nav && nav.waze) {
            nav.waze.forEach(a => {
                const d = a.along - nav.along;
                if (d > 0 && d < 1500 && !annonces.has(a.id)) { annonces.set(a.id, now); dire(d, a); }
            });
        } else if (pos.speed > 3) {
            data.forEach(a => {
                const d = hav([pos.lon, pos.lat], [a.lon, a.lat]);
                if (d > 700 || (annonces.has(a.id) && now - annonces.get(a.id) < 600000)) return;
                const cap = (Math.atan2((a.lon - pos.lon) * Math.cos(pos.lat * rad), a.lat - pos.lat) / rad + 360) % 360;
                if (Math.abs(((cap - heading + 540) % 360) - 180) < 30) { annonces.set(a.id, now); dire(d, a); }
            });
        }
    }

    /* ---------- Interface ---------- */
    function majInfo() {
        if (!infoEl) return;
        if (!actif()) { infoEl.textContent = 'Masquées'; return; }
        if (etat) { infoEl.textContent = etat; return; }
        if (typeof nav !== 'undefined' && nav && nav.waze) {
            const nx = nav.waze.find(a => a.along > nav.along);
            infoEl.textContent = nx ? `${nx.label} · ${formatDist(nx.along - nav.along)}` : 'Rien sur la route';
        } else infoEl.textContent = `${data.length} à proximité`;
    }
    function creerBouton() {
        const b = document.createElement('button');
        b.textContent = '👥'; b.title = 'Afficher/masquer les alertes communautaires';
        b.className = 'bg-white/90 dark:bg-gray-900/90 hover:bg-gray-200 dark:hover:bg-gray-800 p-3 rounded-full backdrop-blur border border-gray-300 dark:border-gray-700 shadow-lg text-lg transition-colors';
        b.onclick = () => {
            const on = actif(); localStorage.setItem('gps_waze', on ? 'off' : 'on');
            if (on) { markers.forEach(m => m.remove()); markers = []; data = []; if (typeof nav !== 'undefined' && nav) nav.waze = []; majInfo(); }
            else charger(true);
        };
        const ref = document.querySelector('button[title="Afficher/masquer les Superchargeurs"]');
        if (ref) ref.after(b); else document.body.appendChild(b);
    }
    function creerLigneInfo() {
        const ref = document.getElementById('info-incidents')?.parentElement;
        if (!ref) return;
        const row = ref.cloneNode(true);
        row.querySelector('span:first-child').textContent = '👥 Communauté :';
        infoEl = row.querySelector('span:last-child'); infoEl.id = 'info-waze';
        infoEl.className = 'font-semibold text-gray-900 dark:text-white'; infoEl.textContent = '—';
        ref.after(row);
    }
})();
