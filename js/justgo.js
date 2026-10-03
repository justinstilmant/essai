/* ============================================================
   JUST GO — GPS auto
   Carte : MapLibre GL (rotation native, fond OpenFreeMap sans clé)
   Itinéraire + guidage vocal + limites : Mapbox Directions (driving-traffic)
   Circulation + incidents : TomTom (flux en tuiles + Incident Details v5)
   ============================================================ */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const rad = Math.PI / 180;
let map = null, carMarker = null, isMuted = false;
let pos = null, heading = 0, follow = true, nav = null;
let currentCoords = null;                       // compatibilité (favoris)
let lastReroute = 0, lastSpeedCheck = 0;
let incidentMarkers = [], incidentsData = [];
const spokenIncidents = new Set();
let preview = null;                             // itinéraires proposés avant départ
let scMarkers = [], scData = [], lastSC = 0;   // Superchargeurs

// Lancé une seule fois par main.js, une fois l'utilisateur connecté
onAppReady(async () => {
    setupAudioToggle();
    setupChoix();
    setupSuggestions();
    mettreAJourAffichageFavoris();
    await chargerClesApiFirestore();            // les clés doivent être là avant la carte
    initMap();
});

/* ---------- Géométrie ---------- */
function hav(a, b) {                            // distance en m entre [lon,lat]
    const dLa = (b[1] - a[1]) * rad, dLo = (b[0] - a[0]) * rad;
    const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLo / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(x));
}
function proj(p, a, b) {                        // projection de p sur le segment ab (mètres)
    const k = Math.cos(p[1] * rad);
    const ax = (a[0] - p[0]) * k * 111320, ay = (a[1] - p[1]) * 110540;
    const dx = (b[0] - p[0]) * k * 111320 - ax, dy = (b[1] - p[1]) * 110540 - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    return { t, d: Math.hypot(ax + t * dx, ay + t * dy) };
}
function chercherSurRoute(p, from, to) {        // segment le plus proche entre from et to
    const c = nav.coords; let best = { i: 0, t: 0, d: Infinity };
    for (let i = Math.max(0, from); i <= Math.min(to, c.length - 2); i++) {
        const r = proj(p, c[i], c[i + 1]);
        if (r.d < best.d) best = { i, t: r.t, d: r.d };
    }
    return best;
}
const alongDe = (r) => nav.cum[r.i] + r.t * (nav.cum[r.i + 1] - nav.cum[r.i]);
function pointSurRoute(d) {
    const i = nav.cum.findIndex(x => x >= d);
    return nav.coords[i < 0 ? nav.coords.length - 1 : i];
}
function formatDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km';
    return (m > 200 ? Math.round(m / 50) * 50 : Math.round(m / 10) * 10) + ' m';
}
function formatDuree(s) {
    const m = Math.round(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
const $ = (id) => document.getElementById(id);

/* ---------- 1. CARTE ---------- */
function initMap() {
    if (map || !$('map')) return;
    map = new maplibregl.Map({ container: 'map', style: STYLE_URL, center: [3.22, 51.21], zoom: 14, attributionControl: { compact: true } });
    map.on('load', ajouterCouches);
    map.on('dragstart', () => { follow = false; majBoutonRecentrer(); });

    const el = document.createElement('div');
    el.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" style="filter:drop-shadow(0 3px 6px rgba(0,0,0,.5))"><path d="M12 2L4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" fill="#3b82f6" stroke="#fff" stroke-width="1.2"/></svg>';
    carMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' });

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(onPosition, (e) => console.warn('Erreur GPS', e),
            { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 });
    }
    setInterval(rafraichirIncidents, 60000);
    setInterval(() => chargerSuperchargeurs(), 120000);
    majBoutonWaze();
    if (wazeActif()) demarrerWaze();
}

function ajouterCouches() {
    const key = getApiKey('tomtom');
    if (key) {                                  // flux de circulation (vert / orange / rouge)
        map.addSource('flow', { type: 'raster', tileSize: 256, maxzoom: 18,
            tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${key}`] });
        map.addLayer({ id: 'flow', type: 'raster', source: 'flow', paint: { 'raster-opacity': 0.85 },
            layout: { visibility: localStorage.getItem('gps_traffic') === 'off' ? 'none' : 'visible' } });
    }
    map.addSource('alt', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });   // itinéraires alternatifs (gris)
    map.addLayer({ id: 'alt-line', type: 'line', source: 'alt', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#9ca3af', 'line-width': 7, 'line-opacity': 0.9 } });
    map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1e3a8a', 'line-width': 12 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': 7, 'line-color': ['match', ['get', 'c'], 'moderate', '#f59e0b', 'heavy', '#ef4444', 'severe', '#7f1d1d', '#3b82f6'] } });
}

function basculerTrafic() {
    if (!map || !map.getLayer('flow')) { alert("Ajoute ta clé TomTom dans ⚙️ pour afficher la circulation."); return; }
    const on = map.getLayoutProperty('flow', 'visibility') !== 'none';
    map.setLayoutProperty('flow', 'visibility', on ? 'none' : 'visible');
    localStorage.setItem('gps_traffic', on ? 'off' : 'on');
}
function recentrer() { follow = true; majBoutonRecentrer(); suivreCamera(); }
function majBoutonRecentrer() { const b = $('btn-recenter'); if (b) b.classList.toggle('hidden', follow); }

function suivreCamera() {
    if (!map || !pos) return;
    const zoom = nav ? (pos.speed > 90 ? 15 : pos.speed > 50 ? 16 : 17) : 15.5;
    map.easeTo({ center: [pos.lon, pos.lat], bearing: heading, pitch: nav ? 55 : 0, zoom,
        offset: nav ? [0, 180] : [0, 0], duration: 900, easing: (t) => t });
}

function onPosition(p) {
    const c = p.coords, v = (c.speed || 0) * 3.6;
    if (c.heading != null && !isNaN(c.heading) && (c.speed || 0) > 1.5) heading = c.heading;
    const premiere = !pos;
    pos = { lat: c.latitude, lon: c.longitude, speed: v };
    currentCoords = { lat: pos.lat, lon: pos.lon };
    $('current-speed').innerText = Math.round(v);
    if (premiere) carMarker.setLngLat([pos.lon, pos.lat]).addTo(map);
    carMarker.setLngLat([pos.lon, pos.lat]).setRotation(heading);
    if (nav) suivreNavigation(); else verifierSignalisationRoute();
    if (follow) suivreCamera();
    if (premiere) { rafraichirIncidents(); chargerSuperchargeurs(true); chargerWaze(true); }
}

/* ---------- 2. VOIX ---------- */
let voixFr = null, audioCtx = null;
const voixOk = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function choisirVoix() {
    if (!voixOk) return;
    try {
        const v = speechSynthesis.getVoices() || [];
        voixFr = v.find(x => /^fr[-_]FR/i.test(x.lang)) || v.find(x => /^fr/i.test(x.lang)) || null;
    } catch (e) { voixFr = null; }              // un navigateur sans getVoices ne doit pas bloquer la carte
    majInfoVoix();
}

function majInfoVoix() {
    const el = $('info-voix');
    if (!el) return;
    let t = 'OK' + (voixFr ? ' · ' + voixFr.lang : ' (voix par défaut)'), c = 'text-emerald-500';
    if (!voixOk) { t = 'Non supportée (bips)'; c = 'text-red-500'; }
    else if (isMuted) { t = 'Coupée'; c = 'text-gray-500'; }
    el.innerText = t;
    el.className = 'font-semibold text-right truncate ' + c;
}

function bip() {                                // repli sonore quand la voix n'est pas disponible
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; g.gain.value = 0.25;
        o.connect(g); g.connect(audioCtx.destination);
        o.start(); o.stop(audioCtx.currentTime + 0.2);
    } catch (e) { /* pas d'audio du tout */ }
}

// Les navigateurs interdisent de parler avant un vrai geste de l'utilisateur :
// au premier toucher, on "réveille" la synthèse vocale et l'audio.
function deverrouillerAudio() {
    try {
        if (voixOk) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume();
    } catch (e) { /* ignoré */ }
}

function parler(text) {
    if (isMuted) return;
    if (!voixOk) { bip(); return; }
    try {
        speechSynthesis.cancel();
        if (speechSynthesis.resume) speechSynthesis.resume();
        setTimeout(() => {                      // petit délai : cancel() suivi de speak() est parfois avalé
            const u = new SpeechSynthesisUtterance(text);
            u.lang = (voixFr && voixFr.lang) || 'fr-FR';
            if (voixFr) u.voice = voixFr;
            u.rate = 1; u.volume = 1;
            u.onerror = (e) => { console.warn('Erreur voix :', e.error); bip(); };
            speechSynthesis.speak(u);
        }, 80);
    } catch (e) { bip(); }
}

function setupAudioToggle() {
    if (voixOk) { choisirVoix(); speechSynthesis.onvoiceschanged = choisirVoix; }
    majInfoVoix();
    document.addEventListener('pointerdown', deverrouillerAudio, { once: true });
    const railBtn = $('rail-toggle'), rail = $('rail-items');
    if (railBtn && rail) {                      // barre de boutons repliable (mémorisée)
        if (localStorage.getItem('gps_rail') === 'off') rail.classList.add('hidden');
        railBtn.addEventListener('click', () => {
            rail.classList.toggle('hidden');
            localStorage.setItem('gps_rail', rail.classList.contains('hidden') ? 'off' : 'on');
        });
    }
    const btnMute = $('btn-mute');
    if (btnMute) btnMute.addEventListener('click', () => {
        isMuted = !isMuted;
        btnMute.innerText = isMuted ? '🔇' : '🔊';
        majInfoVoix();
        parler(isMuted ? 'Guidage vocal désactivé' : 'Guidage vocal activé');
    });
    const btnStop = $('btn-stop');
    if (btnStop) btnStop.addEventListener('click', () => { arreterNavigation(); parler('Navigation annulée'); });
    const search = $('search-input');
    if (search) search.addEventListener('keydown', (e) => { if (e.key === 'Enter') rechercherDestination(); });
}

/* ---------- 3. RECHERCHE ---------- */
async function rechercherDestination() {
    if (suggestions.length) { choisirSuggestion(suggestions[0]); return; }   // Entrée = première suggestion
    const query = ($('search-input') || {}).value?.trim();
    if (!query) return;
    parler(`Recherche de ${query}`);
    try {
        const near = pos ? `&viewbox=${pos.lon - 1},${pos.lat + 1},${pos.lon + 1},${pos.lat - 1}` : '';
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr${near}&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length) naviguerVers(data[0].display_name.split(',')[0], parseFloat(data[0].lat), parseFloat(data[0].lon));
        else { alert('Destination introuvable.'); parler('Destination introuvable'); }
    } catch (e) { console.error('Erreur de recherche', e); }
}

/* ---------- 4. ITINÉRAIRE (Mapbox, trafic temps réel) ---------- */
async function naviguerVers(nom, lat, lon, recalcul = false) {
    if (!pos) { alert('Position GPS non fixée...'); return; }
    const key = getApiKey('mapbox');
    if (!key) { alert("Ajoute ta clé Mapbox dans ⚙️ : elle sert au calcul d'itinéraire et au guidage."); return; }
    $('info-route').innerText = recalcul ? 'Recalcul…' : `Calcul vers ${nom}…`;
    parler(recalcul ? "Recalcul de l'itinéraire" : `Calcul vers ${nom}`);
    try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${pos.lon},${pos.lat};${lon},${lat}` +
            `?geometries=geojson&overview=full&steps=true&banner_instructions=true&voice_instructions=true&voice_units=metric` +
            `&language=fr&annotations=maxspeed,congestion&alternatives=${recalcul ? 'false' : 'true'}&access_token=${key}`;
        const data = await (await fetch(url)).json();
        if (!data.routes || !data.routes.length) throw new Error(data.message || 'Aucun itinéraire');
        const dest = { name: nom, lat, lon };
        if (recalcul || data.routes.length === 1) demarrerNavigation(data.routes[0], dest, recalcul);
        else proposerItineraires(data.routes, dest);
    } catch (e) {
        console.error('Erreur itinéraire', e);
        $('info-route').innerText = 'Itinéraire impossible';
        parler('Impossible de calculer un itinéraire');
    }
}

function demarrerNavigation(route, dest, recalcul) {
    cacherChoix();
    const leg = route.legs[0], coords = route.geometry.coordinates, ann = leg.annotation || {};
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1];
    let s = 0;
    const steps = leg.steps.map(st => { const o = { ...st, startAlong: s }; s += st.distance; return o; });
    const f = s ? total / s : 1;
    steps.forEach(st => { st.startAlong *= f; });

    nav = { dest, coords, cum, total, steps, seg: 0, off: 0, along: 0, spoken: new Set(), incidents: [],
        duration: route.duration, speeds: ann.maxspeed || [] };
    if (!recalcul) spokenIncidents.clear();

    dessinerRoute(coords, ann.congestion || []);
    $('nav-banner').classList.remove('hidden');
    $('nav-eta').classList.remove('hidden');
    $('info-route').innerText = `${dest.name} · ${formatDist(total)} · ${formatDuree(route.duration)}`;

    const retard = route.duration_typical ? route.duration - route.duration_typical : null;
    const t = $('info-traffic');
    if (retard === null) { t.innerText = 'Pris en compte'; t.className = 'font-semibold text-emerald-500'; }
    else if (retard > 180) { t.innerText = `+${Math.round(retard / 60)} min de bouchons`; t.className = 'font-semibold text-red-500'; }
    else { t.innerText = 'Fluide'; t.className = 'font-semibold text-emerald-500'; }

    if (!recalcul) {
        parler(`Itinéraire trouvé. ${formatDist(total)}, environ ${formatDuree(route.duration)}.`);
        follow = false;
        const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(b, { padding: 90, duration: 800 });
        setTimeout(() => { if (nav) { follow = true; majBoutonRecentrer(); suivreCamera(); } }, 3000);
    }
    rafraichirIncidents();
    chargerSuperchargeurs(true);
}

function dessinerRoute(coords, cong) {
    const src = map && map.getSource('route');
    if (!src) return;
    const feats = []; let s = 0;
    for (let i = 1; i < coords.length; i++) {
        if (i === coords.length - 1 || cong[i] !== cong[s]) {
            feats.push({ type: 'Feature', properties: { c: cong[s] || 'unknown' }, geometry: { type: 'LineString', coordinates: coords.slice(s, i + 1) } });
            s = i;
        }
    }
    src.setData({ type: 'FeatureCollection', features: feats });
}

function arreterNavigation() {
    nav = null;
    cacherChoix();
    const src = map && map.getSource('route');
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    $('nav-banner').classList.add('hidden');
    $('nav-eta').classList.add('hidden');
    $('info-route').innerText = 'En attente de destination';
    $('info-traffic').innerText = '—';
    afficherLimite(null);
    majInfoIncidents();
    majInfoSC();
    follow = true; majBoutonRecentrer(); suivreCamera();
}

/* ---------- 5. GUIDAGE TOUR PAR TOUR ---------- */
function flecheManoeuvre(m) {
    if (m.type === 'arrive') return '🏁';
    if (/roundabout|rotary/.test(m.type)) return '🔄';
    return { uturn: '↩️', 'sharp left': '↰', left: '⬅️', 'slight left': '↖️', straight: '⬆️',
        'slight right': '↗️', right: '➡️', 'sharp right': '↱' }[m.modifier] || '⬆️';
}

function suivreNavigation() {
    const n = nav, p = [pos.lon, pos.lat];
    let best = chercherSurRoute(p, n.seg - 3, n.seg + 60);
    if (best.d > 60) best = chercherSurRoute(p, 0, n.coords.length - 2);

    // Sortie d'itinéraire : 3 positions consécutives hors route -> recalcul
    n.off = best.d > 60 ? n.off + 1 : 0;
    if (n.off >= 3) {
        if (Date.now() - lastReroute > 20000) { lastReroute = Date.now(); naviguerVers(n.dest.name, n.dest.lat, n.dest.lon, true); }
        return;
    }

    n.seg = best.i;
    const along = n.along = alongDe(best), rem = n.total - along;
    if (rem < 25) { parler('Vous êtes arrivé à destination'); arreterNavigation(); return; }

    let i = 0;
    while (i + 1 < n.steps.length && n.steps[i + 1].startAlong <= along) i++;
    const up = n.steps[i + 1];
    const dStep = up ? up.startAlong - along : rem;

    // Bandeau de manœuvre
    $('nav-arrow').innerText = flecheManoeuvre(up ? up.maneuver : { type: 'arrive' });
    $('nav-dist').innerText = formatDist(dStep);
    $('nav-text').innerText = up ? up.maneuver.instruction : 'Arrivée à destination';

    // Temps / distance restants
    const lenI = (up ? up.startAlong : n.total) - n.steps[i].startAlong;
    let remDur = n.steps[i].duration * (lenI ? Math.min(1, dStep / lenI) : 0);
    for (let k = i + 1; k < n.steps.length; k++) remDur += n.steps[k].duration;
    $('eta-time').innerText = formatDuree(remDur);
    $('eta-dist').innerText = formatDist(rem);
    $('eta-arrival').innerText = new Date(Date.now() + remDur * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Limitation de vitesse du tronçon courant (annotation Mapbox)
    const m = n.speeds[best.i];
    afficherLimite(m && m.speed ? Math.round(m.unit === 'mph' ? m.speed * 1.609 : m.speed) : null);

    // Annonces vocales (la dernière applicable à la distance restante)
    let say = null;
    (n.steps[i].voiceInstructions || []).forEach((v, k) => {
        const key = `${i}-${k}`;
        if (dStep <= v.distanceAlongGeometry && !n.spoken.has(key)) { n.spoken.add(key); say = v.announcement; }
    });
    if (say) parler(say);
    majInfoSC();

    // Alertes d'incidents devant nous (une seule fois chacun, à moins de 2 km)
    n.incidents.forEach(inc => {
        const d = inc.along - along;
        if (d > 0 && d < 2000 && !spokenIncidents.has(inc.id)) {
            spokenIncidents.add(inc.id);
            parler(`Attention, ${inc.label.toLowerCase()} dans ${(Math.round(d / 100) / 10).toString().replace('.', ',')} kilomètre${d >= 1500 ? 's' : ''}`);
        }
    });
}

/* ---------- 6. SIGNALISATION : limitation de vitesse ---------- */
function afficherLimite(v) {
    const sign = $('speed-limit-sign'), val = $('speed-limit-value');
    if (v) { val.innerText = v; sign.classList.remove('hidden'); sign.classList.add('flex'); }
    else { sign.classList.add('hidden'); sign.classList.remove('flex'); }
    // Cercle du compteur en rouge en cas de dépassement
    $('speedometer').style.borderColor = (v && pos && pos.speed > v + 3) ? '#dc2626' : '';
}

// Hors navigation : limite de la route sous la voiture (OpenStreetMap / Overpass)
async function verifierSignalisationRoute() {
    const now = Date.now();
    if (!pos || now - lastSpeedCheck < 15000) return;
    lastSpeedCheck = now;
    try {
        const q = `[out:json];way(around:25,${pos.lat},${pos.lon})[maxspeed];out tags;`;
        const data = await (await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q))).json();
        const raw = (data.elements || []).map(e => e.tags.maxspeed).find(x => /^\d+/.test(x));
        afficherLimite(raw ? parseInt(raw, 10) : null);
    } catch (e) { console.warn('Erreur signalétique', e); }
}

/* ---------- 6 bis. CHOIX DE L'ITINÉRAIRE (alternatives) ---------- */
function proposerItineraires(routes, dest) {
    preview = { routes, dest, sel: 0 };
    follow = false; majBoutonRecentrer();
    $('info-route').innerText = `${routes.length} itinéraires vers ${dest.name}`;
    parler(`${routes.length} itinéraires disponibles. Choisis, puis appuie sur démarrer.`);
    const all = routes.flatMap(r => r.geometry.coordinates);
    map.fitBounds(all.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(all[0], all[0])), { padding: 90, duration: 800 });
    $('route-choice').classList.remove('hidden');
    majChoix();
}

