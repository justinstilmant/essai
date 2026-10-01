/* ============================================================
   JUST GO — Radars fixes (OpenStreetMap / Overpass, sans clé)
   - 📷 marqueurs sur la carte (bouton 📷 pour afficher/masquer)
   - Pendant le guidage : alerte vocale « Radar dans 500 mètres »
     pour les radars posés sur l'itinéraire
   - Hors guidage : alerte pour les radars devant la voiture
   Chargé APRÈS main.js et justgo.js. Ne couvre QUE les radars fixes
   présents dans OpenStreetMap (pas la police ni les contrôles mobiles).
   ============================================================ */
(() => {
    const actif = () => localStorage.getItem('gps_radars') !== 'off';
    let data = [], markers = [], lastNav = null, lastFetch = 0, lastPos = null;
    const annonces = new Map();            // id -> timestamp de l'annonce
    let infoEl = null;

    const attente = setInterval(() => {
        if (typeof map !== 'undefined' && map && typeof pos !== 'undefined' && pos) {
            clearInterval(attente);
            try { demarrer(); } catch (e) { console.warn('Radars :', e); }
        }
    }, 1000);

    function demarrer() {
        creerBouton();
        creerLigneInfo();
        charger(true);
        setInterval(surveiller, 3000);
    }

    /* ---------- Chargement ---------- */
    function surveiller() {
        if (!actif() || !pos) return;
        const navChange = (typeof nav !== 'undefined' ? nav : null) !== lastNav;
        const loin = lastPos && hav([pos.lon, pos.lat], [lastPos.lon, lastPos.lat]) > 6000;
        if (navChange || loin || Date.now() - lastFetch > 600000) charger(true);
        annoncer();
    }

    async function charger(force) {
        if (!actif() || !pos) return;
        if (!force && Date.now() - lastFetch < 60000) return;
        lastFetch = Date.now();
        lastNav = (typeof nav !== 'undefined') ? nav : null;
        lastPos = { lat: pos.lat, lon: pos.lon };
        let zone;
        if (lastNav) {                         // le long de l'itinéraire (60 m de part et d'autre)
            const c = lastNav.coords, pas = Math.max(1, Math.floor(c.length / 80)), pts = [];
            for (let i = 0; i < c.length; i += pas) pts.push(`${c[i][1].toFixed(4)},${c[i][0].toFixed(4)}`);
            pts.push(`${c[c.length - 1][1].toFixed(4)},${c[c.length - 1][0].toFixed(4)}`);
            zone = `around:80,${pts.join(',')}`;
        } else zone = `around:12000,${pos.lat},${pos.lon}`;
        const q = `[out:json][timeout:25];node["highway"="speed_camera"](${zone});out tags;`;
        try {
            const r = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'data=' + encodeURIComponent(q) });
            const d = await r.json();
            afficher(d.elements || []);
        } catch (e) { console.warn('Erreur radars', e); lastFetch = 0; }
    }

    function afficher(elements) {
        markers.forEach(m => m.remove());
        markers = []; data = [];
        elements.forEach(el => {
            if (el.lat == null) return;
            const t = el.tags || {};
            const limite = parseInt(t.maxspeed, 10) || null;
            const moyen = t.enforcement === 'average_speed';
            data.push({ id: el.id, lat: el.lat, lon: el.lon, limite, moyen });
            const pin = document.createElement('div');
            pin.textContent = '📷';
            pin.style.cssText = 'font-size:15px;background:#fff;border:3px solid #dc2626;border-radius:8px;width:30px;height:30px;' +
                'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
            markers.push(new maplibregl.Marker({ element: pin }).setLngLat([el.lon, el.lat])
                .setPopup(new maplibregl.Popup({ offset: 16 })
                    .setText(`Radar ${moyen ? 'tronçon' : 'fixe'}${limite ? ' · ' + limite + ' km/h' : ''}`)).addTo(map));
        });
        if (lastNav) {                         // position de chaque radar le long de la route
            lastNav.radars = data.map(rd => {
                const r = chercherSurRoute([rd.lon, rd.lat], 0, lastNav.coords.length - 2);
                return { ...rd, off: r.d, along: alongDe(r) };
            }).filter(rd => rd.off < 60).sort((a, b) => a.along - b.along);
        }
        majInfo();
    }

    /* ---------- Alertes vocales ---------- */
    function dire(d, rd) {
        const m = d < 150 ? 'quelques mètres' : `${Math.max(100, Math.round(d / 100) * 100)} mètres`;
        parler(`Radar ${rd.moyen ? 'tronçon ' : ''}dans ${m}${rd.limite ? ', limite ' + rd.limite : ''}`);
    }
    function annoncer() {
        if (!actif() || !data.length || !pos) return;
        const now = Date.now();
        if (typeof nav !== 'undefined' && nav && nav.radars) {
            nav.radars.forEach(rd => {
                const d = rd.along - nav.along;
                if (d > 0 && d < 1000 && !annonces.has(rd.id)) { annonces.set(rd.id, now); dire(d, rd); }
            });
        } else if (pos.speed > 3) {            // hors guidage : radars devant, dans l'axe de la voiture
            data.forEach(rd => {
                const d = hav([pos.lon, pos.lat], [rd.lon, rd.lat]);
                if (d > 700 || (annonces.has(rd.id) && now - annonces.get(rd.id) < 600000)) return;
                const cap = (Math.atan2((rd.lon - pos.lon) * Math.cos(pos.lat * rad), rd.lat - pos.lat) / rad + 360) % 360;
                const ecart = Math.abs(((cap - heading + 540) % 360) - 180);
                if (ecart < 30) { annonces.set(rd.id, now); dire(d, rd); }
            });
        }
        majInfo();
    }

    /* ---------- Interface ---------- */
    function majInfo() {
        if (!infoEl) return;
        if (!actif()) { infoEl.textContent = 'Masqués'; return; }
        if (typeof nav !== 'undefined' && nav && nav.radars) {
            const nx = nav.radars.find(r => r.along > nav.along);
            infoEl.textContent = nx ? `${formatDist(nx.along - nav.along)}${nx.limite ? ' · ' + nx.limite : ''}` : 'Aucun sur la route';
        } else infoEl.textContent = `${data.length} à proximité`;
    }
    function creerBouton() {
        const b = document.createElement('button');
        b.textContent = '📷';
        b.title = 'Afficher/masquer les radars fixes';
        b.className = 'bg-white/90 dark:bg-gray-900/90 hover:bg-gray-200 dark:hover:bg-gray-800 p-3 rounded-full backdrop-blur border border-gray-300 dark:border-gray-700 shadow-lg text-lg transition-colors';
        b.onclick = () => {
            const on = actif();
            localStorage.setItem('gps_radars', on ? 'off' : 'on');
            if (on) { markers.forEach(m => m.remove()); markers = []; data = []; if (typeof nav !== 'undefined' && nav) nav.radars = []; majInfo(); }
            else charger(true);
        };
        const ref = document.querySelector('button[title="Afficher/masquer les Superchargeurs"]');
        if (ref) ref.after(b); else document.body.appendChild(b);
    }
    function creerLigneInfo() {
        const ref = document.getElementById('info-incidents')?.parentElement;
        if (!ref) return;
        const row = ref.cloneNode(true);
        row.querySelector('span:first-child').textContent = '📷 Radar :';
        infoEl = row.querySelector('span:last-child');
        infoEl.id = 'info-radars';
        infoEl.className = 'font-semibold text-gray-900 dark:text-white';
        infoEl.textContent = '—';
        ref.after(row);
    }
})();
