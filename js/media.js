/* ============================================================
   JUST GO — Encarts média sous le GPS (🎵 pour afficher/masquer)
   Gauche : Radio  → onglet « Radioplayer » (play.radioplayer.org/fr en iframe)
                     onglet « Mes radios »   (lecteur à nous, flux HTTPS via Radio-Browser)
   Droite : Spotify → lecteur intégré officiel (colle un lien playlist/album/titre)
   La voix du GPS baisse le volume de « Mes radios » pendant qu'elle parle
   (impossible sur les iframes Radioplayer / Spotify : elles ne se contrôlent pas).
   Chargé APRÈS justgo.js.
   ============================================================ */
(() => {
    const st = document.createElement('style');
    st.textContent = `
    :root{--dock-h:0px} body.dock-open{--dock-h:min(36vh,340px)}
    body.dock-open #map{bottom:var(--dock-h)}
    body.dock-open .bottom-6{bottom:calc(var(--dock-h) + 1.5rem)!important}
    #dock-media{position:fixed;left:0;right:0;bottom:0;height:var(--dock-h);z-index:30;display:none;gap:8px;padding:8px;background:#0b0f19}
    body.dock-open #dock-media{display:flex}
    #dock-media>section{flex:1;min-width:0;display:flex;flex-direction:column;background:#111827;border-radius:14px;overflow:hidden;color:#fff;font-size:12px}
    #dock-media .bar{display:flex;gap:6px;padding:6px;background:#1f2937;align-items:center}
    #dock-media .bar button,#dock-media .bar select,#dock-media .bar input{background:#374151;color:#fff;border-radius:8px;padding:6px 10px;font-size:12px;border:0;outline:0}
    #dock-media .bar input{flex:1;min-width:0}
    #dock-media .on{background:#2563eb!important}
    #dock-media .body{flex:1;min-height:0;position:relative;overflow:auto}
    #dock-media iframe{width:100%;height:100%;border:0}
    #dock-media .st{display:block;width:100%;text-align:left;padding:10px 12px;border-bottom:1px solid #1f2937}`;
    document.head.appendChild(st);

    const dock = document.createElement('div');
    dock.id = 'dock-media';
    dock.innerHTML = `
    <section id="m-radio">
      <div class="bar"><b>📻</b><button id="t-rp" class="on">Radioplayer</button><button id="t-own">Mes radios</button></div>
      <div class="body" id="m-radio-body"></div>
    </section>
    <section id="m-spot">
      <div class="bar"><b>🎧</b><input id="sp-in" placeholder="Colle un lien Spotify (playlist, album, titre…)"><button id="sp-go">Charger</button></div>
      <div class="body" id="m-spot-body"><p style="padding:14px;color:#9ca3af">Colle un lien Spotify ci-dessus. Pour la lecture complète, connecte-toi à Spotify dans le lecteur (compte Premium).</p></div>
    </section>`;
    document.body.appendChild(dock);

    /* ---------- Afficher / masquer ---------- */
    const ouvert = () => localStorage.getItem('dock_open') !== 'off';
    let init = false;
    function appliquer() {
        document.body.classList.toggle('dock-open', ouvert());
        if (ouvert() && !init) { init = true; onglet('rp'); chargerSpotify(localStorage.getItem('sp_url')); }
        setTimeout(() => { try { map.resize(); } catch (e) {} }, 60);
    }
    const bt = document.createElement('button');
    bt.textContent = '🎵'; bt.title = 'Afficher/masquer radio et Spotify';
    bt.className = 'bg-white/90 dark:bg-gray-900/90 hover:bg-gray-200 dark:hover:bg-gray-800 p-3 rounded-full backdrop-blur border border-gray-300 dark:border-gray-700 shadow-lg text-lg transition-colors';
    bt.onclick = () => { localStorage.setItem('dock_open', ouvert() ? 'off' : 'on'); appliquer(); };
    const ref = document.querySelector('button[title="Afficher/masquer les Superchargeurs"]');
    if (ref) ref.after(bt); else document.body.appendChild(bt);

    /* ---------- Radio ---------- */
    const body = document.getElementById('m-radio-body');
    let audio = null, vol = 1;
    function onglet(t) {
        document.getElementById('t-rp').classList.toggle('on', t === 'rp');
        document.getElementById('t-own').classList.toggle('on', t === 'own');
        if (t === 'rp') {                      // on garde l'iframe vivante pour ne pas couper le son
            if (!body.querySelector('iframe')) body.innerHTML = '<iframe src="https://play.radioplayer.org/fr" allow="autoplay; encrypted-media"></iframe>';
            body.querySelector('iframe').style.display = 'block';
            const own = body.querySelector('.own'); if (own) own.style.display = 'none';
        } else {
            const f = body.querySelector('iframe'); if (f) f.style.display = 'none';
            let own = body.querySelector('.own');
            if (!own) { own = document.createElement('div'); own.className = 'own'; body.appendChild(own); construireOwn(own); }
            own.style.display = 'block';
        }
    }
    document.getElementById('t-rp').onclick = () => onglet('rp');
    document.getElementById('t-own').onclick = () => onglet('own');

    function construireOwn(el) {
        el.innerHTML = `<div class="bar" style="position:sticky;top:0;z-index:1">
            <select id="rd-c"><option value="FR">France</option><option value="BE">Belgique</option></select>
            <input id="rd-q" placeholder="Chercher une radio (NRJ, RTL…)"><button id="rd-s">🔍</button></div>
            <div id="rd-l"></div>
            <div class="bar" style="position:sticky;bottom:0"><span id="rd-n" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">—</span>
            <input type="range" id="rd-v" min="0" max="100" value="100" style="flex:none;width:90px"><button id="rd-x">⏹</button></div>`;
        audio = new Audio(); audio.preload = 'none';
        const q = id => el.querySelector(id);
        q('#rd-s').onclick = chercher; q('#rd-q').onkeydown = e => { if (e.key === 'Enter') chercher(); };
        q('#rd-c').onchange = chercher;
        q('#rd-v').oninput = e => { vol = e.target.value / 100; audio.volume = vol; };
        q('#rd-x').onclick = () => { audio.pause(); q('#rd-n').textContent = '—'; };
        chercher();
        async function chercher() {
            const nom = q('#rd-q').value.trim(), cc = q('#rd-c').value;
            q('#rd-l').innerHTML = '<p style="padding:12px;color:#9ca3af">Chargement…</p>';
            try {
                const u = `https://de1.api.radio-browser.info/json/stations/search?countrycode=${cc}&limit=60&hidebroken=true&order=clickcount&reverse=true&is_https=true` + (nom ? `&name=${encodeURIComponent(nom)}` : '');
                const l = (await (await fetch(u)).json()).filter(s => (s.url_resolved || '').startsWith('https')).slice(0, 25);
                q('#rd-l').innerHTML = '';
                if (!l.length) q('#rd-l').innerHTML = '<p style="padding:12px;color:#9ca3af">Aucune radio trouvée.</p>';
                l.forEach(s => {
                    const b = document.createElement('button'); b.className = 'st'; b.textContent = '▶ ' + s.name.trim();
                    b.onclick = () => { audio.src = s.url_resolved; audio.volume = vol; audio.play().catch(() => { q('#rd-n').textContent = 'Lecture impossible'; });
                        q('#rd-n').textContent = '🔊 ' + s.name.trim(); };
                    q('#rd-l').appendChild(b);
                });
            } catch (e) { q('#rd-l').innerHTML = '<p style="padding:12px;color:#f87171">Liste de radios injoignable.</p>'; }
        }
    }

    /* ---------- Spotify ---------- */
    function chargerSpotify(url) {
        if (!url) return;
        const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
        const b = document.getElementById('m-spot-body');
        if (!m) { b.innerHTML = '<p style="padding:14px;color:#f87171">Lien Spotify non reconnu.</p>'; return; }
        localStorage.setItem('sp_url', url);
        document.getElementById('sp-in').value = url;
        b.innerHTML = `<iframe src="https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
    }
    document.getElementById('sp-go').onclick = () => chargerSpotify(document.getElementById('sp-in').value.trim());
    document.getElementById('sp-in').onkeydown = e => { if (e.key === 'Enter') chargerSpotify(e.target.value.trim()); };

    /* ---------- La voix du GPS baisse « Mes radios » ---------- */
    if (typeof parler === 'function') {
        const orig = parler; let t = null;
        parler = function (text) {
            if (audio && !audio.paused) {
                audio.volume = Math.min(vol, 0.2);
                clearTimeout(t); t = setTimeout(() => { audio.volume = vol; }, 1500 + String(text).length * 75);
            }
            return orig.apply(this, arguments);
        };
    }
    appliquer();
})();