function majChoix() {                           // trace l'aperçu (choisi en couleur, autres en gris) + cartes
    if (!preview) return;
    const { routes, sel } = preview, r = routes[sel];
    dessinerRoute(r.geometry.coordinates, (r.legs[0].annotation || {}).congestion || []);
    const alt = map.getSource('alt');
    if (alt) alt.setData({ type: 'FeatureCollection', features: routes.filter((_, i) => i !== sel).map(x => ({ type: 'Feature', properties: {}, geometry: x.geometry })) });
    $('route-cards').innerHTML = routes.map((x, i) => {
        const diff = Math.round((x.duration - routes[0].duration) / 60);
        const tag = i === 0 ? 'Le plus rapide' : (diff > 0 ? `+${diff} min` : 'Alternative');
        const ret = x.duration_typical ? Math.round((x.duration - x.duration_typical) / 60) : 0;
        return `<button data-idx="${i}" class="text-left rounded-xl px-3 py-2 border-2 ${i === sel ? 'border-blue-500 bg-blue-600/20' : 'border-gray-700 bg-gray-800'}">` +
            `<div class="flex justify-between items-baseline"><span class="text-lg font-black">${formatDuree(x.duration)}</span><span class="text-xs text-gray-400">${formatDist(x.distance)}</span></div>` +
            `<div class="text-xs ${i === 0 ? 'text-emerald-400' : 'text-gray-400'}">${tag}${ret > 3 ? ` · <span class="text-red-400">${ret} min de bouchons</span>` : ''}</div></button>`;
    }).join('');
}

