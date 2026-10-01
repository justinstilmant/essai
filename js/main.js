/* ============================================================
   MAIN.JS — Tableau de bord personnel (Firebase / Firestore)
   Structure du fichier :
     1. Initialisation Firebase + état global
     2. Utilitaires (échappement HTML, validation d'URL)
     3. Chargement Header / Footer + navigation active
     4. Mode Sombre / Clair
     5. Header : horloge live + banderole Firestore
     6. Modales de configuration de la banderole
     7. Authentification (Firebase Auth) + écran de verrouillage
     8. Météo locale (Open-Meteo)
     9. Raccourcis paramétrables (CRUD + Drag & Drop Firestore)
    10. Démarrage de l'application (une fois connecté)
   ============================================================ */


/* ============================================================
   1. INITIALISATION FIREBASE (projet "page-tesla") + ÉTAT GLOBAL
   ============================================================ */
// La clé apiKey Firebase est publique par conception : la vraie protection
// vient des règles Firestore (voir firestore.rules) et de Firebase Auth.
const firebaseConfig = {
  apiKey: "AIzaSyBodP_pojUNVIXE5oJwanIlLa9yKWaOPNI",
  authDomain: "page-tesla.firebaseapp.com",
  databaseURL: "https://page-tesla-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "page-tesla",
  storageBucket: "page-tesla.firebasestorage.app",
  messagingSenderId: "934154048830",
  appId: "1:934154048830:web:ccba428fc3f6f1b29f886f",
  measurementId: "G-M2E33GZD17"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

let isAdmin = false;               // true dès qu'un utilisateur est connecté
let currentAdminUser = null;
let appStarted = false;            // true une fois l'application démarrée (après connexion)
const appReadyCallbacks = [];      // fonctions à lancer au démarrage (voir onAppReady)
const sortables = {};              // instances SortableJS par grille

/**
 * Enregistre une fonction à exécuter UNE SEULE FOIS, après connexion.
 * Remplace l'ancienne détection automatique des fonctions "init..." qui
 * provoquait des doubles initialisations.
 */
function onAppReady(fn) {
    if (appStarted) runSafe(fn);
    else appReadyCallbacks.push(fn);
}

function runSafe(fn) {
    try { fn(); } catch (e) { console.error(`Erreur dans ${fn.name || 'callback'} :`, e); }
}


/* ============================================================
   2. UTILITAIRES
   ============================================================ */
// Échappement HTML : évite qu'un texte saisi ne casse la mise en page
// ou n'injecte du code lorsqu'il est réinjecté via innerHTML.
function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Valide/normalise une URL saisie : ajoute https:// si absent et refuse tout
// autre protocole (javascript:, data:, ...). Renvoie '' si l'URL est invalide.
function normaliserUrl(raw) {
    let url = (raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        // "monsite.com" ou "localhost:3000" -> OK ; "javascript:..." -> refusé
        if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(url)) return '';
        url = 'https://' + url;
    }
    try { new URL(url); return url; } catch (e) { return ''; }
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
}

// Icône de secours (SVG inline) quand un logo ne se charge pas
const ICONE_PAR_DEFAUT = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
    '<rect width="40" height="40" rx="8" fill="#6b7280"/>' +
    '<text x="20" y="27" font-size="22" text-anchor="middle" fill="#fff" font-family="sans-serif">?</text></svg>'
);


/* ============================================================
   3. CHARGEMENT HEADER / FOOTER + DÉTECTION DE LA PAGE ACTIVE
   ============================================================ */
const domReady = new Promise((resolve) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', resolve);
    else resolve();
});

function loadHTML(id, filename) {
    const target = document.getElementById(id);
    if (!target) return Promise.resolve(); // page sans ce placeholder (ex: justgo.html)
    return fetch(filename)
        .then(response => {
            if (!response.ok) throw new Error(`${filename} : HTTP ${response.status}`);
            return response.text();
        })
        .then(data => { target.innerHTML = data; });
}

// Résolue quand le header est en place (ou tout de suite s'il n'y en a pas)
const headerReady = domReady.then(() => {
    loadHTML('footer-placeholder', 'includes/footer.html').catch(e => console.error(e));
    return loadHTML('header-placeholder', 'includes/header.html')
        .then(() => {
            demarrerHorloge();
            marquerPageActive();
            majIconeTheme();
        })
        .catch(e => console.error("Erreur de chargement du header :", e));
});

