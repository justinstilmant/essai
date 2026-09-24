// Initialisation de Firebase (projet "page-tesla")
const firebaseConfig = { apiKey: "AIzaSyC...", authDomain: "page-tesla.firebaseapp.com", projectId: "page-tesla", storageBucket: "page-tesla.appspot.com", messagingSenderId: "1234567890", appId: "1:1234567890:web:abc123def456" };
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();

let isAdmin = false;

document.addEventListener("DOMContentLoaded", function() {
    function loadHTML(id, filename) {
        fetch(filename)
            .then(response => response.text())
            .then(data => {
                document.getElementById(id).innerHTML = data;
                
                if (id === 'header-placeholder') {
                    initHeaderFeatures();
                    
                    // --- ICI : Détection automatique de la page active ---
                    const currentPath = window.location.pathname.split("/").pop() || "index.html";
                    const navLinks = document.querySelectorAll("header nav a");
                    
                    navLinks.forEach(link => {
                        const linkHref = link.getAttribute("href");
                        if (linkHref === currentPath) {
                            // Style pour le lien actif (ex: fond bleu, texte blanc)
                            link.className = "px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white shadow";
                        } else {
                            // Style pour les liens inactifs
                            link.className = "px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg";
                        }
                    });
                }
            });
    }

    loadHTML('header-placeholder', 'includes/header.html');
    loadHTML('footer-placeholder', 'includes/footer.html');
});

// 2. Gestion du mode Sombre / Clair[cite: 1]
function toggleDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('theme-icon');
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        if (icon) icon.innerText = '🌙';
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        if (icon) icon.innerText = '☀️';
    }
}

// Application du thème enregistré dès le chargement
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
} else {
    document.documentElement.classList.add('dark');
}

// 3. Fonctionnalités propres au Header (Horloge & Firestore Banderole)[cite: 1]
function initHeaderFeatures() {
    // Horloge en direct
    function updateLiveClock() {
        const clockEl = document.getElementById('live-clock');
        if (clockEl) clockEl.innerText = new Date().toLocaleTimeString('fr-FR');
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    // Synchro temps réel de la banderole via Firestore[cite: 1]
    db.collection("dashboards").doc("justin_config").onSnapshot((docSnap) => {
        if (docSnap.exists) {
            const data = docSnap.data();
            if (data.bannerText !== undefined) {
                applyBanner(data.bannerText, data.bannerColor, data.bannerSize, data.bannerEffect, data.bannerSpeed);
            }
        } else {
            applyBanner('Bienvenue Justin !', '#60a5fa', 'text-base', 'normal', '18s');
        }
    });
}

// Rendu de la banderole[cite: 1]
function applyBanner(text, color, size, effect, speed) {
    const display = document.getElementById('banner-text-display');
    if (!display) return;
    
    const safeText = text || 'Bienvenue Justin !';
    display.innerHTML = `<span>${safeText} &nbsp;&nbsp;&nbsp;&nbsp;&bull;&nbsp;&nbsp;&nbsp;&nbsp;</span>`.repeat(6);
    
    // 1. On nettoie les classes d'effets précédentes
    display.classList.remove('text-rainbow', 'neon-glow');
    
    // 2. On applique la base (taille et animation)
    display.className = `animate-marquee font-medium inline-block ${size || 'text-base'}`;
    
    // 3. Gestion spécifique des effets
    if (effect === 'rainbow') {
        display.classList.add('text-rainbow');
        display.style.color = ''; // Nécessaire pour que le gradient s'affiche
        display.style.removeProperty('color');
    } else if (effect === 'neon') {
        display.classList.add('neon-glow');
        // On force explicitement la couleur avec style.setProperty pour contourner le mode sombre/Tailwind
        display.style.setProperty('color', color || '#60a5fa', 'important');
    } else {
        // Effet normal
        display.style.removeProperty('color');
        display.style.color = color || '#60a5fa';
    }

    // 4. Vitesse de défilement
    if (speed) {
        display.style.animationDuration = speed;
    }
}

// Gestion des modales de la banderole[cite: 1]
async function ouvrirModalBandole() {
    try {
        let docRef = db.collection("dashboards").doc("justin_config");
        let docSnap = await docRef.get();
        let data = docSnap.exists ? docSnap.data() : {};
        
        document.getElementById('config-banner-text').value = data.bannerText !== undefined ? data.bannerText : "Bienvenue Justin !";
        document.getElementById('config-banner-color').value = data.bannerColor || "#60a5fa";
        document.getElementById('config-banner-size').value = data.bannerSize || "text-base";
        document.getElementById('config-banner-effect').value = data.bannerEffect || "normal";
        document.getElementById('config-banner-speed').value = data.bannerSpeed || "18s";

        document.getElementById('banner-modal').classList.remove('hidden');
    } catch(e) {
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
        let docRef = db.collection("dashboards").doc("justin_config");
        await docRef.set({ bannerText, bannerColor, bannerSize, bannerEffect, bannerSpeed }, { merge: true });
        fermerModalBandole();
    } catch(e) {
        alert("Erreur d'enregistrement de la banderole.");
    }
}

// Gestion de la sécurité Admin[cite: 1]
function ouvrirAuthModal() { document.getElementById('auth-modal').classList.remove('hidden'); }
function fermerAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); document.getElementById('admin-password').value = ''; }