function cacherChoix() {
    preview = null;
    const box = $('route-choice'); if (box) box.classList.add('hidden');
    const alt = map && map.getSource('alt');
    if (alt) alt.setData({ type: 'FeatureCollection', features: [] });
}

function setupChoix() {
    $('route-cards').addEventListener('click', (e) => {
        const b = e.target.closest('[data-idx]');
        if (b && preview) { preview.sel = +b.dataset.idx; majChoix(); }
    });
    $('route-go').addEventListener('click', () => {
        if (!preview) return;
        const { routes, sel, dest } = preview;
        demarrerNavigation(routes[sel], dest, false);
    });
}

/* ---------- 6 ter. SUPERCHARGEURS (OpenStreetMap / Overpass, sans clé) ---------- */
const scActif = () => localStorage.getItem('gps_sc') !== 'off';

function basculerSuperchargeurs() {
    const on = scActif();
    localStorage.setItem('gps_sc', on ? 'off' : 'on');
    if (on) { scMarkers.forEach(m => m.remove()); scMarkers = []; scData = []; if (nav) nav.sc = []; majInfoSC(); }
    else chargerSuperchargeurs(true);
}

async function chargerSuperchargeurs(force) {
    if (!scActif() || !pos || !map) return;
    const now = Date.now();
    if (!force && now - lastSC < 120000) return;
    lastSC = now;
    let zone;
    if (nav) {                                  // le long de l'itinéraire (3 km de part et d'autre)
        const c = nav.coords, pas = Math.max(1, Math.floor(c.length / 60)), pts = [];
        for (let i = 0; i < c.length; i += pas) pts.push(`${c[i][1].toFixed(4)},${c[i][0].toFixed(4)}`);
        pts.push(`${c[c.length - 1][1].toFixed(4)},${c[c.length - 1][0].toFixed(4)}`);
        zone = `around:3000,${pts.join(',')}`;
    } else zone = `around:15000,${pos.lat},${pos.lon}`;
    const f = `["amenity"="charging_station"]`;
    const q = `[out:json][timeout:25];(nwr${f}["brand"~"Tesla",i](${zone});nwr${f}["operator"~"Tesla",i](${zone});nwr${f}["network"~"Tesla",i](${zone}););out center tags;`;
    try {
        const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        const d = await r.json();
        afficherSC(d.elements || []);
    } catch (e) { console.warn('Erreur Superchargeurs', e); lastSC = 0; }
}