function marquerPageActive() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("header nav a").forEach(link => {
        if (link.getAttribute("href") === currentPath) {
            link.className = "px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white shadow";
            link.setAttribute("aria-current", "page");
        } else {
            link.className = "px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg";
        }
    });
}


/* ============================================================
   4. MODE SOMBRE / CLAIR
   ============================================================ */
function majIconeTheme() {
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerText = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
}

function toggleDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    majIconeTheme();
}

// Application du thème enregistré dès le chargement
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
} else {
    document.documentElement.classList.add('dark');
}


/* ============================================================
   5. HEADER : HORLOGE EN DIRECT & BANDEROLE (Firestore realtime)
   ============================================================ */
let clockTimer = null;
function demarrerHorloge() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    const update = () => { clockEl.innerText = new Date().toLocaleTimeString('fr-FR'); };
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(update, 1000);
    update();
}

let bannerUnsubscribe = null;
function demarrerSynchroBanderole() {
    if (bannerUnsubscribe) return; // déjà en écoute
    if (!document.getElementById('banner-text-display')) return; // page sans banderole

    bannerUnsubscribe = db.collection("dashboards").doc("justin_config").onSnapshot((docSnap) => {
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.bannerText !== undefined) {
                applyBanner(data.bannerText, data.bannerColor, data.bannerSize, data.bannerEffect, data.bannerSpeed);
            }
        } else {
            applyBanner('Bienvenue Justin !', '#60a5fa', 'text-base', 'normal', '18s');
        }
    }, (error) => {
        console.error("Erreur de synchronisation de la banderole (vérifier les règles Firestore) :", error);
    });
}

// Rendu de la banderole
function applyBanner(text, color, size, effect, speed) {
    const display = document.getElementById('banner-text-display');
    if (!display) return;

    const safeText = escapeHtml(text || 'Bienvenue Justin !');
    display.innerHTML = `<span>${safeText} &nbsp;&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;&nbsp;</span>`.repeat(6);

    // 1. Base (taille et animation) — réinitialise aussi les effets précédents
    display.className = `animate-marquee font-medium inline-block ${size || 'text-base'}`;

    // 2. Effets
    if (effect === 'rainbow') {
        display.classList.add('text-rainbow');
        display.style.removeProperty('color'); // nécessaire pour que le dégradé s'affiche
    } else if (effect === 'neon') {
        display.classList.add('neon-glow');
        display.style.setProperty('color', color || '#60a5fa', 'important');
    } else {
        display.style.removeProperty('color');
        display.style.color = color || '#60a5fa';
    }

    // 3. Vitesse de défilement
    if (speed) {
        display.style.animationDuration = speed;
    }
}


/* ============================================================
   6. MODALES DE CONFIGURATION DE LA BANDEROLE
   ============================================================ */
async function ouvrirModalBandole() {
    try {
        const docSnap = await db.collection("dashboards").doc("justin_config").get();
        const data = docSnap.exists ? docSnap.data() : {};

        document.getElementById('config-banner-text').value = data.bannerText !== undefined ? data.bannerText : "Bienvenue Justin !";
        document.getElementById('config-banner-color').value = data.bannerColor || "#60a5fa";
        document.getElementById('config-banner-size').value = data.bannerSize || "text-base";
        document.getElementById('config-banner-effect').value = data.bannerEffect || "normal";
        document.getElementById('config-banner-speed').value = data.bannerSpeed || "18s";

        document.getElementById('banner-modal').classList.remove('hidden');
    } catch (e) {
        console.error("Erreur lors du chargement des options de la banderole :", e);
        alert("Erreur lors du chargement des options de la banderole.");
    }
}

function fermerModalBandole() {
    document.getElementById('banner-modal').classList.add('hidden');
}

async function sauvegarderConfigBanderole() {
    const bannerText = document.getElementById('config-banner-text').value.trim();
    const bannerColor = document.getElementById('config-banner-color').value;
    const bannerSize = document.getElementById('config-banner-size').value;
    const bannerEffect = document.getElementById('config-banner-effect').value;
    const bannerSpeed = document.getElementById('config-banner-speed').value;

    try {
        await db.collection("dashboards").doc("justin_config")
            .set({ bannerText, bannerColor, bannerSize, bannerEffect, bannerSpeed }, { merge: true });
        fermerModalBandole();
    } catch (e) {
        console.error("Erreur d'enregistrement de la banderole :", e);
        alert("Erreur d'enregistrement de la banderole. (Voir la console : c'est probablement un souci de permissions Firestore.)");
    }
}


