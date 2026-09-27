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
    display.innerHTML = `${safeText}     •    `.repeat(6);
    
    // 1. On nettoie les classes d'effets précédentes
    display.classList.remove('text-rainbow', 'neon-glow');
    
    // 2. On applique la base (taille et animation)
    display.className = `animate-marquee font-medium inline-block ${size || 'text-base'}`;
    
    // 3. Gestion spécifique des effets
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

// ==========================================
// 1. MÉTÉO LOCALE (Open-Meteo)
// ==========================================
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