function afficherSC(elements) {
    scMarkers.forEach(m => m.remove());
    scMarkers = []; scData = [];
    const vus = new Set();
    elements.forEach(el => {
        const lat = el.lat ?? (el.center && el.center.lat), lon = el.lon ?? (el.center && el.center.lon), t = el.tags || {};
        if (lat == null || vus.has(el.type + el.id)) return;
        vus.add(el.type + el.id);
        const name = t.name || 'Supercharger';
        const detail = [t.capacity ? `${t.capacity} bornes` : '', t['socket:tesla_supercharger:output'] || ''].filter(Boolean).join(' · ') || 'Supercharger Tesla';

        const pin = document.createElement('div');
        pin.textContent = '⚡';
        pin.style.cssText = 'font-size:16px;background:#dc2626;color:#fff;border:2px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.45);cursor:pointer';
        const box = document.createElement('div');
        const t1 = document.createElement('div'); t1.style.fontWeight = '700'; t1.textContent = name;
        const t2 = document.createElement('div'); t2.textContent = detail;
        const btn = document.createElement('button');
        btn.textContent = '🚗 Y aller';
        btn.style.cssText = 'margin-top:6px;background:#2563eb;color:#fff;border-radius:8px;padding:6px 12px;font-weight:600';
        btn.addEventListener('click', () => naviguerVers(name, lat, lon));
        box.append(t1, t2, btn);
        scMarkers.push(new maplibregl.Marker({ element: pin }).setLngLat([lon, lat])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setDOMContent(box)).addTo(map));
        scData.push({ name, lat, lon });
    });
    if (nav) {                                  // position de chaque borne le long de la route
        nav.sc = scData.map(s => { const r = chercherSurRoute([s.lon, s.lat], 0, nav.coords.length - 2); return { ...s, along: alongDe(r) }; })
            .sort((a, b) => a.along - b.along);
    }
    majInfoSC();
}

