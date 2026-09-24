document.addEventListener("DOMContentLoaded", () => {
    chargerParametresVisuels();
    verifierConfiguration();
    chargerBoutonsPersonnalises();
});

function chargerParametresVisuels() {
    const userName = localStorage.getItem('user_name') || 'Justin';
    const nameEl = document.getElementById('header-username');
    if (nameEl) nameEl.innerText = `Just Go - ${userName}`;

    const bannerText = localStorage.getItem('banner_text');
    const bannerBg = localStorage.getItem('banner_bg');
    const bannerColor = localStorage.getItem('banner_color');

    const bannerEl = document.getElementById('banner-text');
    const containerEl = document.getElementById('banner-container');

    if (bannerText && bannerEl) bannerEl.innerText = bannerText;
    if (containerEl) {
        if (bannerBg) containerEl.style.backgroundColor = bannerBg;
        if (bannerColor) containerEl.style.color = bannerColor;
    }
}

function verifierConfiguration() {
    const url = localStorage.getItem('ha_url');
    const token = localStorage.getItem('ha_token');
    const warning = document.getElementById('ha-warning');
    if (!url || !token) {
        if (warning) warning.classList.remove('hidden');
    } else {
        if (warning) warning.classList.add('hidden');
    }
}

// --- GESTION CONFIGURATION HA (MODAL) ---
function openHaConfigModal() {
    let modal = document.getElementById('ha-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'ha-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><span>⚙️</span> Configuration Home Assistant</h3>
                <button onclick="document.getElementById('ha-modal').remove()" class="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer">×</button>
            </div>
            <div class="flex flex-col gap-3 text-xs">
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">URL Tailscale Funnel</label>
                    <input type="text" id="input-ha-url" placeholder="https://votre-machine.ts.net" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                </div>
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">Jeton d'accès longue durée (Token)</label>
                    <input type="password" id="input-ha-token" placeholder="eyJhbGciOi..." class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                </div>
            </div>
            <div class="flex gap-2 mt-2">
                <button onclick="document.getElementById('ha-modal').remove()" class="flex-1 bg-gray-200 dark:bg-gray-800 py-2 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onclick="sauvegarderConfigHA()" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-semibold cursor-pointer">Enregistrer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('input-ha-url').value = localStorage.getItem('ha_url') || '';
    document.getElementById('input-ha-token').value = localStorage.getItem('ha_token') || '';
}

function sauvegarderConfigHA() {
    const url = document.getElementById('input-ha-url').value.trim().replace(/\/$/, '');
    const token = document.getElementById('input-ha-token').value.trim();
    localStorage.setItem('ha_url', url);
    localStorage.setItem('ha_token', token);
    document.getElementById('ha-modal').remove();
    verifierConfiguration();
    alert("Configuration enregistrée avec succès !");
}

// --- AJOUT DE BOUTONS AVEC RÉCUPÉRATION DES ENTITÉS ---
async function openAddButtonModal() {
    const haUrl = localStorage.getItem('ha_url');
    const haToken = localStorage.getItem('ha_token');

    let modal = document.getElementById('add-btn-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'add-btn-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><span>➕</span> Ajouter un widget de contrôle</h3>
                <button onclick="document.getElementById('add-btn-modal').remove()" class="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer">×</button>
            </div>
            <div class="flex flex-col gap-3 text-xs">
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">Nom / Titre du bouton</label>
                    <input type="text" id="widget-name" placeholder="Ex: Portail Entrée" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                </div>
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">Icône (Emoji)</label>
                    <input type="text" id="widget-icon" value="🚪" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                </div>
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">Sélectionner l'appareil (Home Assistant)</label>
                    <select id="widget-entity" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                        <option value="">Chargement des appareils...</option>
                    </select>
                </div>
                <div class="flex flex-col gap-1">
                    <label class="font-semibold text-gray-700 dark:text-gray-300">Type d'action</label>
                    <select id="widget-service" class="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none">
                        <option value="homeassistant/toggle">Basculer (Toggle On/Off)</option>
                        <option value="light/turn_on">Allumer (Lumière)</option>
                        <option value="light/turn_off">Éteindre (Lumière)</option>
                        <option value="cover/toggle">Ouvrir / Fermer (Portail/Volet)</option>
                    </select>
                </div>
            </div>
            <div class="flex gap-2 mt-2">
                <button onclick="document.getElementById('add-btn-modal').remove()" class="flex-1 bg-gray-200 dark:bg-gray-800 py-2 rounded-lg text-xs font-semibold cursor-pointer">Annuler</button>
                <button onclick="sauvegarderNouveauBouton()" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-semibold cursor-pointer">Créer le widget</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Charger dynamiquement les entités depuis l'API de Home Assistant
    if (haUrl && haToken) {
        try {
            const response = await fetch(`${haUrl}/api/states`, {
                headers: {
                    'Authorization': `Bearer ${haToken}`,
                    'Content-Type': 'application/json',
                }
            });
            if (response.ok) {
                const states = await response.json();
                const select = document.getElementById('widget-entity');
                select.innerHTML = '<option value="">-- Choisir un appareil --</option>';
                
                // On trie les entités par ordre alphabétique
                states.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

                states.forEach(entite => {
                    const opt = document.createElement('option');
                    opt.value = entite.entity_id;
                    // Affiche l'ID et le nom amical si disponible
                    const friendlyName = entite.attributes.friendly_name || entite.entity_id;
                    opt.textContent = `${friendlyName} (${entite.entity_id})`;
                    select.appendChild(opt);
                });
            } else {
                document.getElementById('widget-entity').innerHTML = '<option value="">Erreur de chargement des entités</option>';
            }
        } catch (e) {
            console.error("Impossible de joindre HA pour les entités", e);
            document.getElementById('widget-entity').innerHTML = '<option value="">Impossible de joindre Home Assistant</option>';
        }
    } else {
        document.getElementById('widget-entity').innerHTML = '<option value="">Veuillez d\'abord configurer votre token HA</option>';
    }
}

function sauvegarderNouveauBouton() {
    const name = document.getElementById('widget-name').value.trim();
    const icon = document.getElementById('widget-icon').value.trim() || '🏠';
    const entity = document.getElementById('widget-entity').value;
    const service = document.getElementById('widget-service').value;

    if (!name || !entity) {
        alert("Veuillez donner un nom et sélectionner une entité.");
        return;
    }

    let boutons = JSON.parse(localStorage.getItem('ha_custom_buttons') || '[]');
    boutons.push({ id: Date.now(), name, icon, entity, service });
    localStorage.setItem('ha_custom_buttons', JSON.stringify(boutons));

    document.getElementById('add-btn-modal').remove();
    chargerBoutonsPersonnalises();
}

function supprimerBouton(id) {
    if (!confirm("Voulez-vous supprimer ce widget ?")) return;
    let boutons = JSON.parse(localStorage.getItem('ha_custom_buttons') || '[]');
    boutons = boutons.filter(b => b.id !== id);
    localStorage.setItem('ha_custom_buttons', JSON.stringify(boutons));
    chargerBoutonsPersonnalises();
}

function chargerBoutonsPersonnalises() {
    const grid = document.getElementById('custom-devices-grid');
    if (!grid) return;

    let boutons = JSON.parse(localStorage.getItem('ha_custom_buttons') || '[]');
    
    if (boutons.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-10 text-center border border-dashed border-gray-300 dark:border-gray-800 rounded-2xl gap-3">
                <span class="text-3xl">🧩</span>
                <h3 class="text-xs font-bold text-gray-700 dark:text-gray-300">Aucun bouton configuré</h3>
                <p class="text-[11px] text-gray-500">Cliquez sur "➕ Ajouter un bouton" en haut pour piloter vos premiers équipements.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    boutons.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between gap-4 relative group';
        card.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="text-2xl">${b.icon}</span>
                <button onclick="supprimerBouton(${b.id})" class="text-gray-400 hover:text-red-500 text-xs font-bold cursor-pointer" title="Supprimer">×</button>
            </div>
            <div>
                <h3 class="text-sm font-bold text-gray-900 dark:text-white">${b.name}</h3>
                <p class="text-[10px] text-gray-500 font-mono">${b.entity}</p>
            </div>
            <div>
                <button onclick="executerAction('${b.entity}', '${b.service}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-semibold transition-colors shadow-md cursor-pointer">Action</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function executerAction(entityId, servicePath) {
    const haUrl = localStorage.getItem('ha_url');
    const haToken = localStorage.getItem('ha_token');

    if (!haUrl || !haToken) {
        alert("Veuillez d'abord configurer votre URL et votre Jeton dans le bouton ⚙️ Config HA.");
        openHaConfigModal();
        return;
    }

    try {
        const response = await fetch(`${haUrl}/api/services/${servicePath}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${haToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ entity_id: entityId })
        });

        if (response.ok) {
            console.log(`Action réussie pour ${entityId}`);
        } else {
            alert("Erreur: Home Assistant a refusé la commande.");
        }
    } catch (error) {
        console.error("Erreur réseau:", error);
        alert("Impossible de joindre Home Assistant via le Tailscale Funnel.");
    }
}
