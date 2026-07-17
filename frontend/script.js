// =============================================
// SCRIPT.JS - NY ANTIKA VOYAGES
// =============================================

// ✅ URL CORRECTE DU BACKEND (VERSION MODIFIÉE)
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
// 6. RECHERCHE DE TRAJETS
// =============================================

document.getElementById('searchForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await searchTrajets();
});

async function searchTrajets() {
    const params = new URLSearchParams();
    const lieuDepart = document.getElementById('lieuDepart')?.value.trim();
    const lieuArrivee = document.getElementById('lieuArrivee')?.value.trim();
    const dateDepart = document.getElementById('dateDepart')?.value;
    const passagers = document.getElementById('passagers')?.value || 1;
    if (lieuDepart) params.append('lieu_depart', lieuDepart);
    if (lieuArrivee) params.append('lieu_arrivee', lieuArrivee);
    if (dateDepart) params.append('date_depart', dateDepart);
    if (passagers) params.append('passagers', passagers);
    try {
        const response = await fetch(`${API_URL}/client/recherche?${params}`);
        const trajets = await response.json();
        allTrajets = trajets.data || trajets || [];
        displayResults(allTrajets);
    } catch (error) {
        document.getElementById('resultsContainer').innerHTML = '<div class="alert alert-danger">Erreur de recherche</div>';
    }
}

function displayResults(trajets) {
    const container = document.getElementById('resultsContainer');
    if (!container) return;
    if (!trajets || trajets.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center py-4">
                <i class="bi bi-search display-6 d-block"></i>
                <h5>Aucun trajet trouvé</h5>
                <p class="mb-0">Essayez d'autres critères</p>
            </div>
        `;
        return;
    }
    container.innerHTML = `
        <div class="mb-3"><span class="fw-bold">${trajets.length} trajet(s) trouvé(s)</span></div>
        ${trajets.map(t => `
            <div class="result-card">
                <div class="row align-items-center">
                    <div class="col-lg-5 route-info">
                        <h5><i class="bi bi-geo-alt text-warning"></i> ${t.lieu_depart} → ${t.lieu_arrivee}</h5>
                        <div class="route-detail">
                            <i class="bi bi-calendar3"></i> ${new Date(t.date_depart).toLocaleDateString('fr-FR')}
                            <span class="mx-2">|</span>
                            <i class="bi bi-clock"></i> ${t.heure_depart}
                        </div>
                        <div class="route-detail"><i class="bi bi-tag"></i> ${t.region || 'Région'}</div>
                    </div>
                    <div class="col-lg-3">
                        <span class="seats ${t.places_disponibles < 5 ? 'low' : ''}">
                            <i class="bi bi-person"></i> ${t.places_disponibles} places
                        </span>
                    </div>
                    <div class="col-lg-2 price-info">
                        <div class="price">${t.prix.toLocaleString()} <span>Ar</span></div>
                    </div>
                    <div class="col-lg-2 text-lg-end">
                        <button class="btn-reserve" onclick="openReservation('${t.id}')">
                            <i class="bi bi-ticket"></i> Réserver
                        </button>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

// =============================================
// 7. CHARGEMENT DES TRAJETS
// =============================================

async function loadTrajets() {
    try {
        const response = await fetch(`${API_URL}/client/trajets`);
        const result = await response.json();
        allTrajets = result.data || result || [];
        displayResults(allTrajets);
    } catch (error) {
        console.error('Erreur:', error);
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
            <p><i class="bi bi-clock"></i> ${trajet.heure_depart}</p>
            <p><i class="bi bi-person"></i> ${trajet.places_disponibles} places</p>
            <p class="fw-bold text-success">${trajet.prix.toLocaleString()} Ar</p>
        </div>
    `;
    document.getElementById('reservationPassagers').value = 1;
    document.getElementById('reservationPassagers').max = trajet.places_disponibles;
    document.getElementById('confirmReservationBtn').dataset.trajetId = trajetId;
    new bootstrap.Modal(document.getElementById('reservationModal')).show();
}

document.getElementById('confirmReservationBtn')?.addEventListener('click', async function() {
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
                </div>
            `;
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
            </div>
        `;
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
    checkAuth();
    loadTrajets();
});