function majInfoSC() {
    const el = $('info-charge');
    if (!el) return;
    if (!scActif()) { el.innerText = 'Masqués'; return; }
    if (nav && nav.sc) {
        const nx = nav.sc.find(x => x.along > nav.along);
        el.innerText = nx ? `${nx.name} · ${formatDist(nx.along - nav.along)}` : 'Aucun sur la route';
    } else el.innerText = `${scData.length} à proximité`;
}

/* ---------- 3 bis. SUGGESTIONS D'ADRESSE pendant la frappe (Mapbox Geocoding) ---------- */
let suggestions = [], suggestTimer = null, suggestCtl = null;

function setupSuggestions() {
    const input = $('search-input'), box = $('search-suggest');
    if (!input || !box) return;
    input.addEventListener('input', () => {
        clearTimeout(suggestTimer);
        const q = input.value.trim();
        if (q.length < 3) { cacherSuggestions(); return; }
        suggestTimer = setTimeout(() => chercherSuggestions(q), 250);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') cacherSuggestions(); });
    box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) choisirSuggestion(suggestions[+b.dataset.i]);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#search-wrap')) cacherSuggestions(); });
}

async function chercherSuggestions(q) {
    const key = getApiKey('mapbox');
    if (!key) return;
    if (suggestCtl) suggestCtl.abort();
    suggestCtl = new AbortController();
    const prox = pos ? `&proximity=${pos.lon},${pos.lat}` : '';
    try {
        const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&autocomplete=true&limit=5&language=fr${prox}&access_token=${key}`, { signal: suggestCtl.signal });
        const j = await r.json();
        suggestions = (j.features || []).map(f => {
            const p = f.properties || {};
            return { name: p.name_preferred || p.name || q,
                label: p.full_address || [p.name, p.place_formatted].filter(Boolean).join(', '),
                lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
        });
        $('search-suggest').innerHTML = suggestions.map((x, i) =>
            `<button data-i="${i}" class="w-full text-left px-4 py-3 text-sm hover:bg-gray-800 border-b border-gray-800 last:border-0 truncate">📍 ${escapeHtml(x.label)}</button>`).join('');
        $('search-suggest').classList.toggle('hidden', !suggestions.length);
    } catch (e) { if (e.name !== 'AbortError') console.warn('Erreur suggestions', e); }
}

function cacherSuggestions() {
    clearTimeout(suggestTimer);
    if (suggestCtl) suggestCtl.abort();
    suggestions = [];
    const box = $('search-suggest');
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
}

function choisirSuggestion(sg) {
    if (!sg) return;
    $('search-input').value = sg.label;
    cacherSuggestions();
    naviguerVers(sg.name, sg.lat, sg.lon);
}

/* ---------- 7 bis. WAZE (alertes communautaires via OpenWeb Ninja) ---------- */
// Activable à tout moment avec le bouton 🚓 (pas seulement en guidage).
// Rafraîchi toutes les 10 min tant que l'onglet est visible, pour ménager le quota.
const WAZE_TYPES = { POLICE: ['🚓', 'Police'], ACCIDENT: ['💥', 'Accident'], HAZARD: ['⚠️', 'Danger'], ROAD_CLOSED: ['⛔', 'Route fermée'], JAM: ['🐢', 'Ralentissement'] };
let wazeMarkers = [], wazeTimer = null, lastWaze = 0, wazeCount = 0;
const wazeActif = () => localStorage.getItem('gps_waze') === 'on';

function majBoutonWaze() {
    const b = $('btn-waze');
    if (b) b.style.boxShadow = wazeActif() ? '0 0 0 3px #33ccff' : '';
    majInfoWaze();
}

function majInfoWaze(msg) {
    const el = $('info-waze');
    if (!el) return;
    if (msg) { el.innerText = msg; el.className = 'font-semibold text-orange-500 text-right truncate'; return; }
    if (!wazeActif()) { el.innerText = 'Désactivé'; el.className = 'font-semibold text-gray-500 text-right truncate'; return; }
    el.innerText = lastWaze ? `${wazeCount} alertes · ${new Date(lastWaze).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Chargement…';
    el.className = 'font-semibold text-gray-900 dark:text-white text-right truncate';
}

function basculerWaze() {
    if (!getApiKey('waze')) { alert("Ajoute ta clé OpenWeb Ninja (Waze) dans ⚙️ pour activer les alertes Waze."); return; }
    if (wazeActif()) {
        localStorage.setItem('gps_waze', 'off');
        clearInterval(wazeTimer); wazeTimer = null;
        wazeMarkers.forEach(m => m.remove()); wazeMarkers = []; wazeCount = 0;
    } else {
        localStorage.setItem('gps_waze', 'on');
        demarrerWaze();
        chargerWaze(true);
    }
    majBoutonWaze();
}

function demarrerWaze() {
    clearInterval(wazeTimer);
    wazeTimer = setInterval(() => chargerWaze(), 600000);   // toutes les 10 minutes
}

async function chargerWaze(force) {
    const key = getApiKey('waze');
    if (!wazeActif() || !key || !pos || !map) return;
    if (document.visibilityState === 'hidden') return;
    if (!force && Date.now() - lastWaze < 540000) return;
    const pts = [[pos.lon, pos.lat]];
    if (nav && nav.total - nav.along > 5000) pts.push(pointSurRoute(nav.along + 15000));   // une seule requête couvrant la route devant
    const lons = pts.map(x => x[0]), lats = pts.map(x => x[1]);
    const bl = `${Math.min(...lats) - 0.1},${Math.min(...lons) - 0.15}`, tr = `${Math.max(...lats) + 0.1},${Math.max(...lons) + 0.15}`;
    lastWaze = Date.now();
    try {
        const r = await fetch(`https://api.openwebninja.com/waze/alerts-and-jams?bottom_left=${bl}&top_right=${tr}&max_alerts=200&max_jams=0`, { headers: { 'x-api-key': key } });
        if (!r.ok) { majInfoWaze(r.status === 401 || r.status === 403 ? 'Clé refusée' : r.status === 429 ? 'Quota atteint' : `Erreur ${r.status}`); return; }
        const j = await r.json();
        afficherWaze((j.data && j.data.alerts) || []);
    } catch (e) {
        console.warn('Erreur Waze', e);
        majInfoWaze('Bloqué par le navigateur (CORS ?)');
    }
}

function afficherWaze(alerts) {
    wazeMarkers.forEach(m => m.remove());
    wazeMarkers = [];
    alerts.forEach(a => {
        const lat = a.latitude ?? a.lat ?? (a.location && a.location.y), lon = a.longitude ?? a.lon ?? a.lng ?? (a.location && a.location.x);
        const type = String(a.type || '').toUpperCase(), def = WAZE_TYPES[type];
        if (lat == null || lon == null || !def) return;
        const age = Date.parse(a.publish_datetime_utc);
        const detail = [def[1], a.description || (a.subtype ? String(a.subtype).replace(/_/g, ' ').toLowerCase() : ''), a.street,
            isNaN(age) ? '' : `il y a ${Math.max(1, Math.round((Date.now() - age) / 60000))} min`, a.num_thumbs_up ? `👍 ${a.num_thumbs_up}` : ''].filter(Boolean).join(' · ');
        const el = document.createElement('div');
        el.textContent = def[0];
        el.style.cssText = 'font-size:17px;background:#fff;border:3px solid #33ccff;border-radius:9px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
        wazeMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat])
            .setPopup(new maplibregl.Popup({ offset: 16 }).setText(detail)).addTo(map));
    });
    wazeCount = wazeMarkers.length;
    majInfoWaze();
}

