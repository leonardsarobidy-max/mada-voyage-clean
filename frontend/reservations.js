// =============================================
// RESERVATIONS.JS - NY ANTSIKA (complet corrigé)
// Recherche trajets + réservation + sièges + historique
// PDF uniquement si statut === 'confirmée'
// =============================================

// IMPORTANT : pointe vers le serveur Node (port 3000)
const API_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentToken = null;
let selectedTrajet = null;
let selectedSieges = [];
let lastReservationResult = null;
let mesReservations = [];

// =============================================
// 1. INITIALISATION
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    ensureHistoriqueSection();
    loadTrajets();

    const urlParams = new URLSearchParams(window.location.search);
    const trajetId = urlParams.get('trajet_id');
    if (trajetId) loadTrajetDetails(trajetId);

    const dateInput = document.getElementById('dateDepart');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }

    if (currentUser) loadHistorique();
});

// =============================================
// 2. AUTHENTIFICATION
// =============================================
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        updateUIForLoggedInUser();
        return true;
    }
    return false;
}

function updateUIForLoggedInUser() {
    const authLinks = document.getElementById('authLinks');
    const userInfo = document.getElementById('userInfo');
    const userNameText = document.getElementById('userNameText');

    if (currentUser) {
        authLinks?.classList.add('d-none');
        userInfo?.classList.remove('d-none');
        if (userNameText) {
            userNameText.textContent = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim();
        }
    } else {
        authLinks?.classList.remove('d-none');
        userInfo?.classList.add('d-none');
    }
}

// =============================================
// 3. ÉVÉNEMENTS
// =============================================
function setupEventListeners() {
    document.getElementById('searchForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        searchTrajets();
    });

    document.getElementById('confirmReservationBtn')?.addEventListener('click', confirmReservation);

    document.getElementById('reservationPassagers')?.addEventListener('input', () => {
        renderPassagersForms();
        updatePrice();
        const max = parseInt(document.getElementById('reservationPassagers').value) || 1;
        if (selectedSieges.length > max) {
            selectedSieges = selectedSieges.slice(0, max);
            generateSieges();
        }
    });

    document.getElementById('reservationModal')?.addEventListener('hidden.bs.modal', resetReservationForm);

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    document.getElementById('downloadTicketBtn')?.addEventListener('click', () => {
        const statut = lastReservationResult?.reservation?.statut || 'en_attente';
        if (statut !== 'confirmée') {
            showToast('Le billet PDF sera disponible après confirmation par l\'administrateur.', 'warning');
            return;
        }
        downloadTicketPDF(lastReservationResult);
    });

    // Login
    document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Identifiants incorrects');

            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            currentToken = result.token;
            currentUser = result.user;

            bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
            document.getElementById('loginForm').reset();
            document.getElementById('loginError').textContent = '';
            updateUIForLoggedInUser();
            showToast('Connexion réussie !', 'success');
            if (selectedTrajet) loadTrajetDetails(selectedTrajet.id);
            loadHistorique();
        } catch (err) {
            document.getElementById('loginError').textContent = err.message;
        }
    });

    // Register
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
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Erreur inscription');

            bootstrap.Modal.getInstance(document.getElementById('registerModal'))?.hide();
            document.getElementById('registerForm').reset();
            document.getElementById('registerError').textContent = '';
            showToast('Inscription réussie ! Connectez-vous.', 'success');
            new bootstrap.Modal(document.getElementById('loginModal')).show();
        } catch (err) {
            document.getElementById('registerError').textContent = err.message;
        }
    });
}

