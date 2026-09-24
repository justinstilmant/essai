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
// --- Raccourcis Paramétriques avec Firestore (Générique) ---
function initShortcutsGrid(containerId, docId, defaultItems) {
    const grid = document.getElementById(containerId);
    if (!grid) return; // Si la page n'a pas ce conteneur, on stoppe

    // Écoute en temps réel des raccourcis dans Firestore pour ce document spécifique
    db.collection("dashboards").doc(docId).onSnapshot((docSnap) => {
        let shortcuts = [];
        if (docSnap.exists && docSnap.data().items) {
            shortcuts = docSnap.data().items;
        } else {
            shortcuts = defaultItems;
        }

        grid.innerHTML = shortcuts.map(item => {
            const logoSrc = item.logo ? item.logo : `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=128`;

            return `
                <div data-id="${item.id}" class="group relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-md hover:border-blue-500 transition-all cursor-grab active:cursor-grabbing">
                    <a href="${item.url}" target="_blank" class="flex flex-col items-center gap-2 w-full">
                        <img src="${logoSrc}" alt="${item.name}" class="w-10 h-10 object-contain rounded-lg" onerror="this.src='https://via.placeholder.com/40?text=?'">
                        <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate w-full text-center">${item.name}</span>
                    </a>
                </div>
            `;
        }).join('');

        // Activation du Drag & Drop
        if (typeof Sortable !== 'undefined') {
            Sortable.create(grid, {
                animation: 150,
                onEnd: function () {
                    const newOrder = Array.from(grid.children).map(el => {
                        const id = el.getAttribute('data-id');
                        return shortcuts.find(s => s.id === id);
                    });
                    db.collection("dashboards").doc(docId).set({ items: newOrder }, { merge: true });
                }
            });
        }
    });
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
// LANCEMENT GLOBAL & SÉCURITÉ (DÉFINITIF)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Vérification du mot de passe
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
            if (pwd === "justin2026") { // Votre mot de passe
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
        return; // On bloque tout tant que c'est verrouillé
    }

    // Si déjà déverrouillé, on lance tout
    lancerToutesLesFonctions();
});

// Fonction magique qui détecte et lance toutes les fonctions "init..." du site toute seule
function lancerToutesLesFonctions() {
    for (let funcName in window) {
        // Dès qu'une fonction commence par "init" (ex: initWeatherWidget, initShortcutsGrid, etc.), on la lance !
        if (funcName.startsWith('init') && typeof window[funcName] === 'function') {
            try {
                window[funcName]();
            } catch (e) {
                console.error(`Erreur dans ${funcName}:`, e);
            }
        }
    }
}
