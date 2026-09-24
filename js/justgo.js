// --- VARIABLES GLOBALES GPS ---
let currentMap = null;
let currentCoords = null;
let routeLayer = null;
let isMuted = false;
let lastSpeedCheck = 0;
let carMarker = null;

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        initMap();
    }, 100);

    setupAudioToggle();
    mettreAJourAffichageFavoris();
    chargerClesApiFirestore();
});

// --- 1. INITIALISATION DE LA CARTE & ROTATION DYNAMIQUE ---
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (currentMap) {
        currentMap.invalidateSize();
        return;
    }

    currentMap = L.map('map', { zoomControl: false }).setView([50.8503, 4.3517], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(currentMap);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const speedMs = position.coords.speed || 0;
                const speedKmh = Math.round(speedMs * 3.6);
                const heading = position.coords.heading !== null && !isNaN(position.coords.heading) ? position.coords.heading : 0;

                currentCoords = { lat, lon };

                const speedEl = document.getElementById('current-speed');
                if (speedEl) speedEl.innerText = speedKmh;

                updateCarPosition(lat, lon, heading);
                
                // Centrage sur la voiture
                currentMap.setView([lat, lon], currentMap.getZoom(), { animate: true });

                // --- ROTATION DE LA CARTE DANS LE SENS DE LA MARCHE ---
                // Fait tourner la carte pour que le haut de l'écran soit toujours vers l'avant
                const mapPane = currentMap.getPane('mapPane');
                if (mapPane) {
                    mapPane.style.transformOrigin = 'center center';
                    mapPane.style.transform = `rotate(${-heading}deg)`;
                    mapPane.style.transition = 'transform 0.3s ease-out';
                }

                // Fait pivoter l'icône de la voiture dans l'autre sens pour qu'elle pointe toujours vers le haut de l'écran
                if (carMarker) {
                    const iconElement = carMarker.getElement();
                    if (iconElement) {
                        const innerDiv = iconElement.querySelector('.car-rotate-container');
                        if (innerDiv) innerDiv.style.transform = `rotate(${heading}deg)`;
                    }
                }

                verifierSignalisationRoute(lat, lon);
            },
            (error) => {
                console.warn("Erreur de géolocalisation GPS", error);
            },
            { enableHighAccuracy: true, maximumAge: 500, timeout: 5000 }
        );
    }
}