/* ============================================================
   7. AUTHENTIFICATION (Firebase Auth) + ÉCRAN DE VERROUILLAGE
   ------------------------------------------------------------
   Le site entier est derrière une vraie connexion Firebase
   (e-mail + mot de passe). Plus aucun mot de passe en clair dans
   le code. Les données Firestore ne sont même pas demandées tant
   que personne n'est connecté. Combinée aux règles de
   firestore.rules, c'est ce qui protège réellement les données.
   ============================================================ */

// Met à jour le bouton ⚙️ du header et l'affichage des actions admin-only
function updateAdminUI() {
    document.body.classList.toggle('is-admin', isAdmin);

    // Le glisser-déposer n'est actif que pour un utilisateur connecté
    Object.values(sortables).forEach(s => s.option('disabled', !isAdmin));

    const gearBtn = document.getElementById('admin-gear-btn');
    if (!gearBtn) return;
    if (isAdmin) {
        gearBtn.title = `Connecté (${currentAdminUser.email}) — cliquer pour se déconnecter`;
        gearBtn.classList.add('ring-2', 'ring-emerald-500');
    } else {
        gearBtn.title = "Compte";
        gearBtn.classList.remove('ring-2', 'ring-emerald-500');
    }
}

// Bouton ⚙️ du header : proposer la déconnexion
function ouvrirMenuCompte() {
    if (!isAdmin) return;
    if (confirm(`Connecté en tant que ${currentAdminUser.email}.\nSe déconnecter ?`)) {
        deconnexionAdmin();
    }
}

function deconnexionAdmin() {
    // On recharge la page : les écoutes Firestore sont coupées à la déconnexion,
    // repartir de zéro est le plus simple et le plus sûr.
    firebase.auth().signOut().finally(() => location.reload());
}

// --- Écran de verrouillage ---
// Créé immédiatement (couvre la page dès le premier affichage, sans flash de contenu)
function getLockScreen() {
    let el = document.getElementById('site-lock-screen');
    if (!el) {
        el = document.createElement('div');
        el.id = 'site-lock-screen';
        el.className = 'fixed inset-0 z-[100] bg-gray-950 flex items-center justify-center p-4';
        el.innerHTML = '<div class="text-gray-500 text-sm">Chargement…</div>';
        document.body.appendChild(el);
    }
    return el;
}

function afficherFormulaireConnexion() {
    const lock = getLockScreen();
    lock.innerHTML = `
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 text-center">
            <div class="text-3xl">🔒</div>
            <h2 class="text-lg font-bold text-white">Accès protégé</h2>
            <p class="text-xs text-gray-400">Connecte-toi pour accéder à ton tableau de bord.</p>
            <input type="email" id="lock-email" placeholder="E-mail..." autocomplete="username"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            <input type="password" id="lock-password" placeholder="Mot de passe..." autocomplete="current-password"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
            <p id="lock-error" class="hidden text-xs text-red-400"></p>
            <button id="lock-login-btn" class="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                Se connecter
            </button>
        </div>
    `;

    const emailInput = document.getElementById('lock-email');
    const pwdInput = document.getElementById('lock-password');
    const errorEl = document.getElementById('lock-error');
    const btn = document.getElementById('lock-login-btn');

    const afficherErreur = (msg) => { errorEl.textContent = msg; errorEl.classList.remove('hidden'); };

    const soumettre = async () => {
        const email = emailInput.value.trim();
        const pwd = pwdInput.value;
        if (!email || !pwd) { afficherErreur("Merci de renseigner l'e-mail et le mot de passe."); return; }

        btn.disabled = true;
        btn.textContent = 'Connexion…';
        errorEl.classList.add('hidden');
        try {
            await firebase.auth().signInWithEmailAndPassword(email, pwd);
            // La suite est gérée par onAuthStateChanged
        } catch (e) {
            console.error("Erreur de connexion :", e);
            btn.disabled = false;
            btn.textContent = 'Se connecter';
            pwdInput.value = '';
            afficherErreur(e.code === 'auth/too-many-requests'
                ? "Trop de tentatives. Réessaie dans quelques minutes."
                : "E-mail ou mot de passe incorrect.");
        }
    };

    btn.addEventListener('click', soumettre);
    [emailInput, pwdInput].forEach(el => el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') soumettre();
    }));
    emailInput.focus();
}

