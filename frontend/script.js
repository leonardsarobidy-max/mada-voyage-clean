// =============================================
// SCRIPT.JS - NY ANTSIKA (page d'accueil)
// Auth + UI uniquement — trajets/historique → reservations.html
// =============================================

const API_URL = window.location.origin + '/api';

let currentUser = null;
let currentToken = null;

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
        if (currentUser.role === 'admin') {
            document.getElementById('adminNav')?.classList.remove('d-none');
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
// 2. DÉCONNEXION
// =============================================

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    currentToken = null;
    window.location.reload();
});

// =============================================
// 3. MODALES
// =============================================

document.getElementById('loginBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    new bootstrap.Modal(document.getElementById('loginModal')).show();
});

document.getElementById('registerBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
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
            bootstrap.Modal.getInstance(document.getElementById('registerModal'))?.hide();
            document.getElementById('registerForm').reset();
            document.getElementById('registerError').textContent = '';
            new bootstrap.Modal(document.getElementById('loginModal')).show();
        } else {
            document.getElementById('registerError').textContent = result.error || 'Erreur';
        }
    } catch (error) {
        document.getElementById('registerError').textContent = 'Erreur de connexion au serveur';
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
            bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
            document.getElementById('loginForm').reset();
            document.getElementById('loginError').textContent = '';
            updateUI();
            if (currentUser.role === 'admin') {
                document.getElementById('adminNav')?.classList.remove('d-none');
            }
            alert('✅ Connexion réussie !');
        } else {
            document.getElementById('loginError').textContent = result.error || 'Identifiants incorrects';
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Erreur de connexion au serveur';
    }
});

// =============================================
// 6. INITIALISATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});