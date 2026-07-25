// =============================================
// SCRIPT.JS - NY ANTSIKA VOYAGES
// Recherche de trajets corrigée
// =============================================

const API_URL = window.location.origin + '/api';

let currentUser = null;
let currentToken = null;
let allTrajets = [];

// =============================================
// 1. AUTHENTIFICATION
// =============================================

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        updateUI();
        loadHistorique();
        if (currentUser.role === 'admin') {
            document.getElementById('adminNav')?.classList.remove('d-none');
            document.getElementById('admin')?.classList.remove('d-none');
            loadAdminStats();
        }
        return true;
    }
    return false;
}

function updateUI() {
    const authLinks = document.getElementById('authLinks');
    const userInfo = document.getElementById('userInfo');
    const userNameText = document.getElementById('userNameText');
    if (currentUser) {
        if (authLinks) authLinks.classList.add('d-none');
        if (userInfo) {
            userInfo.classList.remove('d-none');
            if (userNameText) userNameText.textContent = `${currentUser.prenom} ${currentUser.nom}`;
        }
    }
}

// =============================================
// 2. DÉCONNEXION
// =============================================

document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    currentToken = null;
    window.location.reload();
});

// =============================================
// 3. MODALES
// =============================================

document.getElementById('loginBtn')?.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('loginModal')).show();
});

document.getElementById('registerBtn')?.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('registerModal')).show();
});

document.getElementById('switchToRegister')?.addEventListener('click', (e) => {
    e.preventDefault();
    bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
    new bootstrap.Modal(document.getElementById('registerModal')).show();
});

document.getElementById('switchToLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    bootstrap.Modal.getInstance(document.getElementById('registerModal'))?.hide();
    new bootstrap.Modal(document.getElementById('loginModal')).show();
});

// =============================================
// 4. INSCRIPTION
// =============================================

document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        nom: document.getElementById('regNom').value.trim(),
        prenom: document.getElementById('regPrenom').value.trim(),
        email: document.getElementById('regEmail').value.trim(),
        telephone: document.getElementById('regTelephone').value.trim(),
        password: document.getElementById('regPassword').value
    };
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            alert('✅ Inscription réussie !');
            bootstrap.Modal.getInstance(document.getElementById('registerModal')).hide();
            document.getElementById('registerForm').reset();
            new bootstrap.Modal(document.getElementById('loginModal')).show();
        } else {
            document.getElementById('registerError').textContent = result.error || 'Erreur';
        }
    } catch (error) {
        document.getElementById('registerError').textContent = 'Erreur de connexion';
    }
});

// =============================================
// 5. CONNEXION
// =============================================

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
    };
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            currentToken = result.token;
            currentUser = result.user;
            bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
            document.getElementById('loginForm').reset();
            updateUI();
            loadTrajets();
            loadHistorique();
            if (currentUser.role === 'admin') {
                document.getElementById('adminNav')?.classList.remove('d-none');
                document.getElementById('admin')?.classList.remove('d-none');
                loadAdminStats();
            }
            alert('✅ Connexion réussie !');
        } else {
            document.getElementById('loginError').textContent = result.error || 'Identifiants incorrects';
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Erreur de connexion';
    }
});

// =============================================
// 6. TRAJETS ET VOYAGES DISPONIBLES (CORRIGÉ)
// =============================================

document.getElementById('searchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await searchTrajets();
});

async function searchTrajets() {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    const params = new URLSearchParams();
    const lieuDepart = document.getElementById('lieuDepart')?.value.trim();
    const lieuArrivee = document.getElementById('lieuArrivee')?.value.trim();
    const dateDepart = document.getElementById('dateDepart')?.value;
    const passagers = document.getElementById('passagers')?.value || 1;

    if (lieuDepart) params.append('lieu_depart', lieuDepart);
    if (lieuArrivee) params.append('lieu_arrivee', lieuArrivee);
    if (dateDepart) params.append('date_depart', dateDepart);
    if (passagers) params.append('passagers', passagers);

    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-warning" role="status"></div>
            <p class="mt-2 text-muted mb-0">Chargement des trajets disponibles...</p>
        </div>`;

    try {
        const response = await fetch(`${API_URL}/client/recherche?${params}`);

        if (!response.ok) {
            // Si l'endpoint recherche échoue, essayer la liste complète
            const fallback = await fetch(`${API_URL}/client/trajets`);
            if (!fallback.ok) {
                throw new Error('Impossible de charger les trajets (serveur inaccessible)');
            }
            const resultFb = await fallback.json();
            allTrajets = normalizeTrajets(resultFb);
            // Filtrage local si critères saisis
            allTrajets = filterTrajetsLocal(allTrajets, lieuDepart, lieuArrivee, dateDepart, passagers);
            displayResults(allTrajets);
            return;
        }

        const result = await response.json();
        allTrajets = normalizeTrajets(result);
        displayResults(allTrajets);

    } catch (error) {
        console.error('Erreur trajets:', error);
        container.innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="bi bi-exclamation-triangle me-2"></i>
                ${error.message || 'Erreur lors du chargement des trajets. Vérifiez que le serveur est démarré.'}
            </div>`;
    }
}

