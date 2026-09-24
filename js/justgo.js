// --- VARIABLES GLOBALES GPS ---
let currentMap = null;
let currentCoords = null;
let routeLayer = null;
let isMuted = false;
let lastSpeedCheck = 0;

document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setupAudioToggle();
});

// --- 1. INITIALISATION DE LA CARTE ---
function initMap() {
    // Position par défaut (Bruxelles) en attendant le GPS
    currentMap = L.map('map', { zoomControl: false }).setView([50.8503, 4.3517], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(currentMap);

    // Suivi de la position GPS en temps réel
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const speedMs = position.coords.speed || 0;
                const speedKmh = Math.round(speedMs * 3.6);

                currentCoords = { lat, lon };

                // Mise à jour de l'affichage de la vitesse
                document.getElementById('current-speed').innerText = speedKmh;

                // Centrer la carte sur la position actuelle
                currentMap.setView([lat, lon], currentMap.getZoom());

                // Vérification de la signalisation routière (vitesse limite OSM)
                verifierSignalisationRoute(lat, lon);
            },
            (error) => {
                console.warn("Erreur de géolocalisation GPS", error);
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
        );
    }
}

// --- 2. SYNTHÈSE VOCALE ---
function falar(text) { // Compatibilité alias
    parler(text);
}

function parler(text) {
    if (isMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop la parole précédente
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

function setupAudioToggle() {
    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
        btnMute.addEventListener('click', () => {
            isMuted = !isMuted;
            btnMute.innerText = isMuted ? '🔇' : '🔊';
            parler(isMuted ? "Guidage vocal désactivé" : "Guidage vocal activé");
        });
    }

    const btnStop = document.getElementById('btn-stop');
    if (btnStop) {
        btnStop.addEventListener('click', () => {
            if (routeLayer) currentMap.removeLayer(routeLayer);
            document.getElementById('info-route').innerText = "Itinéraire arrêté";
            parler("Navigation annulée");
        });
    }
}

// --- 3. RECHERCHE DE DESTINATION ---
async function rechercherDestination() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    parler(`Recherche de ${query}`);

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data && data.length > 0) {
            const destLat = parseFloat(data[0].lat);
            const destLon = parseFloat(data[0].lon);
            const displayName = data[0].display_name.split(',')[0];

            naviguerVers(displayName, destLat, destLon);
        } else {
            alert("Destination introuvable.");
            parler("Destination introuvable");
        }
    } catch (e) {
        console.error("Erreur de recherche d'adresse", e);
    }
}

// --- 4. CALCUL D'ITINÉRAIRE (OSRM) ---
async function naviguerVers(nomDestination, destLat, destLon) {
    if (!currentCoords) {
        alert("Position GPS non fixée...");
        return;
    }

    parler(`Calcul de l'itinéraire vers ${nomDestination}`);
    document.getElementById('info-route').innerText = `Calcul vers ${nomDestination}...`;

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${currentCoords.lon},${currentCoords.lat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true&lang=fr`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const dureeMin = Math.round(route.duration / 60);

            document.getElementById('info-route').innerText = `${distanceKm} km (${dureeMin} min)`;
            parler(`Itinéraire trouvé. ${distanceKm} kilomètres, environ ${dureeMin} minutes.`);

            if (route.legs && route.legs[0].steps && route.legs[0].steps.length > 0) {
                const premiereInstruction = route.legs[0].steps[0].maneuver.instruction;
                if (premiereInstruction) {
                    setTimeout(() => parler(premiereInstruction), 2000);
                }
            }

            if (routeLayer) currentMap.removeLayer(routeLayer);
            
            const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            routeLayer = L.polyline(coordinates, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(currentMap);
            currentMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }
    } catch (e) {
        console.error("Erreur OSRM", e);
        document.getElementById('info-route').innerText = "Erreur de calcul";
    }
}

// --- 5. SIGNALÉTIQUE ROUTIÈRE (Vitesse Limite OSM) ---
async function verifierSignalisationRoute(lat, lon) {
    const now = Date.now();
    if (now - lastSpeedCheck < 15000) return; // Vérif toutes les 15s
    lastSpeedCheck = now;

    try {
        const radius = 25;
        const query = `[out:json];way(around:${radius},${lat},${lon})[maxspeed];out;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

        const response = await fetch(url);
        const data = await response.json();

        const signElement = document.getElementById('speed-limit-sign');
        const valueElement = document.getElementById('speed-limit-value');

        if (data.elements && data.elements.length > 0) {
            for (const el of data.elements) {
                if (el.tags && el.tags.maxspeed) {
                    valueElement.innerText = el.tags.maxspeed;
                    signElement.classList.remove('hidden');
                    signElement.classList.add('flex');
                    return;
                }
            }
        }
        signElement.classList.add('hidden');
        signElement.classList.remove('flex');
    } catch (e) {
        console.warn("Erreur signalétique", e);
    }
}