function verifierAdmin() {
    const pwd = document.getElementById('admin-password').value;
    if (pwd === "justin2026" || pwd === "admin") {
        isAdmin = true;
        fermerAuthModal();
        alert("Mode Admin activé !");
    } else {
        alert("Mot de passe incorrect.");
    }
}

// Lancement automatique au chargement
document.addEventListener("DOMContentLoaded", () => {
    initWeatherWidget(); // Uniquement sur index.html

    // Grille de l'accueil (index.html)
    initShortcutsGrid('shortcuts-grid', 'justin_shortcuts', [
        { id: '1', name: 'Google', url: 'https://www.google.com', logo: '' },
        { id: '2', name: 'GitHub', url: 'https://github.com', logo: '' }
    ]);

    // Grille de la page Multimédia (multimedia.html)
    initShortcutsGrid('multimedia-grid', 'justin_multimedia_shortcuts', [
        { id: '1', name: 'YouTube', url: 'https://www.youtube.com', logo: '' },
        { id: '2', name: 'Netflix', url: 'https://www.netflix.com', logo: '' }
    ]);
});

// ==========================================
// 1. MÉTÉO LOCALE (Open-Meteo)
// ==========================================
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

function getWeatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '⛅';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 95) return '⚡';
    return '☁️';
}

function getWeatherDescription(code) {
    if (code === 0) return 'Grand soleil';
    if (code >= 1 && code <= 3) return 'Partiellement nuageux';
    if (code >= 51 && code <= 67) return 'Pluies / Averses';
    return 'Couvert';
}

// ==========================================
// 2. RACCOURCIS PARAMÉTRIQUES (Firestore)
// ==========================================
// ==========================================
// RACCOURCIS PARAMÉTRIQUES (CRUD complet + Drag&Drop)
// ==========================================
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
    if (!grid) return;

    db.collection("dashboards").doc(docId).onSnapshot((docSnap) => {
        let shortcuts = [];
        if (docSnap.exists && docSnap.data().items) {
            shortcuts = docSnap.data().items;
        } else {
            shortcuts = defaultItems;
        }

        // Affichage des cartes de raccourcis existants
        let html = shortcuts.map(item => {
            const logoSrc = item.logo ? item.logo : `https://www.google.com/s2/favicons?domain=${safeHostname(item.url)}&sz=128`;

            return `
                <div data-id="${item.id}" class="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing">
                    
                    <!-- Boutons d'action (visibles au survol) -->
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity z-10">
                        <button onclick="openEditShortcutModal('${docId}', '${item.id}')" class="bg-blue-600 hover:bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Modifier le logo">✏️</button>
                        <button onclick="deleteShortcut('${docId}', '${item.id}')" class="bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Supprimer">×</button>
                    </div>
                    
                    <a href="${item.url}" target="_blank" class="flex flex-col items-center gap-2 w-full">
                        <img src="${logoSrc}" alt="${item.name}" class="w-10 h-10 object-contain rounded-lg" onerror="this.src='https://via.placeholder.com/40?text=?'">
                        <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">${item.name}</span>
                    </a>
                </div>
            `;
        }).join('');

        // Carte "+" pour ajouter
        html += `
            <div onclick="openAddShortcutModal('${docId}')" class="bg-white/50 dark:bg-gray-900/50 border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer">
                <span class="text-xl text-gray-400 font-bold">+</span>
                <span class="text-[11px] font-medium text-gray-500">Ajouter</span>
            </div>
        `;

        grid.innerHTML = html;

        if (typeof Sortable !== 'undefined') {
            Sortable.create(grid, {
                animation: 150,
                onEnd: function () {
                    const newOrder = Array.from(grid.children)
                        .filter(el => el.hasAttribute('data-id'))
                        .map(el => {
                            const id = el.getAttribute('data-id');
                            return shortcuts.find(s => s.id === id);
                        });
                    db.collection("dashboards").doc(docId).set({ items: newOrder }, { merge: true });
                }
            });
        }
    });
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch(e) { return ''; }
}