/** Normalise la réponse API (tableau direct ou { data: [...] }) */
function normalizeTrajets(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.trajets)) return result.trajets;
    return [];
}

/** Filtrage local (utilisé en fallback) */
function filterTrajetsLocal(trajets, lieuDepart, lieuArrivee, dateDepart, passagers) {
    return trajets.filter(t => {
        if (lieuDepart && !(t.lieu_depart || '').toLowerCase().includes(lieuDepart.toLowerCase())) return false;
        if (lieuArrivee && !(t.lieu_arrivee || '').toLowerCase().includes(lieuArrivee.toLowerCase())) return false;
        if (dateDepart && t.date_depart) {
            const d = new Date(t.date_depart).toISOString().split('T')[0];
            if (d !== dateDepart) return false;
        }
        if (passagers && (t.places_disponibles || 0) < parseInt(passagers)) return false;
        return true;
    });
}

function displayResults(trajets) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;

    if (!trajets || trajets.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center py-4">
                <i class="bi bi-inbox display-6 d-block"></i>
                <h5>Aucun trajet disponible</h5>
                <p class="mb-0">Aucun voyage ne correspond à vos critères pour le moment</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="mb-3">
            <span class="fw-bold">${trajets.length} trajet(s) / voyage(s) disponible(s)</span>
        </div>
        ${trajets.map(t => {
            const prix = Number(t.prix) || 0;
            const places = t.places_disponibles != null ? t.places_disponibles : 0;
            const dateStr = t.date_depart
                ? new Date(t.date_depart).toLocaleDateString('fr-FR')
                : '—';
            const heure = t.heure_depart || '—';
            const region = t.region || '—';

            return `
            <div class="result-card">
                <div class="row align-items-center">
                    <div class="col-lg-5 route-info">
                        <h5><i class="bi bi-geo-alt text-warning"></i> ${t.lieu_depart || '—'} → ${t.lieu_arrivee || '—'}</h5>
                        <div class="route-detail">
                            <i class="bi bi-calendar3"></i> ${dateStr}
                            <span class="mx-2">|</span>
                            <i class="bi bi-clock"></i> ${heure}
                        </div>
                        <div class="route-detail"><i class="bi bi-tag"></i> ${region}</div>
                    </div>
                    <div class="col-lg-3">
                        <span class="seats ${places < 5 ? 'low' : ''}">
                            <i class="bi bi-person"></i> ${places} place(s)
                        </span>
                    </div>
                    <div class="col-lg-2 price-info">
                        <div class="price">${prix.toLocaleString()} <span>Ar</span></div>
                    </div>
                    <div class="col-lg-2 text-lg-end">
                        <button class="btn-reserve" onclick="openReservation('${t.id}')">
                            <i class="bi bi-ticket"></i> Réserver
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('')}
    `;
}

// =============================================
// 7. CHARGEMENT INITIAL DES TRAJETS
// =============================================

async function loadTrajets() {
    const container = document.getElementById('resultsContainer');
    try {
        const response = await fetch(`${API_URL}/client/trajets`);
        if (!response.ok) throw new Error('Erreur chargement trajets');
        const result = await response.json();
        allTrajets = normalizeTrajets(result);
        displayResults(allTrajets);
    } catch (error) {
        console.error('Erreur loadTrajets:', error);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-warning text-center">
                    <i class="bi bi-exclamation-circle me-2"></i>
                    Impossible de charger les trajets. Vérifiez que le serveur est démarré.
                </div>`;
        }
    }
}

// =============================================
// 8. RÉSERVATION
// =============================================

async function openReservation(trajetId) {
    if (!currentUser) {
        alert('Veuillez vous connecter.');
        new bootstrap.Modal(document.getElementById('loginModal')).show();
        return;
    }
    const trajet = allTrajets.find(t => t.id === trajetId);
    if (!trajet) { alert('Trajet non trouvé'); return; }

    document.getElementById('reservationDetails').innerHTML = `
        <div class="p-3 bg-light rounded">
            <h5 class="text-primary">${trajet.lieu_depart} → ${trajet.lieu_arrivee}</h5>
            <p><i class="bi bi-calendar3"></i> ${new Date(trajet.date_depart).toLocaleDateString('fr-FR')}</p>
            <p><i class="bi bi-clock"></i> ${trajet.heure_depart || '—'}</p>
            <p><i class="bi bi-person"></i> ${trajet.places_disponibles} places</p>
            <p class="fw-bold text-success">${Number(trajet.prix).toLocaleString()} Ar</p>
        </div>
    `;
    document.getElementById('reservationPassagers').value = 1;
    document.getElementById('reservationPassagers').max = trajet.places_disponibles || 1;
    document.getElementById('confirmReservationBtn').dataset.trajetId = trajetId;
    new bootstrap.Modal(document.getElementById('reservationModal')).show();
}

document.getElementById('confirmReservationBtn')?.addEventListener('click', async function () {
    const trajetId = this.dataset.trajetId;
    const nombrePassagers = parseInt(document.getElementById('reservationPassagers').value);
    if (!trajetId || !nombrePassagers || nombrePassagers < 1) {
        alert('Nombre de passagers invalide');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/client/reserver`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ trajet_id: trajetId, nombre_passagers: nombrePassagers })
        });
        const result = await response.json();
        if (response.ok) {
            alert('✅ Réservation confirmée !');
            bootstrap.Modal.getInstance(document.getElementById('reservationModal')).hide();
            loadTrajets();
            loadHistorique();
        } else {
            alert('❌ ' + (result.error || 'Erreur'));
        }
    } catch (error) {
        alert('❌ Erreur de connexion');
    }
});