// --- 6. GESTION CENTRALISÉE DES CLÉS API ---
function getApiKey(serviceName) {
    return localStorage.getItem(`api_key_${serviceName}`) || '';
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
                    <button onclick="document.getElementById('api-modal').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold">×</button>
                </div>
                
                <p class="text-[11px] text-gray-500 dark:text-gray-400">
                    Ces clés sont stockées localement dans votre navigateur et alimentent les services avancés du tableau de bord.
                </p>

                <div class="flex flex-col gap-3 text-xs">
                    <!-- TomTom -->
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">TomTom (Trafic en temps réel)</label>
                        <input type="password" id="key-tomtom" placeholder="Collez votre clé TomTom ici" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                    </div>

                    <!-- OpenWeather -->
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">OpenWeather (Météo optionnelle)</label>
                        <input type="password" id="key-openweather" placeholder="Collez votre clé OpenWeather ici" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                    </div>

                    <!-- Mapbox -->
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">Mapbox (Styles de carte optionnels)</label>
                        <input type="password" id="key-mapbox" placeholder="Collez votre clé Mapbox ici" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                    </div>
                </div>

                <div class="flex gap-2 mt-2">
                    <button onclick="document.getElementById('api-modal').remove()" class="flex-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 py-2 rounded-lg text-xs font-semibold transition-colors">Annuler</button>
                    <button onclick="saveApiKeys()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold transition-colors">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }

    // Charger les clés existantes
    document.getElementById('key-tomtom').value = getApiKey('tomtom');
    document.getElementById('key-openweather').value = getApiKey('openweather');
    document.getElementById('key-mapbox').value = getApiKey('mapbox');
}

function saveApiKeys() {
    localStorage.setItem('api_key_tomtom', document.getElementById('key-tomtom').value.trim());
    localStorage.setItem('api_key_openweather', document.getElementById('key-openweather').value.trim());
    localStorage.setItem('api_key_mapbox', document.getElementById('key-mapbox').value.trim());

    document.getElementById('api-modal').remove();
    alert("Clés API enregistrées avec succès dans le navigateur !");
}
// --- GESTION DES FAVORIS (Domicile / Travail) ---

// Configurer l'adresse d'un favori via une invite simple ou une recherche
async function configurerFavori(type) {
    const adresseSaisie = prompt(`Entrez l'adresse pour ${type === 'domicile' ? 'le Domicile' : 'le Travail'} :`);
    if (!adresseSaisie) return;

    try {
        // Recherche des coordonnées via Nominatim (OSM)
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresseSaisie)}`);
        const data = await res.json();

        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            const nomCourt = data[0].display_name.split(',')[0];

            // Sauvegarde dans le localStorage
            localStorage.setItem(`fav_${type}_name`, nomCourt);
            localStorage.setItem(`fav_${type}_lat`, lat);
            localStorage.setItem(`fav_${type}_lon`, lon);

            mettreAJourAffichageFavoris();
            alert(`${type === 'domicile' ? 'Domicile' : 'Travail'} enregistré avec succès : ${nomCourt}`);
        } else {
            alert("Adresse introuvable par le GPS.");
        }
    } catch (e) {
        console.error("Erreur configuration favori", e);
    }
}

// Naviguer vers le favori enregistré
function naviguerVersFavori(type) {
    const name = localStorage.getItem(`fav_${type}_name`);
    const lat = parseFloat(localStorage.getItem(`fav_${type}_lat`));
    const lon = parseFloat(localStorage.getItem(`fav_${type}_lon`));

    if (!name || isNaN(lat) || isNaN(lon)) {
        // S'il n'est pas configuré, on invite l'utilisateur à le faire directement
        configurerFavori(type);
        return;
    }

    naviguerVers(name, lat, lon);
}

// Mettre à jour le texte des boutons au chargement de la page
function mettreAJourAffichageFavoris() {
    const domName = localStorage.getItem('fav_domicile_name');
    if (domName) {
        const el = document.getElementById('label-domicile');
        if (el) el.innerText = domName;
    }

    const travName = localStorage.getItem('fav_travail_name');
    if (travName) {
        const el = document.getElementById('label-travail');
        if (el) el.innerText = travName;
    }
}

// Lancer la mise à jour des libellés au démarrage dans le DOMContentLoaded ou directement
document.addEventListener("DOMContentLoaded", () => {
    mettreAJourAffichageFavoris();
});