/* ---------- 7. INCIDENTS (TomTom) ---------- */
const CAT_INCIDENT = { 1: ['💥', 'Accident'], 2: ['🌫️', 'Brouillard'], 3: ['⚠️', 'Conditions dangereuses'], 4: ['🌧️', 'Pluie forte'],
    5: ['🧊', 'Verglas'], 6: ['🚗', 'Embouteillage'], 7: ['🚧', 'Voie fermée'], 8: ['⛔', 'Route fermée'], 9: ['🚧', 'Travaux'],
    10: ['💨', 'Vent fort'], 11: ['🌊', 'Inondation'], 14: ['🔧', 'Véhicule en panne'] };
const COULEUR_GRAVITE = ['#9ca3af', '#eab308', '#f97316', '#ef4444', '#7f1d1d'];

async function rafraichirIncidents() {
    const key = getApiKey('tomtom');
    if (!key || !pos || !map) return;
    const centres = [[pos.lon, pos.lat]];
    if (nav && nav.total - nav.along > 5000) centres.push(pointSurRoute(nav.along + 15000)); // et 15 km devant
    const fields = encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,iconCategory},from,to,delay,length}}}');
    const all = new Map();
    await Promise.all(centres.map(async (c) => {
        const bbox = [c[0] - 0.12, c[1] - 0.08, c[0] + 0.12, c[1] + 0.08].join(',');
        try {
            const r = await fetch(`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${key}&bbox=${bbox}&fields=${fields}&language=fr-FR&timeValidityFilter=present`);
            if (!r.ok) return;
            ((await r.json()).incidents || []).forEach(i => all.set(i.properties.id, i));
        } catch (e) { console.warn('Erreur incidents', e); }
    }));
    afficherIncidents([...all.values()]);
}

