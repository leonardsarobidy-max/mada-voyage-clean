// =============================================
// RESERVATIONS.JS - NY ANTSIKA (~40% interactions)
// Aligné sur le schéma Supabase + table sieges
// =============================================

const API_URL = window.location.origin + '/api';
// En dev local si besoin :
// const API_URL = 'http://localhost:3000/api';

let currentUser = null;
let currentToken = null;
let selectedTrajet = null;
let selectedSieges = [];
let lastReservationResult = null;

// =============================================
// 1. INITIALISATION
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    loadTrajets();

    const urlParams = new URLSearchParams(window.location.search);
    const trajetId = urlParams.get('trajet_id');
    if (trajetId) loadTrajetDetails(trajetId);

    // Date min = aujourd'hui
    const dateInput = document.getElementById('dateDepart');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }
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
        // Limiter le nombre de sièges sélectionnés
        const max = parseInt(document.getElementById('reservationPassagers').value) || 1;
        if (selectedSieges.length > max) {
            selectedSieges = selectedSieges.slice(0, max);
            generateSieges(); // refresh UI
        }
    });

    document.getElementById('reservationModal')?.addEventListener('hidden.bs.modal', resetReservationForm);

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    document.getElementById('downloadTicketBtn')?.addEventListener('click', downloadTicketPDF);

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
// 4. RECHERCHE & LISTE TRAJETS
// =============================================
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

    const container = document.getElementById('trajetsResults');
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-warning" role="status"></div>
            <p class="mt-2 text-muted">Recherche en cours...</p>
        </div>`;

    try {
        const res = await fetch(`${API_URL}/client/recherche?${params}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Erreur ${res.status}`);
        }
        const result = await res.json();
        const trajets = Array.isArray(result) ? result : (result.data || result.trajets || []);
        displayTrajets(trajets);
    } catch (error) {
        console.error(error);
        container.innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="bi bi-exclamation-triangle me-2"></i>
                ${error.message || 'Erreur de recherche. Vérifiez que le serveur est démarré.'}
            </div>`;
    }
}