// =============================================
// 9. HISTORIQUE
// =============================================

async function loadHistorique() {
    if (!currentUser) return;
    const container = document.getElementById('historiqueContainer');
    if (!container) return;
    try {
        const response = await fetch(`${API_URL}/client/historique`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const result = await response.json();
        const reservations = result.data || result || [];
        if (!reservations || reservations.length === 0) {
            container.innerHTML = `
                <div class="alert alert-light text-center py-4">
                    <i class="bi bi-inbox display-6 d-block text-muted"></i>
                    <p class="mb-0">Aucune réservation</p>
                </div>`;
            return;
        }
        container.innerHTML = `
            <div class="row g-3">
                ${reservations.map(r => `
                    <div class="col-md-6">
                        <div class="card border-0 shadow-sm">
                            <div class="card-body">
                                <div class="d-flex justify-content-between">
                                    <h6>${r.trajets?.lieu_depart || r.lieu_depart || 'N/A'} → ${r.trajets?.lieu_arrivee || r.lieu_arrivee || 'N/A'}</h6>
                                    <span class="badge ${r.statut === 'confirmée' ? 'bg-success' : r.statut === 'annulée' ? 'bg-danger' : 'bg-warning'}">
                                        ${r.statut}
                                    </span>
                                </div>
                                <p class="small text-muted">
                                    <i class="bi bi-calendar3"></i> ${new Date(r.date_reservation).toLocaleDateString('fr-FR')}
                                    <span class="mx-2">|</span>
                                    <i class="bi bi-people"></i> ${r.nombre_passagers} pers.
                                    <span class="mx-2">|</span>
                                    <strong>${r.montant_total?.toLocaleString() || '0'} Ar</strong>
                                </p>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } catch (error) {
        console.error('Erreur:', error);
    }
}

// =============================================
// 10. ADMIN
// =============================================

async function loadAdminStats() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const result = await response.json();
        if (result.success) {
            document.getElementById('statUsers').textContent = result.users || 0;
            document.getElementById('statReservations').textContent = result.reservations || 0;
            document.getElementById('statMonthly').textContent = result.monthlyReservations || 0;
            document.getElementById('statRevenue').textContent = (result.revenue || 0).toLocaleString() + ' Ar';
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

document.getElementById('adminTrajetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        lieu_depart: document.getElementById('adminLieuDepart').value.trim(),
        lieu_arrivee: document.getElementById('adminLieuArrivee').value.trim(),
        date_depart: document.getElementById('adminDateDepart').value,
        heure_depart: document.getElementById('adminHeureDepart').value,
        prix: parseFloat(document.getElementById('adminPrix').value),
        places_disponibles: parseInt(document.getElementById('adminPlaces').value)
    };
    try {
        const response = await fetch(`${API_URL}/admin/trajets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify(data)
        });
        if (response.ok) {
            alert('✅ Trajet ajouté !');
            document.getElementById('adminTrajetForm').reset();
            loadTrajets();
        } else {
            const error = await response.json();
            alert('❌ ' + (error.error || 'Erreur'));
        }
    } catch (error) {
        alert('❌ Erreur de connexion');
    }
});

// =============================================
// 11. INITIALISATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    // Date min = aujourd'hui
    const dateInput = document.getElementById('dateDepart');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }

    checkAuth();
    loadTrajets(); // charge automatiquement les trajets disponibles au démarrage
});