function afficherIncidents(list) {
    incidentMarkers.forEach(m => m.remove());
    incidentMarkers = []; incidentsData = [];
    list.forEach(i => {
        const g = i.geometry, pr = i.properties;
        const c = g.type === 'Point' ? g.coordinates : g.coordinates[0];
        const [emoji, label] = CAT_INCIDENT[pr.iconCategory] || ['⚠️', 'Incident'];
        const desc = (pr.events && pr.events[0] && pr.events[0].description) || label;
        const el = document.createElement('div');
        el.textContent = emoji;
        el.style.cssText = `font-size:18px;background:#fff;border:3px solid ${COULEUR_GRAVITE[pr.magnitudeOfDelay] || COULEUR_GRAVITE[0]};` +
            'border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer';
        const texte = `${desc}${pr.from ? ' — ' + pr.from : ''}${pr.delay ? ` (+${Math.round(pr.delay / 60)} min)` : ''}`;
        incidentMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(c)
            .setPopup(new maplibregl.Popup({ offset: 18 }).setText(texte)).addTo(map));
        incidentsData.push({ id: pr.id, lon: c[0], lat: c[1], label, delay: pr.delay || 0 });
    });
    if (nav) incidentsSurRoute();
    majInfoIncidents();
}

function incidentsSurRoute() {                   // incidents à moins de 60 m de l'itinéraire, devant nous
    nav.incidents = incidentsData.map(inc => {
        const r = chercherSurRoute([inc.lon, inc.lat], 0, nav.coords.length - 2);
        return { ...inc, off: r.d, along: alongDe(r) };
    }).filter(inc => inc.off < 60 && inc.along > nav.along - 50).sort((a, b) => a.along - b.along);
}