function masquerEcranVerrouillage() {
    const lock = document.getElementById('site-lock-screen');
    if (lock) lock.remove();
}

// Couvre la page immédiatement, en attendant de savoir si une session existe
getLockScreen();

firebase.auth().onAuthStateChanged((user) => {
    currentAdminUser = user;
    isAdmin = !!user;
    domReady.then(() => {
        updateAdminUI();
        if (user) {
            masquerEcranVerrouillage();
            demarrerApp();
        } else {
            afficherFormulaireConnexion();
        }
    });
});


/* ============================================================
   8. MÉTÉO LOCALE (Open-Meteo)
   ============================================================ */
function initWeatherWidget() {
    const weatherCity = document.getElementById('weather-city');
    if (!weatherCity) return; // Uniquement sur index.html

    if (!navigator.geolocation) {
        weatherCity.innerText = "GPS non supporté";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
            const data = await response.json();

            document.getElementById('weather-temp').innerText = `${Math.round(data.current.temperature_2m)}°C`;
            document.getElementById('weather-wind').innerText = `${data.current.wind_speed_10m} km/h`;
            document.getElementById('weather-rain').innerText = `${data.current.precipitation} mm`;
            weatherCity.innerText = "Ma Position";
            document.getElementById('weather-desc').innerText = getWeatherDescription(data.current.weather_code);
            document.getElementById('weather-icon').innerText = getWeatherEmoji(data.current.weather_code);

            const forecastContainer = document.getElementById('weather-forecast');
            if (forecastContainer) {
                let forecastHTML = '';
                for (let i = 1; i <= 3; i++) {
                    const date = new Date(data.daily.time[i]).toLocaleDateString('fr-FR', { weekday: 'short' });
                    const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
                    const emoji = getWeatherEmoji(data.daily.weather_code[i]);
                    forecastHTML += `
                        <div class="text-center px-2">
                            <span class="block text-xs text-gray-400 capitalize">${date}</span>
                            <span class="text-lg">${emoji}</span>
                            <span class="block text-xs font-semibold text-gray-700 dark:text-gray-300">${maxTemp}°C</span>
                        </div>`;
                }
                forecastContainer.innerHTML = forecastHTML;
            }

        } catch (e) {
            console.error("Erreur météo", e);
            weatherCity.innerText = "Erreur météo";
        }
    }, () => {
        weatherCity.innerText = "GPS refusé";
    });
}

// Codes météo WMO (Open-Meteo)
function getWeatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️';
    if (code >= 95) return '⛈️';
    return '☁️';
}

function getWeatherDescription(code) {
    if (code === 0) return 'Grand soleil';
    if (code === 1 || code === 2) return 'Partiellement nuageux';
    if (code === 3) return 'Couvert';
    if (code === 45 || code === 48) return 'Brouillard';
    if (code >= 51 && code <= 57) return 'Bruine';
    if (code >= 61 && code <= 67) return 'Pluie';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Neige';
    if (code >= 80 && code <= 82) return 'Averses';
    if (code >= 95) return 'Orage';
    return 'Couvert';
}


/* ============================================================
   9. RACCOURCIS PARAMÉTRABLES (Firestore + CRUD + Drag & Drop)
   ============================================================ */
function initShortcutsGrid() {
    setupEditableGrid('shortcuts-grid', 'justin_shortcuts', [
        { id: '1', name: 'Google', url: 'https://www.google.com', logo: '' },
        { id: '2', name: 'GitHub', url: 'https://github.com', logo: '' }
    ]);

    setupEditableGrid('multimedia-grid', 'justin_multimedia_shortcuts', [
        { id: '1', name: 'YouTube', url: 'https://www.youtube.com', logo: '' },
        { id: '2', name: 'Netflix', url: 'https://www.netflix.com', logo: '' }
    ]);
}

