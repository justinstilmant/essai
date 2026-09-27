// ==========================================
// 1. INITIALISATION DE FIREBASE & AUTHENTIFICATION
// ==========================================
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

// Connexion anonyme sécurisée pour Firestore
firebase.auth().signInAnonymously()
  .then(() => {
    console.log("Connecté de manière sécurisée et transparente à Firebase !");
  })
  .catch((error) => {
    console.error("Erreur d'authentification Firebase :", error);
  });

let isAdmin = false;

// ==========================================
// 2. CHARGEMENT DES TEMPLATES & HEADER/FOOTER
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    function loadHTML(id, filename) {
        fetch(filename)
            .then(response => response.text())
            .then(data => {
                document.getElementById(id).innerHTML = data;
                
                if (id === 'header-placeholder') {
                    initHeaderFeatures();
                    
                    // Détection automatique de la page active dans la navigation
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

// ==========================================
// 3. GESTION DU MODE SOMBRE / CLAIR
// ==========================================
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

// Application immédiate du thème enregistré
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
} else {
    document.documentElement.classList.add('dark');
}

// ==========================================
// 4. HEADER : HORLOGE & BANDEROLE FIRESTORE
// ==========================================
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

// Rendu graphique de la banderole
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

// Modales de configuration de la banderole
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

// ==========================================
// 5. SÉCURITÉ ADMIN & MODALE D'AUTHENTIFICATION
// ==========================================
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
// 6. MÉTÉO LOCALE (Open-Meteo)
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