// =============================================
// 4. HISTORIQUE (bas de page)
// =============================================
function ensureHistoriqueSection() {
    if (document.getElementById('historiqueSection')) return;

    const footer = document.querySelector('footer');
    const section = document.createElement('section');
    section.id = 'historiqueSection';
    section.className = 'py-5 bg-white border-top';
    section.innerHTML = `
        <div class="container">
            <div class="d-flex align-items-center mb-4">
                <span class="step-badge">4</span>
                <h2 class="mb-0">Mes réservations</h2>
            </div>
            <div id="historiqueContainer">
                <div class="alert alert-info text-center py-4 mb-0">
                    <i class="bi bi-person-circle display-6 d-block mb-2"></i>
                    <p class="mb-0">Connectez-vous pour voir vos demandes de réservation</p>
                </div>
            </div>
        </div>`;
    if (footer) footer.parentNode.insertBefore(section, footer);
    else document.body.appendChild(section);
}

async function loadHistorique() {
    const container = document.getElementById('historiqueContainer');
    if (!container) return;

    if (!currentUser || !currentToken) {
        container.innerHTML = `
            <div class="alert alert-info text-center py-4 mb-0">
                <i class="bi bi-person-circle display-6 d-block mb-2"></i>
                <p class="mb-0">Connectez-vous pour voir vos demandes de réservation</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-warning" role="status"></div>
        </div>`;

    try {
        const res = await fetch(`${API_URL}/client/historique`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) throw new Error('Erreur chargement historique');
        const result = await res.json();
        mesReservations = Array.isArray(result) ? result : (result.data || []);
        displayHistorique(mesReservations);
    } catch (error) {
        container.innerHTML = `
            <div class="alert alert-warning text-center">${error.message}</div>`;
    }
}

function displayHistorique(list) {
    const container = document.getElementById('historiqueContainer');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="alert alert-light text-center py-4 mb-0 border">
                <i class="bi bi-inbox display-6 d-block text-muted mb-2"></i>
                <p class="mb-0">Aucune demande de réservation</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="row g-3">
            ${list.map(r => {
                const trajet = r.trajets || {};
                const depart = trajet.lieu_depart || '—';
                const arrivee = trajet.lieu_arrivee || '—';
                const dateDep = trajet.date_depart
                    ? new Date(trajet.date_depart).toLocaleDateString('fr-FR') : '—';
                const statut = r.statut || 'en_attente';
                const badgeClass =
                    statut === 'confirmée' ? 'bg-success' :
                    statut === 'annulée' ? 'bg-danger' : 'bg-warning text-dark';
                const statutLabel =
                    statut === 'confirmée' ? 'Confirmée' :
                    statut === 'annulée' ? 'Annulée' : 'En attente de confirmation';
                const sieges = r.siege_ids ? String(r.siege_ids) : '—';

                const pdfBtn = statut === 'confirmée'
                    ? `<button class="btn btn-sm btn-warning fw-bold" onclick="downloadTicketFromHistorique('${r.id}')">
                           <i class="bi bi-file-earmark-pdf"></i> Télécharger le billet PDF
                       </button>`
                    : `<button class="btn btn-sm btn-outline-secondary" disabled>
                           <i class="bi bi-lock"></i> Billet indisponible
                       </button>`;

                const infoMsg = statut === 'en_attente'
                    ? `<p class="small text-warning mb-0"><i class="bi bi-hourglass-split"></i> En attente de confirmation par l'admin.</p>`
                    : statut === 'confirmée'
                    ? `<p class="small text-success mb-0"><i class="bi bi-check-circle"></i> Confirmée — vous pouvez télécharger le billet.</p>`
                    : `<p class="small text-danger mb-0"><i class="bi bi-x-circle"></i> Annulée.</p>`;

                return `
                <div class="col-12">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body">
                            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                                <div>
                                    <h6 class="mb-1"><i class="bi bi-geo-alt text-warning"></i> ${depart} → ${arrivee}</h6>
                                    <p class="small text-muted mb-0">
                                        <i class="bi bi-calendar3"></i> ${dateDep}
                                        · <i class="bi bi-people"></i> ${r.nombre_passagers || 1} pers.
                                        · Sièges : ${sieges}
                                        · <strong>${Number(r.montant_total || 0).toLocaleString()} Ar</strong>
                                    </p>
                                </div>
                                <span class="badge ${badgeClass}">${statutLabel}</span>
                            </div>
                            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2 pt-2 border-top">
                                ${infoMsg}
                                ${pdfBtn}
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

function downloadTicketFromHistorique(reservationId) {
    const r = mesReservations.find(x => x.id === reservationId);
    if (!r) {
        showToast('Réservation introuvable', 'error');
        return;
    }
    if (r.statut !== 'confirmée') {
        showToast('Billet disponible uniquement après confirmation admin.', 'warning');
        return;
    }

    const trajet = r.trajets || {};
    let passagers = [];
    try {
        passagers = typeof r.passagers_details === 'string'
            ? JSON.parse(r.passagers_details)
            : (r.passagers_details || []);
    } catch (_) {
        passagers = [];
    }
    if (!passagers.length) {
        passagers = [{
            nom: currentUser?.nom || '',
            prenom: currentUser?.prenom || '',
            telephone: currentUser?.telephone || null
        }];
    }

    const sieges = r.siege_ids
        ? String(r.siege_ids).split(',').map(s => parseInt(s.trim())).filter(Boolean)
        : [];

    downloadTicketPDF({
        reservation: r,
        trajet: {
            lieu_depart: trajet.lieu_depart || '—',
            lieu_arrivee: trajet.lieu_arrivee || '—',
            date_depart: trajet.date_depart,
            heure_depart: trajet.heure_depart
        },
        passagers,
        sieges,
        total: Number(r.montant_total || 0)
    });
}

// =============================================
// 5. RECHERCHE & LISTE TRAJETS (CORRIGÉ)
// =============================================
async function searchTrajets() {
    const params = new URLSearchParams();
    const lieuDepart = document.getElementById('lieuDepart')?.value.trim() || '';
    const lieuArrivee = document.getElementById('lieuArrivee')?.value.trim() || '';
    const dateDepart = document.getElementById('dateDepart')?.value || '';
    const passagers = document.getElementById('passagers')?.value || '1';

    if (lieuDepart) params.append('lieu_depart', lieuDepart);
    if (lieuArrivee) params.append('lieu_arrivee', lieuArrivee);
    if (dateDepart) params.append('date_depart', dateDepart);
    if (passagers) params.append('passagers', passagers);

    const container = document.getElementById('trajetsResults');
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-warning" role="status"></div>
            <p class="mt-2 text-muted">Recherche en cours...</p>
        </div>`;

    try {
        // 1) Essayer /client/recherche
        let res = await fetch(`${API_URL}/client/recherche?${params}`);
        let trajets = [];

        if (res.ok) {
            const result = await res.json();
            trajets = Array.isArray(result) ? result : (result.data || result.trajets || []);
        }

        // 2) Fallback : /client/trajets + filtre local
        if (!res.ok || trajets.length === 0) {
            const res2 = await fetch(`${API_URL}/client/trajets`);
            if (!res2.ok) {
                const err = await res2.json().catch(() => ({}));
                throw new Error(err.error || `Erreur serveur ${res2.status}`);
            }
            const result2 = await res2.json();
            trajets = Array.isArray(result2) ? result2 : (result2.data || result2.trajets || []);

            // Filtre local
            if (lieuDepart) {
                trajets = trajets.filter(t =>
                    (t.lieu_depart || '').toLowerCase().includes(lieuDepart.toLowerCase())
                );
            }
            if (lieuArrivee) {
                trajets = trajets.filter(t =>
                    (t.lieu_arrivee || '').toLowerCase().includes(lieuArrivee.toLowerCase())
                );
            }
            if (dateDepart) {
                trajets = trajets.filter(t =>
                    String(t.date_depart || '').startsWith(dateDepart)
                );
            }
            if (passagers) {
                const n = parseInt(passagers) || 1;
                trajets = trajets.filter(t => (t.places_disponibles || 0) >= n);
            }
        }

        displayTrajets(trajets);
    } catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="bi bi-exclamation-triangle me-2"></i>
                ${error.message || 'Erreur de recherche'}
                <br><small class="text-muted">Vérifiez : node server.js — API : ${API_URL}</small>
            </div>`;
    }
}

async function loadTrajets() {
    const container = document.getElementById('trajetsResults');
    if (container) {
        container.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-warning" role="status"></div>
                <p class="mt-2 text-muted small">Chargement des trajets...</p>
            </div>`;
    }

    try {
        const res = await fetch(`${API_URL}/client/trajets`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erreur ${res.status}`);
        }
        const result = await res.json();
        const trajets = Array.isArray(result) ? result : (result.data || result.trajets || []);
        displayTrajets(trajets);
    } catch (error) {
        console.error(error);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-warning text-center">
                    <i class="bi bi-wifi-off me-2"></i>
                    Impossible de charger les trajets.<br>
                    <small>1. Terminal : <code>node server.js</code></small><br>
                    <small>2. Ouvrir : <code>http://localhost:3000/reservations.html</code></small><br>
                    <small class="text-muted">API : ${API_URL}</small>
                </div>`;
        }
        showToast('Impossible de charger les trajets', 'error');
    }
}

function displayTrajets(trajets) {
    const container = document.getElementById('trajetsResults');
    if (!container) return;

    if (!trajets || trajets.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-search display-4 d-block mb-2"></i>
                <h5>Aucun trajet trouvé</h5>
                <p>Essayez sans filtre, ou vérifiez les dates des trajets dans Supabase.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="fw-bold">${trajets.length} trajet(s) trouvé(s)</span>
            <span class="text-muted small">Cliquez pour voir les détails</span>
        </div>
        <div class="row g-3">
            ${trajets.map(t => `
                <div class="col-md-6 col-lg-4">
                    <div class="card trajet-card h-100 shadow-sm" onclick="selectTrajet('${t.id}')">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h5 class="card-title mb-0">
                                    <i class="bi bi-geo-alt text-warning"></i>
                                    ${t.lieu_depart} → ${t.lieu_arrivee}
                                </h5>
                                <span class="badge ${(t.places_disponibles || 0) > 5 ? 'bg-success' : 'bg-warning text-dark'}">
                                    ${t.places_disponibles || 0} places
                                </span>
                            </div>
                            <p class="mb-1 small"><i class="bi bi-calendar3 text-primary me-1"></i>
                                ${t.date_depart ? new Date(t.date_depart).toLocaleDateString('fr-FR') : '—'}</p>
                            <p class="mb-1 small"><i class="bi bi-clock text-primary me-1"></i> ${t.heure_depart || '—'}</p>
                            ${t.region ? `<p class="mb-1 small"><i class="bi bi-pin-map text-primary me-1"></i> ${t.region}</p>` : ''}
                            <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                                <span class="price">${Number(t.prix || 0).toLocaleString()} <small>Ar</small></span>
                                <button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); selectTrajet('${t.id}')">
                                    <i class="bi bi-ticket me-1"></i> Choisir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>`;
}

// =============================================
// 6. DÉTAILS TRAJET
// =============================================
async function selectTrajet(trajetId) {
    try {
        await loadTrajetDetails(trajetId);
        document.getElementById('trajetDetails')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const url = new URL(window.location);
        url.searchParams.set('trajet_id', trajetId);
        window.history.pushState({}, '', url);
    } catch (e) {
        showToast('Erreur chargement du trajet', 'error');
    }
}

async function loadTrajetDetails(trajetId) {
    try {
        const res = await fetch(`${API_URL}/client/trajets/${trajetId}`);
        if (!res.ok) throw new Error('Trajet non trouvé');
        selectedTrajet = await res.json();
        if (selectedTrajet.data) selectedTrajet = selectedTrajet.data;
        displayTrajetDetails(selectedTrajet);
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Erreur détails trajet', 'error');
    }
}

function displayTrajetDetails(trajet) {
    const container = document.getElementById('trajetDetails');
    if (!container) return;

    const date = new Date(trajet.date_depart);
    const isPast = !isNaN(date) && date < new Date(new Date().setHours(0, 0, 0, 0));
    const isAvailable = (trajet.places_disponibles || 0) > 0 && trajet.disponible !== false;

    container.innerHTML = `
        <div class="d-flex align-items-center mb-3">
            <span class="step-badge">2</span>
            <h3 class="mb-0">Détails du trajet</h3>
        </div>
        <div class="card shadow-sm border-0">
            <div class="card-body p-4">
                <div class="row">
                    <div class="col-md-8">
                        <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
                            <h4 class="mb-0"><i class="bi bi-geo-alt text-warning"></i> ${trajet.lieu_depart}</h4>
                            <i class="bi bi-arrow-right fs-4 text-muted"></i>
                            <h4 class="mb-0">${trajet.lieu_arrivee}</h4>
                        </div>
                        <div class="row g-3">
                            <div class="col-sm-6">
                                <i class="bi bi-calendar3 text-primary me-1"></i>
                                <strong>Date :</strong>
                                ${!isNaN(date) ? date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                            </div>
                            <div class="col-sm-6">
                                <i class="bi bi-clock text-primary me-1"></i>
                                <strong>Heure :</strong> ${trajet.heure_depart || '—'}
                            </div>
                            <div class="col-sm-6">
                                <i class="bi bi-people text-primary me-1"></i>
                                <strong>Places :</strong>
                                <span class="${(trajet.places_disponibles || 0) < 5 ? 'text-warning' : 'text-success'}">
                                    ${trajet.places_disponibles || 0} / ${trajet.places_totales || '—'}
                                </span>
                            </div>
                            ${trajet.region ? `
                            <div class="col-sm-6">
                                <i class="bi bi-pin-map text-primary me-1"></i>
                                <strong>Région :</strong> ${trajet.region}
                            </div>` : ''}
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 bg-light rounded h-100 d-flex flex-column justify-content-center text-center">
                            <div class="display-5 fw-bold text-primary">${Number(trajet.prix || 0).toLocaleString()}</div>
                            <p class="text-muted mb-3">Ar / passager</p>
                            ${isPast ? `
                                <div class="alert alert-warning mb-0 py-2"><i class="bi bi-clock-history"></i> Trajet passé</div>
                            ` : !isAvailable ? `
                                <div class="alert alert-danger mb-0 py-2"><i class="bi bi-x-circle"></i> Complet</div>
                            ` : `
                                <button class="btn btn-warning btn-lg w-100 fw-bold" id="reserveBtn">
                                    <i class="bi bi-check-circle me-1"></i>
                                    ${currentUser ? 'Réserver maintenant' : 'Connectez-vous pour réserver'}
                                </button>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    document.getElementById('reserveBtn')?.addEventListener('click', () => {
        if (!currentUser) {
            showToast('Veuillez vous connecter pour réserver', 'warning');
            new bootstrap.Modal(document.getElementById('loginModal')).show();
            return;
        }
        openReservationModal();
    });
}

// =============================================
// 7. MODAL RÉSERVATION
// =============================================
function openReservationModal() {
    if (!selectedTrajet) {
        showToast('Sélectionnez un trajet', 'warning');
        return;
    }
    if ((selectedTrajet.places_disponibles || 0) <= 0) {
        showToast('Ce trajet est complet', 'error');
        return;
    }

    document.getElementById('reservationTrajetInfo').innerHTML = `
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
                <h6 class="mb-1"><i class="bi bi-geo-alt text-warning"></i>
                    ${selectedTrajet.lieu_depart} → ${selectedTrajet.lieu_arrivee}</h6>
                <p class="mb-0 text-muted small">
                    <i class="bi bi-calendar3 me-1"></i>
                    ${new Date(selectedTrajet.date_depart).toLocaleDateString('fr-FR')}
                    <span class="mx-2">|</span>
                    <i class="bi bi-clock me-1"></i> ${selectedTrajet.heure_depart || '—'}
                </p>
            </div>
            <span class="badge bg-success">${selectedTrajet.places_disponibles} places</span>
        </div>`;

    const passagersInput = document.getElementById('reservationPassagers');
    passagersInput.value = 1;
    passagersInput.max = Math.min(selectedTrajet.places_disponibles, 10);

    selectedSieges = [];
    renderPassagersForms();
    generateSieges();
    updatePrice();

    new bootstrap.Modal(document.getElementById('reservationModal')).show();
}

function renderPassagersForms() {
    const n = parseInt(document.getElementById('reservationPassagers')?.value) || 1;
    const container = document.getElementById('passagersForms');
    if (!container) return;

    let html = '';
    for (let i = 1; i <= n; i++) {
        html += `
        <div class="passager-card">
            <h6><i class="bi bi-person"></i> Passager ${i}</h6>
            <div class="row g-2">
                <div class="col-md-4">
                    <input type="text" class="form-control form-control-sm passager-nom" placeholder="Nom *" required>
                </div>
                <div class="col-md-4">
                    <input type="text" class="form-control form-control-sm passager-prenom" placeholder="Prénom *" required>
                </div>
                <div class="col-md-4">
                    <input type="tel" class="form-control form-control-sm passager-tel" placeholder="Téléphone">
                </div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

// =============================================
// 8. SIÈGES
// =============================================
async function generateSieges() {
    const container = document.getElementById('siegeContainer');
    if (!container || !selectedTrajet) return;

    container.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-warning"></div></div>`;

    let sieges = [];
    try {
        const res = await fetch(`${API_URL}/client/trajets/${selectedTrajet.id}/sieges`);
        if (res.ok) {
            const result = await res.json();
            sieges = Array.isArray(result) ? result : (result.data || []);
        }
    } catch (_) {}

    if (!sieges.length) {
        const total = Math.min(selectedTrajet.places_totales || 20, 40);
        const occupiedCount = Math.max(0, (selectedTrajet.places_totales || total) - (selectedTrajet.places_disponibles || 0));
        const occupiedSet = new Set();
        while (occupiedSet.size < occupiedCount && occupiedSet.size < total) {
            occupiedSet.add(Math.floor(Math.random() * total) + 1);
        }
        for (let i = 1; i <= total; i++) {
            sieges.push({ numero: i, statut: occupiedSet.has(i) ? 'occupe' : 'disponible' });
        }
    }

    let bodyHtml = '';
    sieges.forEach((s, idx) => {
        const num = s.numero;
        const isOccupied = s.statut === 'occupe' || s.statut === 'reserve';
        const isSelected = selectedSieges.includes(num);

        if (idx > 0 && idx % 2 === 0 && (idx / 2) % 2 === 1) {
            bodyHtml += `<div class="siege aisle"></div>`;
        }

        let cls = 'siege ';
        if (isOccupied) cls += 'occupied';
        else if (isSelected) cls += 'selected';
        else cls += 'available';

        bodyHtml += `<div class="${cls}" ${isOccupied ? '' : `onclick="toggleSiegeSelection(${num})"`}>
            ${num}${isSelected ? ' ✓' : ''}${isOccupied ? ' ✕' : ''}
        </div>`;
    });

    container.innerHTML = `
        <div class="siege-grid-header">AVANT DU BUS — ÉCRAN</div>
        <div class="siege-grid-body">${bodyHtml}</div>
        <div class="siege-legend mt-3">
            <span><span class="siege-legend-color available"></span> Disponible</span>
            <span><span class="siege-legend-color selected"></span> Sélectionné</span>
            <span><span class="siege-legend-color occupied"></span> Occupé</span>
        </div>`;
}

function toggleSiegeSelection(num) {
    const max = parseInt(document.getElementById('reservationPassagers')?.value) || 1;
    const index = selectedSieges.indexOf(num);

    if (index > -1) {
        selectedSieges.splice(index, 1);
    } else {
        if (selectedSieges.length >= max) {
            showToast(`Vous ne pouvez sélectionner que ${max} siège(s)`, 'warning');
            return;
        }
        selectedSieges.push(num);
    }
    generateSieges();
    updatePrice();
}

function updatePrice() {
    const passagers = parseInt(document.getElementById('reservationPassagers')?.value) || 1;
    const prix = selectedTrajet?.prix || 0;
    const total = passagers * Number(prix);

    document.getElementById('reservationTotal').textContent = total.toLocaleString() + ' Ar';
    document.getElementById('reservationPassagersCount').textContent = passagers;
    document.getElementById('reservationSiegesCount').textContent =
        selectedSieges.length > 0 ? selectedSieges.sort((a, b) => a - b).join(', ') : 'Aucun';
}

// =============================================
// 9. CONFIRMATION RÉSERVATION
// =============================================
function collectPassagers() {
    const noms = document.querySelectorAll('.passager-nom');
    const prenoms = document.querySelectorAll('.passager-prenom');
    const tels = document.querySelectorAll('.passager-tel');
    const list = [];

    for (let i = 0; i < noms.length; i++) {
        const nom = noms[i].value.trim();
        const prenom = prenoms[i].value.trim();
        if (!nom || !prenom) return null;
        list.push({
            nom,
            prenom,
            telephone: tels[i]?.value.trim() || null,
            siege: selectedSieges[i] || null
        });
    }
    return list;
}

async function confirmReservation() {
    if (!currentUser) {
        showToast('Veuillez vous connecter', 'warning');
        return;
    }
    if (!selectedTrajet) {
        showToast('Aucun trajet sélectionné', 'error');
        return;
    }

    const nombrePassagers = parseInt(document.getElementById('reservationPassagers').value) || 1;
    if (nombrePassagers < 1) {
        showToast('Nombre de passagers invalide', 'warning');
        return;
    }
    if (nombrePassagers > selectedTrajet.places_disponibles) {
        showToast(`Seulement ${selectedTrajet.places_disponibles} places disponibles`, 'warning');
        return;
    }
    if (selectedSieges.length !== nombrePassagers) {
        showToast(`Veuillez sélectionner exactement ${nombrePassagers} siège(s)`, 'warning');
        return;
    }

    const passagers = collectPassagers();
    if (!passagers) {
        showToast('Veuillez remplir le nom et prénom de chaque passager', 'warning');
        return;
    }

    if (!confirm(`Envoyer la demande pour ${nombrePassagers} passager(s) ?\nLe billet PDF sera dispo après confirmation admin.`)) {
        return;
    }

    try {
        const res = await fetch(`${API_URL}/client/reserver`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                trajet_id: selectedTrajet.id,
                nombre_passagers: nombrePassagers,
                siege_ids: selectedSieges,
                passagers_details: passagers,
                contact_telephone: currentUser.telephone || passagers[0]?.telephone || null,
                contact_email: currentUser.email || null
            })
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Erreur lors de la réservation');

        const reservation = result.reservation || result.data || result;

        lastReservationResult = {
            reservation,
            trajet: selectedTrajet,
            passagers,
            sieges: [...selectedSieges],
            total: nombrePassagers * Number(selectedTrajet.prix)
        };

        bootstrap.Modal.getInstance(document.getElementById('reservationModal'))?.hide();
        showSuccessModal(lastReservationResult);

        loadTrajets();
        loadTrajetDetails(selectedTrajet.id);
        loadHistorique();
        selectedSieges = [];
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function showSuccessModal(data) {
    const r = data.reservation || {};
    const statut = r.statut || 'en_attente';

    document.getElementById('successReservationId').textContent =
        (r.id || 'N/A').toString().substring(0, 8).toUpperCase();
    document.getElementById('successTrajet').textContent =
        `${data.trajet.lieu_depart} → ${data.trajet.lieu_arrivee}`;
    document.getElementById('successDate').textContent =
        new Date(data.trajet.date_depart).toLocaleDateString('fr-FR');
    document.getElementById('successPassagers').textContent = data.passagers.length;
    document.getElementById('successSieges').textContent =
        data.sieges.sort((a, b) => a - b).join(', ');
    document.getElementById('successTotal').textContent =
        data.total.toLocaleString() + ' Ar';

    const pdfBtn = document.getElementById('downloadTicketBtn');
    if (pdfBtn) {
        if (statut === 'confirmée') {
            pdfBtn.disabled = false;
            pdfBtn.className = 'btn btn-warning w-100 fw-bold';
            pdfBtn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Télécharger le ticket PDF';
        } else {
            pdfBtn.disabled = true;
            pdfBtn.className = 'btn btn-secondary w-100';
            pdfBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> En attente de confirmation admin';
        }
    }

    new bootstrap.Modal(document.getElementById('successModal')).show();
}

function resetReservationForm() {
    selectedSieges = [];
    const input = document.getElementById('reservationPassagers');
    if (input) input.value = 1;
    const totalEl = document.getElementById('reservationTotal');
    if (totalEl) totalEl.textContent = '0 Ar';
    const forms = document.getElementById('passagersForms');
    if (forms) forms.innerHTML = '';
    const sieges = document.getElementById('siegeContainer');
    if (sieges) sieges.innerHTML = '';
}

// =============================================
// 10. TICKET PDF (seulement si confirmée)
// =============================================
function downloadTicketPDF(data) {
    if (!data) {
        showToast('Aucune réservation à exporter', 'warning');
        return;
    }
    if ((data.reservation?.statut || 'en_attente') !== 'confirmée') {
        showToast('Billet PDF disponible uniquement après confirmation admin.', 'warning');
        return;
    }
    if (!window.jspdf) {
        showToast('Bibliothèque PDF non chargée', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const r = data.reservation || {};
    const t = data.trajet || {};

    doc.setFillColor(10, 37, 64);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(244, 162, 97);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Ny Antsika', 20, 18);
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('Voyages Madagascar — Ticket de réservation', 20, 28);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);

    let y = 50;
    const line = (label, value) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 20, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), 70, y);
        y += 10;
    };

    line('N° Réservation :', (r.id || 'N/A').toString().substring(0, 8).toUpperCase());
    line('Statut :', 'CONFIRMÉE');
    line('Trajet :', `${t.lieu_depart || '—'}  →  ${t.lieu_arrivee || '—'}`);
    line('Date départ :', t.date_depart
        ? `${new Date(t.date_depart).toLocaleDateString('fr-FR')} à ${t.heure_depart || '—'}`
        : '—');
    line('Sièges :', (data.sieges || []).sort((a, b) => a - b).join(', ') || '—');
    line('Montant total :', Number(data.total || 0).toLocaleString() + ' Ar');

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Passagers', 20, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    (data.passagers || []).forEach((p, i) => {
        y += 9;
        doc.text(
            `${i + 1}. ${p.prenom || ''} ${p.nom || ''}${p.siege ? ' — Siège ' + p.siege : ''}`,
            25, y
        );
    });

    y = 270;
    doc.setDrawColor(244, 162, 97);
    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Présentez ce ticket lors de l\'embarquement.', 20, y);
    doc.text('Ny Antsika — contact@nyantsika.mg — +261 34 12 345 67', 20, y + 6);

    doc.save(`ticket-nyantsika-${(r.id || Date.now()).toString().substring(0, 8)}.pdf`);
    showToast('Ticket PDF téléchargé !', 'success');
}

// =============================================
// 11. TOAST & LOGOUT
// =============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: 'bi-check-circle-fill text-success',
        error: 'bi-x-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };

    const toast = document.createElement('div');
    toast.className = `toast-custom ${type}`;
    toast.innerHTML = `
        <div class="d-flex align-items-center gap-3">
            <i class="bi ${icons[type] || icons.info} fs-4"></i>
            <span>${message}</span>
            <button class="btn-close ms-auto" onclick="this.closest('.toast-custom').remove()"></button>
        </div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function logout() {
    if (!confirm('Voulez-vous vous déconnecter ?')) return;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    currentToken = null;
    mesReservations = [];
    updateUIForLoggedInUser();
    showToast('Déconnexion réussie', 'info');
    if (selectedTrajet) loadTrajetDetails(selectedTrajet.id);
    loadHistorique();
}