function setupEditableGrid(containerId, docId, defaultItems) {
    const grid = document.getElementById(containerId);
    if (!grid) return; // Si la page n'a pas cette grille, on ignore

    // Écouteurs posés UNE SEULE FOIS sur la grille (délégation d'événements) :
    // plus de onclick="..." injectés dans le HTML.
    if (!grid.dataset.bound) {
        grid.dataset.bound = '1';

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || !grid.contains(btn)) return;
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.id;
            if (btn.dataset.action === 'edit') openEditShortcutModal(docId, id);
            else if (btn.dataset.action === 'delete') deleteShortcut(docId, id);
            else if (btn.dataset.action === 'add') openAddShortcutModal(docId);
        });

        // Les événements "error" des images ne remontent pas : on écoute en phase de capture
        grid.addEventListener('error', (e) => {
            const img = e.target;
            if (img.tagName === 'IMG' && !img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = ICONE_PAR_DEFAUT;
            }
        }, true);
    }

    // Écoute en temps réel de Firestore
    db.collection("dashboards").doc(docId).onSnapshot((docSnap) => {
        let shortcuts = [];
        if (docSnap.exists && docSnap.data().items) {
            shortcuts = docSnap.data().items;
        } else {
            shortcuts = defaultItems;
        }

        // Génération du HTML des raccourcis existants
        let html = shortcuts.map(item => {
            const href = normaliserUrl(item.url) || '#';
            const logoSrc = item.logo
                ? item.logo
                : `https://www.google.com/s2/favicons?domain=${safeHostname(href)}&sz=128`;

            return `
                <div data-id="${escapeHtml(item.id)}" class="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing">

                    <!-- Boutons d'action (visibles au survol, réservés à l'admin) -->
                    <div class="admin-only absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity z-10">
                        <button data-action="edit" data-id="${escapeHtml(item.id)}" class="bg-blue-600 hover:bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Modifier">✏️</button>
                        <button data-action="delete" data-id="${escapeHtml(item.id)}" class="bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Supprimer">×</button>
                    </div>

                    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="flex flex-col items-center gap-2 w-full">
                        <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(item.name)}" class="w-10 h-10 object-contain rounded-lg">
                        <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">${escapeHtml(item.name)}</span>
                    </a>
                </div>
            `;
        }).join('');

        // Carte "+" pour créer un nouveau raccourci (admin uniquement)
        html += `
            <div data-action="add" class="admin-only bg-white/50 dark:bg-gray-900/50 border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer">
                <span class="text-xl text-gray-400 font-bold">+</span>
                <span class="text-[11px] font-medium text-gray-500">Ajouter</span>
            </div>
        `;

        grid.innerHTML = html;

        // Glisser-Déposer (SortableJS) : on détruit l'instance précédente avant d'en recréer une
        if (typeof Sortable !== 'undefined') {
            if (sortables[containerId]) sortables[containerId].destroy();
            sortables[containerId] = Sortable.create(grid, {
                animation: 150,
                draggable: '[data-id]',   // la carte "+" n'est pas déplaçable
                disabled: !isAdmin,
                onEnd: async function (evt) {
                    if (evt.oldIndex === evt.newIndex) return;
                    const newOrder = Array.from(grid.children)
                        .filter(el => el.hasAttribute('data-id'))
                        .map(el => shortcuts.find(s => s.id === el.getAttribute('data-id')))
                        .filter(Boolean);
                    try {
                        await db.collection("dashboards").doc(docId).set({ items: newOrder }, { merge: true });
                    } catch (e) {
                        console.error("Erreur de sauvegarde de l'ordre :", e);
                    }
                }
            });
        } else {
            console.warn("SortableJS non chargé : glisser-déposer indisponible.");
        }
    }, (error) => {
        console.error(`Erreur de synchronisation de la grille "${containerId}" (vérifier les règles Firestore) :`, error);
    });
}