// Modal d'ajout
function openAddShortcutModal(docId) {
    let modal = document.getElementById('shortcut-modal');
    if (!modal) {
        modal = document.createElement('div');
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
    } else {
        modal.classList.remove('hidden');
        document.getElementById('sh-name').value = '';
        document.getElementById('sh-url').value = '';
        document.getElementById('sh-logo').value = '';
    }

    const saveBtn = document.getElementById('sh-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('sh-name').value.trim();
        let url = document.getElementById('sh-url').value.trim();
        let logo = document.getElementById('sh-logo').value.trim();

        if (!name || !url) {
            alert("Veuillez remplir au moins le nom et l'URL.");
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        modal.remove();

        const docRef = db.collection("dashboards").doc(docId);
        const docSnap = await docRef.get();
        let items = docSnap.exists && docSnap.data().items ? docSnap.data().items : [];

        items.push({
            id: Date.now().toString(),
            name: name,
            url: url,
            logo: logo
        });

        await docRef.set({ items: items }, { merge: true });
    });
}

// Modal de modification (notamment du logo)
async function openEditShortcutModal(docId, id) {
    const docRef = db.collection("dashboards").doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists || !docSnap.data().items) return;

    let items = docSnap.data().items;
    let item = items.find(s => s.id === id);
    if (!item) return;

    let modal = document.getElementById('shortcut-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
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
    } else {
        modal.classList.remove('hidden');
    }

    document.getElementById('edit-sh-name').value = item.name;
    document.getElementById('edit-sh-url').value = item.url;
    document.getElementById('edit-sh-logo').value = item.logo || '';

    const saveBtn = document.getElementById('edit-sh-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('edit-sh-name').value.trim();
        let url = document.getElementById('edit-sh-url').value.trim();
        let logo = document.getElementById('edit-sh-logo').value.trim();

        if (!name || !url) {
            alert("Le nom et l'URL ne peuvent pas être vides.");
            return;
        }

        modal.remove();

        item.name = name;
        item.url = url;
        item.logo = logo;

        await docRef.set({ items: items }, { merge: true });
    });
}

async function deleteShortcut(docId, id) {
    if (!confirm("Voulez-vous supprimer ce raccourci ?")) return;
    const docRef = db.collection("dashboards").doc(docId);
    const docSnap = await docRef.get();
    if (docSnap.exists && docSnap.data().items) {
        let items = docSnap.data().items.filter(item => item.id !== id);
        await docRef.set({ items: items }, { merge: true });
    }
}
// ==========================================
// 3. SÉCURITÉ & LANCEMENT AUTOMATIQUE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    if (sessionStorage.getItem('site_unlocked') !== 'true') {
        const lockScreen = document.createElement('div');
        lockScreen.id = 'site-lock-screen';
        lockScreen.className = 'fixed inset-0 z-50 bg-gray-950 flex items-center justify-center p-4';
        lockScreen.innerHTML = `
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 text-center">
                <div class="text-3xl">🔒</div>
                <h2 class="text-lg font-bold text-white">Accès Protégé</h2>
                <p class="text-xs text-gray-400">Entrez le mot de passe pour accéder à votre tableau de bord.</p>
                <input type="password" id="site-password-input" placeholder="Mot de passe..." class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                <button id="site-login-btn" class="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                    Déverrouiller
                </button>
            </div>
        `;
        document.body.appendChild(lockScreen);

        const submitPassword = () => {
            const pwd = document.getElementById('site-password-input').value;
            if (pwd === "justin2026") {
                sessionStorage.setItem('site_unlocked', 'true');
                lockScreen.remove();
                lancerToutesLesFonctions();
            } else {
                alert("Mot de passe incorrect !");
                document.getElementById('site-password-input').value = '';
            }
        };

        document.getElementById('site-login-btn').addEventListener('click', submitPassword);
        document.getElementById('site-password-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitPassword();
        });
        return;
    }

    lancerToutesLesFonctions();
});