function updateCarPosition(lat, lon, heading) {
    const carIcon = L.divIcon({
        className: 'custom-car-icon',
        html: `
            <div class="car-rotate-container" style="transform: rotate(${heading}deg); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.4));">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="#3b82f6" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                </svg>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    if (!carMarker) {
        carMarker = L.marker([lat, lon], { icon: carIcon }).addTo(currentMap);
    } else {
        carMarker.setLatLng([lat, lon]);
        carMarker.setIcon(carIcon);
    }
}

// --- 2. SYNTHÈSE VOCALE & AUDIO ---
function falar(text) { parler(text); }

function parler(text) {
    if (isMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
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
            const routeInfo = document.getElementById('info-route');
            if (routeInfo) routeInfo.innerText = "Itinéraire arrêté";
            parler("Navigation annulée");
        });
    }
}

// --- 3. RECHERCHE DE DESTINATION ---
async function rechercherDestination() {
    const input = document.getElementById('search-input');
    if (!input) return;
    const query = input.value.trim();
    if (!query) return;

    parler(`Recherche de ${query}`);

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data && data.length > 0) {
            naviguerVers(data[0].display_name.split(',')[0], parseFloat(data[0].lat), parseFloat(data[0].lon));
        } else {
            alert("Destination introuvable.");
            parler("Destination introuvable");
        }
    } catch (e) {
        console.error("Erreur de recherche", e);
    }
}

// --- 4. CALCUL D'ITINÉRAIRE (OSRM) ---
async function naviguerVers(nomDestination, destLat, destLon) {
    if (!currentCoords) {
        alert("Position GPS non fixée...");
        return;
    }

    parler(`Calcul vers ${nomDestination}`);
    const routeInfo = document.getElementById('info-route');
    if (routeInfo) routeInfo.innerText = `Calcul vers ${nomDestination}...`;

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${currentCoords.lon},${currentCoords.lat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true&lang=fr`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const dureeMin = Math.round(route.duration / 60);

            if (routeInfo) routeInfo.innerText = `${distanceKm} km (${dureeMin} min)`;
            parler(`Itinéraire trouvé. ${distanceKm} kilomètres, environ ${dureeMin} minutes.`);

            if (routeLayer) currentMap.removeLayer(routeLayer);
            routeLayer = L.polyline(route.geometry.coordinates.map(c => [c[1], c[0]]), { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(currentMap);
            currentMap.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
        }
    } catch (e) {
        console.error("Erreur OSRM", e);
    }
}

// --- 5. SIGNALÉTIQUE ROUTIÈRE ---
async function verifierSignalisationRoute(lat, lon) {
    const now = Date.now();
    if (now - lastSpeedCheck < 15000) return;
    lastSpeedCheck = now;

    try {
        const query = `[out:json];way(around:25,${lat},${lon})[maxspeed];out;`;
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await res.json();

        const signEl = document.getElementById('speed-limit-sign');
        const valEl = document.getElementById('speed-limit-value');

        if (data.elements && data.elements.length > 0) {
            for (const el of data.elements) {
                if (el.tags && el.tags.maxspeed) {
                    if (valEl) valEl.innerText = el.tags.maxspeed;
                    if (signEl) { signEl.classList.remove('hidden'); signEl.classList.add('flex'); }
                    return;
                }
            }
        }
        if (signEl) { signEl.classList.add('hidden'); signEl.classList.remove('flex'); }
    } catch (e) {
        console.warn("Erreur signalétique", e);
    }
}

// --- 6. GESTION DES CLÉS API (FIRESTORE + LOCALSTORAGE) & FAVORIS ---
function getApiKey(name) { 
    return localStorage.getItem(`api_key_${name}`) || ''; 
}

async function chargerClesApiFirestore() {
    try {
        if (typeof db === 'undefined') return;
        const docSnap = await db.collection("dashboards").doc("justin_api_keys").get();
        if (docSnap.exists) {
            const keys = docSnap.data();
            if (keys.tomtom) localStorage.setItem('api_key_tomtom', keys.tomtom);
            if (keys.openweather) localStorage.setItem('api_key_openweather', keys.openweather);
            if (keys.mapbox) localStorage.setItem('api_key_mapbox', keys.mapbox);
        }
    } catch (e) {
        console.warn("Chargement clés Firestore ignoré (mode local)", e);
    }
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
                    <button onclick="document.getElementById('api-modal').remove()" class="text-gray-400 hover:text-gray-600 text-sm font-bold">×</button>
                </div>
                <div class="flex flex-col gap-3 text-xs">
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">TomTom (Trafic)</label>
                        <input type="password" id="key-tomtom" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">OpenWeather (Météo)</label>
                        <input type="password" id="key-openweather" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="font-semibold text-gray-700 dark:text-gray-300">Mapbox (Cartes)</label>
                        <input type="password" id="key-mapbox" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button onclick="document.getElementById('api-modal').remove()" class="flex-1 bg-gray-200 dark:bg-gray-800 py-2 rounded-lg text-xs font-semibold">Annuler</button>
                    <button onclick="saveApiKeys()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold">Enregistrer (Cloud + Local)</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }
    document.getElementById('key-tomtom').value = getApiKey('tomtom');
    document.getElementById('key-openweather').value = getApiKey('openweather');
    document.getElementById('key-mapbox').value = getApiKey('mapbox');
}

async function saveApiKeys() {
    const tomtom = document.getElementById('key-tomtom').value.trim();
    const openweather = document.getElementById('key-openweather').value.trim();
    const mapbox = document.getElementById('key-mapbox').value.trim();

    // 1. Sauvegarde locale
    localStorage.setItem('api_key_tomtom', tomtom);
    localStorage.setItem('api_key_openweather', openweather);
    localStorage.setItem('api_key_mapbox', mapbox);

    // 2. Sauvegarde Cloud sur Firestore
    try {
        if (typeof db !== 'undefined') {
            await db.collection("dashboards").doc("justin_api_keys").set({
                tomtom: tomtom,
                openweather: openweather,
                mapbox: mapbox
            }, { merge: true });
            console.log("Clés API sauvegardées dans Firestore !");
        }
    } catch (e) {
        console.error("Erreur de sauvegarde Firestore des clés API", e);
    }

    document.getElementById('api-modal').remove();
    alert("Clés enregistrées et synchronisées !");
}

async function configurerFavori(type) {
    const adresse = prompt(`Entrez l'adresse pour ${type === 'domicile' ? 'le Domicile' : 'le Travail'} :`);
    if (!adresse) return;

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            localStorage.setItem(`fav_${type}_name`, data[0].display_name.split(',')[0]);
            localStorage.setItem(`fav_${type}_lat`, data[0].lat);
            localStorage.setItem(`fav_${type}_lon`, data[0].lon);
            mettreAJourAffichageFavoris();
            alert("Favori enregistré avec succès !");
        } else {
            alert("Adresse introuvable.");
        }
    } catch (e) {
        console.error("Erreur favori", e);
    }
}

function naviguerVersFavori(type) {
    const name = localStorage.getItem(`fav_${type}_name`);
    const lat = parseFloat(localStorage.getItem(`fav_${type}_lat`));
    const lon = parseFloat(localStorage.getItem(`fav_${type}_lon`));
    if (!name || isNaN(lat) || isNaN(lon)) {
        configurerFavori(type);
        return;
    }
    naviguerVers(name, lat, lon);
}

function mettreAJourAffichageFavoris() {
    const dom = localStorage.getItem('fav_domicile_name');
    if (dom) { const el = document.getElementById('label-domicile'); if (el) el.innerText = dom; }
    const trav = localStorage.getItem('fav_travail_name');
    if (trav) { const el = document.getElementById('label-travail'); if (el) el.innerText = trav; }
}