// 9.1 MODALE D'AJOUT
function openAddShortcutModal(docId) {
    const existing = document.getElementById('shortcut-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shortcut-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white">Nouveau Raccourci</h3>
            <div class="flex flex-col gap-3">
                <input type="text" id="sh-name" placeholder="Nom (ex: Netflix)" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <input type="text" id="sh-url" placeholder="URL (ex: https://netflix.com)" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <input type="text" id="sh-logo" placeholder="URL du logo personnalisé (optionnel)" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
            </div>
            <div class="flex gap-2 mt-2">
                <button id="sh-cancel" class="flex-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 py-2 rounded-lg text-xs font-semibold transition-colors">Annuler</button>
                <button id="sh-save" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold transition-colors">Ajouter</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('sh-cancel').addEventListener('click', () => modal.remove());

    document.getElementById('sh-save').addEventListener('click', async () => {
        const name = document.getElementById('sh-name').value.trim();
        const url = normaliserUrl(document.getElementById('sh-url').value);
        const logoRaw = document.getElementById('sh-logo').value.trim();
        const logo = logoRaw ? normaliserUrl(logoRaw) : '';

        if (!name || !document.getElementById('sh-url').value.trim()) {
            alert("Veuillez remplir au moins le nom et l'URL.");
            return;
        }
        if (!url) {
            alert("URL invalide : seules les adresses http(s) sont acceptées.");
            return;
        }
        if (logoRaw && !logo) {
            alert("URL du logo invalide : seules les adresses http(s) sont acceptées.");
            return;
        }

        modal.remove();

        try {
            const docRef = db.collection("dashboards").doc(docId);
            const docSnap = await docRef.get();
            const items = docSnap.exists && docSnap.data().items ? docSnap.data().items : [];

            items.push({ id: Date.now().toString(), name, url, logo });

            await docRef.set({ items }, { merge: true });
        } catch (e) {
            console.error("Erreur lors de l'ajout :", e);
            alert("Erreur lors de l'ajout du raccourci (voir la console).");
        }
    });
}

// 9.2 MODALE D'ÉDITION (LOGO / NOM / URL)
async function openEditShortcutModal(docId, id) {
    const docRef = db.collection("dashboards").doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists || !docSnap.data().items) return;

    const items = docSnap.data().items;
    const item = items.find(s => s.id === id);
    if (!item) return;

    const existing = document.getElementById('shortcut-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shortcut-edit-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white">Modifier le raccourci</h3>
            <div class="flex flex-col gap-3">
                <input type="text" id="edit-sh-name" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <input type="text" id="edit-sh-url" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <input type="text" id="edit-sh-logo" placeholder="URL du logo personnalisé" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
            </div>
            <div class="flex gap-2 mt-2">
                <button id="edit-sh-cancel" class="flex-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 py-2 rounded-lg text-xs font-semibold transition-colors">Annuler</button>
                <button id="edit-sh-save" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold transition-colors">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('edit-sh-cancel').addEventListener('click', () => modal.remove());

    // .value (et non innerHTML) : pas besoin d'échapper
    document.getElementById('edit-sh-name').value = item.name;
    document.getElementById('edit-sh-url').value = item.url;
    document.getElementById('edit-sh-logo').value = item.logo || '';

    document.getElementById('edit-sh-save').addEventListener('click', async () => {
        const name = document.getElementById('edit-sh-name').value.trim();
        const urlRaw = document.getElementById('edit-sh-url').value.trim();
        const url = normaliserUrl(urlRaw);
        const logoRaw = document.getElementById('edit-sh-logo').value.trim();
        const logo = logoRaw ? normaliserUrl(logoRaw) : '';

        if (!name || !urlRaw) {
            alert("Le nom et l'URL ne peuvent pas être vides.");
            return;
        }
        if (!url) {
            alert("URL invalide : seules les adresses http(s) sont acceptées.");
            return;
        }
        if (logoRaw && !logo) {
            alert("URL du logo invalide : seules les adresses http(s) sont acceptées.");
            return;
        }

        modal.remove();

        try {
            item.name = name;
            item.url = url;
            item.logo = logo;
            await docRef.set({ items }, { merge: true });
        } catch (e) {
            console.error("Erreur lors de la modification :", e);
            alert("Erreur lors de la modification du raccourci (voir la console).");
        }
    });
}

// 9.3 SUPPRESSION D'UN RACCOURCI
async function deleteShortcut(docId, id) {
    if (!confirm("Voulez-vous supprimer ce raccourci ?")) return;
    try {
        const docRef = db.collection("dashboards").doc(docId);
        const docSnap = await docRef.get();
        if (docSnap.exists && docSnap.data().items) {
            const items = docSnap.data().items.filter(item => item.id !== id);
            await docRef.set({ items }, { merge: true });
        }
    } catch (e) {
        console.error("Erreur lors de la suppression :", e);
        alert("Erreur lors de la suppression du raccourci (voir la console).");
    }
}


/* ============================================================
   10. DÉMARRAGE DE L'APPLICATION (une seule fois, après connexion)
   ============================================================ */
async function demarrerApp() {
    if (appStarted) return;
    appStarted = true;

    await headerReady;      // le header (banderole, bouton compte) doit être en place
    updateAdminUI();

    // Fonctions communes, appelées explicitement (plus de détection "init...")
    runSafe(demarrerSynchroBanderole);
    runSafe(initWeatherWidget);
    runSafe(initShortcutsGrid);

    // Fonctions propres à une page (justgo.js, home-bg.js) via onAppReady()
    appReadyCallbacks.splice(0).forEach(runSafe);
}