// Détecte et lance automatiquement toutes les fonctions commençant par "init"
function lancerToutesLesFonctions() {
    for (let funcName in window) {
        if (funcName.startsWith('init') && typeof window[funcName] === 'function') {
            try {
                window[funcName]();
            } catch (e) {
                console.error(`Erreur dans ${funcName}:`, e);
            }
        }
    }
}
// ==========================================
// RACCOURCIS PARAMÉTRIQUES (Firestore + CRUD + Drag&Drop)
// ==========================================
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
            const logoSrc = item.logo ? item.logo : `https://www.google.com/s2/favicons?domain=${safeHostname(item.url)}&sz=128`;

            return `
                <div data-id="${item.id}" class="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing">
                    
                    <!-- Boutons d'action (visibles au survol) -->
                    <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity z-10">
                        <button onclick="openEditShortcutModal('${docId}', '${item.id}')" class="bg-blue-600 hover:bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Modifier">✏️</button>
                        <button onclick="deleteShortcut('${docId}', '${item.id}')" class="bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]" title="Supprimer">×</button>
                    </div>
                    
                    <a href="${item.url}" target="_blank" class="flex flex-col items-center gap-2 w-full">
                        <img src="${logoSrc}" alt="${item.name}" class="w-10 h-10 object-contain rounded-lg" onerror="this.src='https://via.placeholder.com/40?text=?'">
                        <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">${item.name}</span>
                    </a>
                </div>
            `;
        }).join('');

        // Ajout de la carte "+" pour créer un nouveau raccourci
        html += `
            <div onclick="openAddShortcutModal('${docId}')" class="bg-white/50 dark:bg-gray-900/50 border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer">
                <span class="text-xl text-gray-400 font-bold">+</span>
                <span class="text-[11px] font-medium text-gray-500">Ajouter</span>
            </div>
        `;

        grid.innerHTML = html;

        // Activation et enregistrement automatique du Glisser-Déposer (SortableJS)
        if (typeof Sortable !== 'undefined') {
            Sortable.create(grid, {
                animation: 150,
                onEnd: async function () {
                    const newOrder = Array.from(grid.children)
                        .filter(el => el.hasAttribute('data-id'))
                        .map(el => {
                            const id = el.getAttribute('data-id');
                            return shortcuts.find(s => s.id === id);
                        });
                    try {
                        await db.collection("dashboards").doc(docId).set({ items: newOrder }, { merge: true });
                        console.log("Ordre des raccourcis mis à jour dans Firestore !");
                    } catch (e) {
                        console.error("Erreur de sauvegarde de l'ordre :", e);
                    }
                }
            });
        }
    });
}

function safeHostname(url) {
    try { return new URL(url).hostname; } catch(e) { return ''; }
}

// 1. MODALE D'AJOUT
function openAddShortcutModal(docId) {
    let modal = document.getElementById('shortcut-modal');
    if (!modal) {
        modal = document.createElement('div');
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
    } else {
        modal.classList.remove('hidden');
        document.getElementById('sh-name').value = '';
        document.getElementById('sh-url').value = '';
        document.getElementById('sh-logo').value = '';
    }

    const saveBtn = document.getElementById('sh-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('sh-name').value.trim();
        let url = document.getElementById('sh-url').value.trim();
        let logo = document.getElementById('sh-logo').value.trim();

        if (!name || !url) {
            alert("Veuillez remplir au moins le nom et l'URL.");
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        modal.remove();

        try {
            const docRef = db.collection("dashboards").doc(docId);
            const docSnap = await docRef.get();
            let items = docSnap.exists && docSnap.data().items ? docSnap.data().items : [];

            items.push({
                id: Date.now().toString(),
                name: name,
                url: url,
                logo: logo
            });

            await docRef.set({ items: items }, { merge: true });
            console.log("Raccourci ajouté et enregistré dans Firestore !");
        } catch (e) {
            console.error("Erreur lors de l'ajout :", e);
        }
    });
}

// 2. MODALE D'ÉDITION (LOGO / NOM / URL)
async function openEditShortcutModal(docId, id) {
    const docRef = db.collection("dashboards").doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists || !docSnap.data().items) return;

    let items = docSnap.data().items;
    let item = items.find(s => s.id === id);
    if (!item) return;

    let modal = document.getElementById('shortcut-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
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
    } else {
        modal.classList.remove('hidden');
    }

    document.getElementById('edit-sh-name').value = item.name;
    document.getElementById('edit-sh-url').value = item.url;
    document.getElementById('edit-sh-logo').value = item.logo || '';

    const saveBtn = document.getElementById('edit-sh-save');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('edit-sh-name').value.trim();
        let url = document.getElementById('edit-sh-url').value.trim();
        let logo = document.getElementById('edit-sh-logo').value.trim();

        if (!name || !url) {
            alert("Le nom et l'URL ne peuvent pas être vides.");
            return;
        }

        modal.remove();

        try {
            item.name = name;
            item.url = url;
            item.logo = logo;

            await docRef.set({ items: items }, { merge: true });
            console.log("Modification enregistrée dans Firestore !");
        } catch (e) {
            console.error("Erreur lors de la modification :", e);
        }
    });
}

// 3. SUPPRESSION D'UN RACCOURCI
async function deleteShortcut(docId, id) {
    if (!confirm("Voulez-vous supprimer ce raccourci ?")) return;
    try {
        const docRef = db.collection("dashboards").doc(docId);
        const docSnap = await docRef.get();
        if (docSnap.exists && docSnap.data().items) {
            let items = docSnap.data().items.filter(item => item.id !== id);
            await docRef.set({ items: items }, { merge: true });
            console.log("Raccourci supprimé de Firestore !");
        }
    } catch (e) {
        console.error("Erreur lors de la suppression :", e);
    }
}