function majInfoIncidents() {
    const el = $('info-incidents');
    if (!el) return;
    if (nav) {
        const n = nav.incidents.length, min = Math.round(nav.incidents.reduce((s, x) => s + x.delay, 0) / 60);
        el.innerText = n ? `${n} sur l'itinéraire${min ? ` (+${min} min)` : ''}` : 'Aucun sur l\'itinéraire';
        el.className = 'font-semibold ' + (n ? 'text-orange-500' : 'text-emerald-500');
    } else {
        el.innerText = getApiKey('tomtom') ? `${incidentsData.length} à proximité` : 'Clé TomTom requise';
        el.className = 'font-semibold text-gray-900 dark:text-white';
    }
}

// --- 6. GESTION DES CLÉS API (FIRESTORE + LOCALSTORAGE) & FAVORIS ---
function getApiKey(name) { 
    return localStorage.getItem(`api_key_${name}`) || ''; 
}

async function chargerClesApiFirestore() {
    try {
        if (typeof db === 'undefined') return;
        const docSnap = await db.collection("dashboards").doc("justin_api_keys").get();
        if (docSnap.exists) {
            const keys = docSnap.data();
            if (keys.tomtom) localStorage.setItem('api_key_tomtom', keys.tomtom);
            if (keys.openweather) localStorage.setItem('api_key_openweather', keys.openweather);
            if (keys.mapbox) localStorage.setItem('api_key_mapbox', keys.mapbox);
            if (keys.waze) localStorage.setItem('api_key_waze', keys.waze);
        }
    } catch (e) {
        console.warn("Chargement clés Firestore ignoré (mode local)", e);
    }
}

function openApiModal() {
    let modal = document.getElementById('api-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'api-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between">
                    <h3 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><span>🔑</span> Gestionnaire des Clés API</h3>
                    <button onclick="document.getElementById('api-modal').remove()" class="text-gray-400 hover:text-gray-600 text-sm font-bold">×</button>
                </div>
                <div class="flex flex-col gap-3 text-xs">
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">TomTom (Trafic &amp; incidents)</label>
                        <input type="password" id="key-tomtom" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">OpenWeather (Météo)</label>
                        <input type="password" id="key-openweather" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">Mapbox (Itinéraire &amp; guidage)</label>
                        <input type="password" id="key-mapbox" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">Waze via OpenWeb Ninja (alertes police, accidents…)</label>
                        <input type="password" id="key-waze" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button onclick="document.getElementById('api-modal').remove()" class="flex-1 bg-gray-200 dark:bg-gray-800 py-2 rounded-lg text-xs font-semibold">Annuler</button>
                    <button onclick="saveApiKeys()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold">Enregistrer (Cloud + Local)</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }
    document.getElementById('key-tomtom').value = getApiKey('tomtom');
    document.getElementById('key-openweather').value = getApiKey('openweather');
    document.getElementById('key-mapbox').value = getApiKey('mapbox');
    document.getElementById('key-waze').value = getApiKey('waze');
}

async function saveApiKeys() {
    const tomtom = document.getElementById('key-tomtom').value.trim();
    const openweather = document.getElementById('key-openweather').value.trim();
    const mapbox = document.getElementById('key-mapbox').value.trim();
    const waze = document.getElementById('key-waze').value.trim();

    // 1. Sauvegarde locale
    localStorage.setItem('api_key_tomtom', tomtom);
    localStorage.setItem('api_key_openweather', openweather);
    localStorage.setItem('api_key_mapbox', mapbox);
    localStorage.setItem('api_key_waze', waze);

    // 2. Sauvegarde Cloud sur Firestore
    try {
        if (typeof db !== 'undefined') {
            await db.collection("dashboards").doc("justin_api_keys").set({
                tomtom: tomtom,
                openweather: openweather,
                mapbox: mapbox,
                waze: waze
            }, { merge: true });
            console.log("Clés API sauvegardées dans Firestore !");
        }
    } catch (e) {
        console.error("Erreur de sauvegarde Firestore des clés API", e);
    }

    document.getElementById('api-modal').remove();
    alert("Clés enregistrées et synchronisées ! La page va se recharger.");
    location.reload();
}

async function configurerFavori(type) {
    const adresse = prompt(`Entrez l'adresse pour ${type === 'domicile' ? 'le Domicile' : 'le Travail'} :`);
    if (!adresse) return;

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            localStorage.setItem(`fav_${type}_name`, data[0].display_name.split(',')[0]);
            localStorage.setItem(`fav_${type}_lat`, data[0].lat);
            localStorage.setItem(`fav_${type}_lon`, data[0].lon);
            mettreAJourAffichageFavoris();
            alert("Favori enregistré avec succès !");
        } else {
            alert("Adresse introuvable.");
        }
    } catch (e) {
        console.error("Erreur favori", e);
    }
}

function naviguerVersFavori(type) {
    const name = localStorage.getItem(`fav_${type}_name`);
    const lat = parseFloat(localStorage.getItem(`fav_${type}_lat`));
    const lon = parseFloat(localStorage.getItem(`fav_${type}_lon`));
    if (!name || isNaN(lat) || isNaN(lon)) {
        configurerFavori(type);
        return;
    }
    naviguerVers(name, lat, lon);
}

function mettreAJourAffichageFavoris() {
    const dom = localStorage.getItem('fav_domicile_name');
    if (dom) { const el = document.getElementById('label-domicile'); if (el) el.innerText = dom; }
    const trav = localStorage.getItem('fav_travail_name');
    if (trav) { const el = document.getElementById('label-travail'); if (el) el.innerText = trav; }
}
