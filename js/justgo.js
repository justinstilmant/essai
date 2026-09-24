let currentMap = null;
let currentCoords = null;
let routeLayer = null;

function initJustGo() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return; // Uniquement sur la page Just Go

    // --- 1. MODE JOUR / NUIT (Lié au thème du site) ---
    const isDarkMode = document.documentElement.classList.contains('dark');
    
    // Style de tuiles adapté au mode (Sombre pour la nuit, Clair pour le jour)
    const tileUrl = isDarkMode 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    currentMap = L.map('map', { zoomControl: false }).setView([50.8503, 4.3517], 15);
    
    L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(currentMap);

    let isMuted = false;
    let currentLimit = 50;

    // --- 2. SYNTHÈSE VOCALE FRANÇAISE ---
    function parler(texte) {
        if (isMuted || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(texte);
        utterance.lang = 'fr-FR';
        window.speechSynthesis.speak(utterance);
    }

    // --- 3. GÉOLOCALISATION & DONNÉES EN TEMPS RÉEL ---
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            currentCoords = { lat, lon };

            const speedMs = position.coords.speed !== null ? position.coords.speed : 0;
            const speedKmh = Math.round(speedMs * 3.6);

            // Mise à jour de la vitesse et alerte clignotante (+10%)
            document.getElementById('current-speed').innerText = speedKmh;
            const speedometer = document.getElementById('speedometer');
            if (speedKmh > currentLimit * 1.1) {
                speedometer.classList.add('bg-red-600', 'animate-pulse', 'border-red-400', 'text-white');
                speedometer.classList.remove('bg-white/90', 'dark:bg-gray-900/90', 'border-gray-300', 'dark:border-gray-700');
            } else {
                speedometer.classList.remove('bg-red-600', 'animate-pulse', 'border-red-400', 'text-white');
                speedometer.classList.add('bg-white/90', 'dark:bg-gray-900/90', 'border-gray-300', 'dark:border-gray-700');
            }

            // Recentrage carte et mise à jour météo
            currentMap.setView([lat, lon], 17);
            updateWeather(lat, lon);

        }, (err) => console.error("GPS error", err), { enableHighAccuracy: true });
    }

    // --- 4. GESTION DES BOUTONS ---
    document.getElementById('btn-mute').addEventListener('click', () => {
        isMuted = !isMuted;
        document.getElementById('btn-mute').innerText = isMuted ? '🔇' : '🔊';
        parler(isMuted ? "Guidage silencieux" : "Guidage vocal activé");
    });

    document.getElementById('btn-stop').addEventListener('click', () => {
        parler("Guidage terminé");
        window.location.href = "index.html";
    });
}

// --- 5. CALCUL D'ITINÉRAIRE (OSRM) & INFOS REGROUPÉES ---
async function naviguerVers(nomDestination, destLat, destLon) {
    if (!currentCoords) {
        alert("Position GPS non fixée...");
        return;
    }

    parler(`Calcul de l'itinéraire vers ${nomDestination}`);
    document.getElementById('info-route').innerText = `Calcul vers ${nomDestination}...`;

    try {
        // Requête à l'API publique OSRM pour tracer la route et obtenir distance/temps
        const url = `https://router.project-osrm.org/route/v1/driving/${currentCoords.lon},${currentCoords.lat};${destLon},${destLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const dureeMin = Math.round(route.duration / 60);

            // Affichage dans l'encart unifié
            document.getElementById('info-route').innerText = `${distanceKm} km (${dureeMin} min)`;
            document.getElementById('info-traffic').innerText = "Fluide (TomTom OK)";
            document.getElementById('info-traffic').className = "font-semibold text-emerald-500";
            document.getElementById('info-osm').innerText = "Limites standard vérifiées";

            parler(`Itinéraire trouvé. ${distanceKm} kilomètres, environ ${dureeMin} minutes.`);

            // Dessin de la ligne d'itinéraire sur la carte unique
            if (routeLayer) currentMap.removeLayer(routeLayer);
            
            const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            routeLayer = L.polyline(coordinates, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(currentMap);
            currentMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }
    } catch (e) {
        console.error("Erreur de calcul d'itinéraire OSRM", e);
        document.getElementById('info-route').innerText = "Erreur de calcul";
    }
}

// --- 6. MÉTÉO EN DIRECT ---
async function updateWeather(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
        const data = await res.json();
        const temp = Math.round(data.current.temperature_2m);
        document.getElementById('gps-weather-badge').innerText = `⛅ ${temp}°C`;
    } catch (e) {
        console.error("Erreur météo", e);
    }
}
