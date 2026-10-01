/* ============================================================
   HOME-BG.JS — Dashboard Home Assistant en fond de la page d'accueil
   L'adresse est enregistrée dans Firestore (dashboards/justin_config.haUrl)
   pour être la même sur la Tesla, le téléphone, etc.
   ============================================================ */
onAppReady(() => {
    localStorage.removeItem('ha_token');        // l'ancien jeton API n'est plus utilisé

    const frame = document.getElementById('ha-frame');
    const setup = document.getElementById('ha-setup');
    const input = document.getElementById('ha-url-input');
    const errEl = document.getElementById('ha-setup-error');
    const cancel = document.getElementById('ha-setup-cancel');
    const cfgRef = db.collection('dashboards').doc('justin_config');
    let url = '';

    function afficherSetup(avecAnnuler) {
        input.value = url;
        errEl.classList.add('hidden');
        cancel.classList.toggle('hidden', !avecAnnuler);
        setup.classList.remove('hidden');
        input.focus();
    }

    function appliquer(u) {
        url = u;
        if (!u) { afficherSetup(false); return; }
        setup.classList.add('hidden');
        if (frame.getAttribute('src') !== u) frame.src = u;
        document.getElementById('btn-ha-open').href = u;
    }

    async function enregistrer() {
        const u = normaliserUrl(input.value);
        if (!u) { errEl.textContent = 'Adresse invalide (http ou https uniquement).'; errEl.classList.remove('hidden'); return; }
        if (location.protocol === 'https:' && u.startsWith('http:')) {
            errEl.textContent = "Ce site est en https : le navigateur bloquera une adresse http. Utilise l'adresse https (Tailscale Funnel).";
            errEl.classList.remove('hidden');
            return;
        }
        localStorage.setItem('ha_url', u);
        try { await cfgRef.set({ haUrl: u }, { merge: true }); }
        catch (e) { console.warn("Adresse HA non synchronisée (Firestore) :", e); }
        appliquer(u);
    }

    document.getElementById('ha-setup-save').addEventListener('click', enregistrer);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enregistrer(); });
    cancel.addEventListener('click', () => setup.classList.add('hidden'));
    document.getElementById('btn-ha-config').addEventListener('click', () => afficherSetup(!!url));
    document.getElementById('btn-ha-reload').addEventListener('click', () => { if (url) { frame.src = 'about:blank'; setTimeout(() => { frame.src = url; }, 50); } });
    document.getElementById('btn-widgets').addEventListener('click', () => document.getElementById('widgets-panel').classList.toggle('hidden'));

    // Affichage immédiat avec l'adresse locale, puis synchro avec Firestore
    const local = localStorage.getItem('ha_url') || '';
    if (local) appliquer(local);
    cfgRef.get().then((snap) => {
        const cloud = snap.exists ? snap.data().haUrl : '';
        if (cloud) { localStorage.setItem('ha_url', cloud); if (cloud !== url) appliquer(cloud); }
        else if (!url) appliquer('');
    }).catch((e) => { console.warn('Lecture HA impossible', e); if (!url) appliquer(''); });
});
