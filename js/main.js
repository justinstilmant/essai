/* =================================================================ato
   1. INITIALISATION & CONFIGURATION FIREBASE
   ================================================================ */
const firebaseConfig = { 
    apiKey: "AIzaSyC...", 
    authDomain: "page-tesla.firebaseapp.com", 
    projectId: "page-tesla", 
    storageBucket: "page-tesla.appspot.com", 
    messagingSenderId: "1234567890", 
    appId: "1:1234567890:web:abc123def456" 
};

if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}

const db = firebase.firestore();

// Authentification anonyme sécurisée pour Firestore
firebase.auth().signInAnonymously()
  .then(() => {
    console.log("Connecté de manière sécurisée et transparente à Firebase !");
  })
  .catch((error) => {
    console.error("Erreur d'authentification Firebase :", error);
  });

let isAdmin = false;


/* =================================================================
   2. CHARGEMENT DES TEMPLATES (HEADER / FOOTER)
   ================================================================ */
document.addEventListener("DOMContentLoaded", function() {
    function loadHTML(id, filename) {
        fetch(filename)
            .then(response => response.text())
            .then(data => {
                document.getElementById(id).innerHTML = data;
                
                if (id === 'header-placeholder') {
                    initHeaderFeatures();
                    
                    // Détection automatique de la page active
                    const currentPath = window.location.pathname.split("/").pop() || "index.html";
                    const navLinks = document.querySelectorAll("header nav a");
                    
                    navLinks.forEach(link => {
                        const linkHref = link.getAttribute("href");
                        if (linkHref === currentPath) {
                            link.className = "px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white shadow";
                        } else {
                            link.className = "px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg";
                        }
                    });
                }
            });
    }

    loadHTML('header-placeholder', 'includes/header.html');
    loadHTML('footer-placeholder', 'includes/footer.html');
});


/* =================================================================
   3. GESTION DU MODE SOMBRE / CLAIR
   ================================================================ */
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


/* =================================================================
   4. FONCTIONNALITÉS DU HEADER (Horloge & Banderole Firestore)
   ================================================================ */
function initHeaderFeatures() {
    // Horloge en direct
    function updateLiveClock() {
        const clockEl = document.getElementById('live-clock');
        if (clockEl) clockEl.innerText = new Date().toLocaleTimeString('fr-FR');
    }
    setInterval(updateLiveClock, 1000);
    updateLiveClock();

    // Synchro temps réel de la banderole via Firestore
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

// Rendu de la banderole
function applyBanner(text, color, size, effect, speed) {
    const display = document.getElementById('banner-text-display');
    if (!display) return;
    
    const safeText = text || 'Bienvenue Justin !';
    display.innerHTML = `${safeText}     •    `.repeat(6);
    
    display.classList.remove('text-rainbow', 'neon-glow');
    display.className = `animate-marquee font-medium inline-block ${size || 'text-base'}`;
    
    if (effect === 'rainbow') {
        display.classList.add('text-rainbow');
        display.style.color = '';
        display.style.removeProperty('color');
    } else if (effect === 'neon') {
        display.classList.add('neon-glow');
        display.style.setProperty('color', color || '#60a5fa', 'important');
    } else {
        display.style.removeProperty('color');
        display.style.color = color || '#60a5fa';
    }

    if (speed) {
        display.style.animationDuration = speed;
    }
}

// Gestion des modales de la banderole
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


/* =================================================================
   5. SÉCURITÉ ADMIN
   ================================================================ */
function ouvrirAuthModal() { 
    document.getElementById('auth-modal').classList.remove('hidden'); 
}

function fermerAuthModal() { 
    document.getElementById('auth-modal').classList.add('hidden'); 
    document.getElementById('admin-password').value = ''; 
}

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


/* =================================================================
   6. MÉTÉO LOCALE (Open-Meteo)
   ================================================================ */
function initWeatherWidget() {
    const weatherCity = document.getElementById('weather-city');
    if (!weatherCity) return;

    if (!navigator.geolocation) {
        weatherCity.innerText = "GPS non supporté";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=\({lat}&longitude=\){lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
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
${date}
${emoji}
${maxTemp}°C

`;
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

/* =================================================================
7. RACCOURCIS PARAMÉTRIQUES (Firestore + CRUD + Drag&Drop)
================================================================ */
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

    let html = shortcuts.map(item => {
        const logoSrc = item.logo ? item.logo : `https://www.google.com/s2/favicons?domain=${safeHostname(item.url)}&sz=128`;

        return `
✏️
×

[

${item.name}
](${item.url})

`;
}).join('');

html += `

Ajouter

    `;

    grid.innerHTML = html;

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

// Modale d'ajout
function openAddShortcutModal(docId) {
let modal = document.getElementById('shortcut-modal');
if (!modal) {
modal = document.createElement('div');
modal.id = 'shortcut-modal';
modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
modal.innerHTML = `

Nouveau Raccourci
Annuler
Ajouter

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
    } catch (e) {
        console.error("Erreur lors de l'ajout :", e);
    }
});
}

// Modale d'édition
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
Modifier le raccourci
Annuler
Enregistrer

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
    } catch (e) {
        console.error("Erreur lors de la modification :", e);
    }
});
}

// Suppression d'un raccourci
async function deleteShortcut(docId, id) {
if (!confirm("Voulez-vous supprimer ce raccourci ?")) return;
try {
const docRef = db.collection("dashboards").doc(docId);
const docSnap = await docRef.get();
if (docSnap.exists && docSnap.data().items) {
let items = docSnap.data().items.filter(item => item.id !== id);
await docRef.set({ items: items }, { merge: true });
}
} catch (e) {
console.error("Erreur lors de la suppression :", e);
}
}

/* =================================================================
8. SÉCURITÉ DE VERROUILLAGE & LANCEMENT AUTOMATIQUE
================================================================ */
document.addEventListener("DOMContentLoaded", () => {
if (sessionStorage.getItem('site_unlocked') !== 'true') {
const lockScreen = document.createElement('div');
lockScreen.id = 'site-lock-screen';
lockScreen.className = 'fixed inset-0 z-50 bg-gray-950 flex items-center justify-center p-4';
lockScreen.innerHTML = `

🔒

Accès Protégé
Entrez le mot de passe pour accéder à votre tableau de bord.

Déverrouiller

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
windowfuncName;
} catch (e) {
console.error(Erreur dans ${funcName}:, e);
}
}
}
}