async function loadTrajets() {
    try {
        const res = await fetch(`${API_URL}/client/trajets`);
        if (!res.ok) throw new Error('Erreur chargement');
        const result = await res.json();
        const trajets = Array.isArray(result) ? result : (result.data || result.trajets || []);
        displayTrajets(trajets);
    } catch (error) {
        console.error(error);
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
                <p>Modifiez vos critères de recherche</p>
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
                                <span class="badge ${t.places_disponibles > 5 ? 'bg-success' : 'bg-warning text-dark'}">
                                    ${t.places_disponibles} places
                                </span>
                            </div>
                            <p class="mb-1 small"><i class="bi bi-calendar3 text-primary me-1"></i>
                                ${new Date(t.date_depart).toLocaleDateString('fr-FR')}</p>
                            <p class="mb-1 small"><i class="bi bi-clock text-primary me-1"></i> ${t.heure_depart || '—'}</p>
                            ${t.region ? `<p class="mb-1 small"><i class="bi bi-pin-map text-primary me-1"></i> ${t.region}</p>` : ''}
                            <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                                <span class="price">${Number(t.prix).toLocaleString()} <small>Ar</small></span>
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
// 5. DÉTAILS TRAJET
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
        // Si le backend renvoie { data: ... }
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
    const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
    const isAvailable = trajet.places_disponibles > 0 && trajet.disponible !== false;

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
                                ${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                            <div class="col-sm-6">
                                <i class="bi bi-clock text-primary me-1"></i>
                                <strong>Heure :</strong> ${trajet.heure_depart || '—'}
                            </div>
                            <div class="col-sm-6">
                                <i class="bi bi-people text-primary me-1"></i>
                                <strong>Places :</strong>
                                <span class="${trajet.places_disponibles < 5 ? 'text-warning' : 'text-success'}">
                                    ${trajet.places_disponibles} / ${trajet.places_totales}
                                </span>
                            </div>
                            ${trajet.region ? `
                            <div class="col-sm-6">
                                <i class="bi bi-pin-map text-primary me-1"></i>
                                <strong>Région :</strong> ${trajet.region}
                            </div>` : ''}
                        </div>
                        ${trajet.description ? `<div class="mt-3 p-3 bg-light rounded small">${trajet.description}</div>` : ''}
                    </div>
                    <div class="col-md-4">
                        <div class="p-3 bg-light rounded h-100 d-flex flex-column justify-content-center text-center">
                            <div class="display-5 fw-bold text-primary">${Number(trajet.prix).toLocaleString()}</div>
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
// 6. MODAL RÉSERVATION
// =============================================
function openReservationModal() {
    if (!selectedTrajet) {
        showToast('Sélectionnez un trajet', 'warning');
        return;
    }
    if (selectedTrajet.places_disponibles <= 0) {
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
                    <input type="text" class="form-control form-control-sm passager-nom"
                           placeholder="Nom *" data-index="${i}" required>
                </div>
                <div class="col-md-4">
                    <input type="text" class="form-control form-control-sm passager-prenom"
                           placeholder="Prénom *" data-index="${i}" required>
                </div>
                <div class="col-md-4">
                    <input type="tel" class="form-control form-control-sm passager-tel"
                           placeholder="Téléphone" data-index="${i}">
                </div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
}

// =============================================
// 7. SIÈGES (plan de bus)
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
    } catch (_) { /* fallback ci-dessous */ }

    // Fallback si pas d'API sièges : génération locale
    if (!sieges.length) {
        const total = Math.min(selectedTrajet.places_totales || 20, 40);
        const occupiedCount = Math.max(0, (selectedTrajet.places_totales || total) - (selectedTrajet.places_disponibles || 0));
        const occupiedSet = new Set();
        while (occupiedSet.size < occupiedCount && occupiedSet.size < total) {
            occupiedSet.add(Math.floor(Math.random() * total) + 1);
        }
        for (let i = 1; i <= total; i++) {
            sieges.push({
                numero: i,
                statut: occupiedSet.has(i) ? 'occupe' : 'disponible'
            });
        }
    }

    // Grille 2+couloir+2
    let bodyHtml = '';
    sieges.forEach((s, idx) => {
        const num = s.numero;
        const isOccupied = s.statut === 'occupe' || s.statut === 'reserve';
        const isSelected = selectedSieges.includes(num);

        // Insérer un "couloir" après chaque 2 sièges
        if (idx > 0 && idx % 2 === 0 && (idx / 2) % 2 === 1) {
            bodyHtml += `<div class="siege aisle"></div>`;
        }

        let cls = 'siege ';
        if (isOccupied) cls += 'occupied';
        else if (isSelected) cls += 'selected';
        else cls += 'available';

        bodyHtml += `<div class="${cls}" data-siege="${num}" ${isOccupied ? '' : `onclick="toggleSiegeSelection(${num})"`}>
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
// 8. CONFIRMATION RÉSERVATION
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

    if (!confirm(`Confirmer la réservation de ${nombrePassagers} passager(s) pour ${selectedTrajet.lieu_depart} → ${selectedTrajet.lieu_arrivee} ?`)) {
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

        lastReservationResult = {
            reservation: result.reservation || result.data || result,
            trajet: selectedTrajet,
            passagers,
            sieges: [...selectedSieges],
            total: nombrePassagers * Number(selectedTrajet.prix)
        };

        bootstrap.Modal.getInstance(document.getElementById('reservationModal'))?.hide();
        showSuccessModal(lastReservationResult);

        // Rafraîchir
        loadTrajets();
        loadTrajetDetails(selectedTrajet.id);
        selectedSieges = [];
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

function showSuccessModal(data) {
    const r = data.reservation || {};
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

    new bootstrap.Modal(document.getElementById('successModal')).show();
}

function resetReservationForm() {
    selectedSieges = [];
    const input = document.getElementById('reservationPassagers');
    if (input) input.value = 1;
    document.getElementById('reservationTotal').textContent = '0 Ar';
    document.getElementById('passagersForms').innerHTML = '';
    document.getElementById('siegeContainer').innerHTML = '';
}

// =============================================
// 9. TICKET PDF
// =============================================
function downloadTicketPDF() {
    if (!lastReservationResult) {
        showToast('Aucune réservation à exporter', 'warning');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const data = lastReservationResult;
    const r = data.reservation || {};
    const t = data.trajet;

    // En-tête
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
    doc.setFont('helvetica', 'normal');

    let y = 50;
    doc.setFont('helvetica', 'bold');
    doc.text('N° Réservation :', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text((r.id || 'N/A').toString().substring(0, 8).toUpperCase(), 70, y);

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Trajet :', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${t.lieu_depart}  →  ${t.lieu_arrivee}`, 70, y);

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Date départ :', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(
        `${new Date(t.date_depart).toLocaleDateString('fr-FR')}  à  ${t.heure_depart || '—'}`,
        70, y
    );

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Sièges :', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.sieges.sort((a, b) => a - b).join(', '), 70, y);

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Montant total :', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.total.toLocaleString() + ' Ar', 70, y);

    // Passagers
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Passagers', 20, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    data.passagers.forEach((p, i) => {
        y += 9;
        doc.text(
            `${i + 1}. ${p.prenom} ${p.nom}${p.siege ? ' — Siège ' + p.siege : ''}${p.telephone ? ' — ' + p.telephone : ''}`,
            25, y
        );
    });

    // Pied
    y = 270;
    doc.setDrawColor(244, 162, 97);
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Présentez ce ticket (imprimé ou sur mobile) lors de l\'embarquement.', 20, y);
    doc.text('Ny Antsika — contact@nyantsika.mg — +261 34 12 345 67', 20, y + 6);

    const filename = `ticket-nyantsika-${(r.id || Date.now()).toString().substring(0, 8)}.pdf`;
    doc.save(filename);
    showToast('Ticket PDF téléchargé !', 'success');
}

// =============================================
// 10. TOAST & LOGOUT
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
    updateUIForLoggedInUser();
    showToast('Déconnexion réussie', 'info');
    if (selectedTrajet) loadTrajetDetails(selectedTrajet.id);
}