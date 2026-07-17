// =============================================
// SERVER.JS - VERSION COMPLÈTE (Sans imports de routes)
// Toutes les routes utilisées par le frontend sont incluses ici.
// =============================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();

// =============================================
// CONNEXION SUPABASE
// =============================================

const { createClient } = require('@supabase/supabase-js');

// ✅ Variables d'environnement en priorité, avec vos clés en secours
// (si les variables ne sont pas configurées sur Vercel, ces valeurs sont utilisées)
const supabaseUrl = process.env.SUPABASE_URL || 'https://pmpoettqgndtketbhrpa.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDcyNDIsImV4cCI6MjA5OTEyMzI0Mn0.RAMGtYWwurErKz389xtYnC3fe86AgoBsV_y-dJmhdmg';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0NzI0MiwiZXhwIjoyMDk5MTIzMjQyfQ.l2piVwzjEuuyE8fedyBR7MrF80WWzst9fZ0r9xjLlbI';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables Supabase manquantes');
}

// Client public (respecte le RLS) — utilisé pour les lectures classiques
const supabase = createClient(supabaseUrl, supabaseKey);

// Client admin (contourne le RLS) — utilisé pour l'inscription et les routes admin,
// pour éviter les blocages liés aux policies RLS mal configurées
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

console.log('✅ Supabase connecté');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// =============================================
// MIDDLEWARES GLOBAUX
// =============================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =============================================
// MIDDLEWARE D'AUTHENTIFICATION (JWT)
// =============================================

function requireAuth(req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Non authentifié',
            message: 'Un token Bearer est requis'
        });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, email, role }
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expiré' });
        }
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
}

// =============================================
// MIDDLEWARE ADMIN (à utiliser APRÈS requireAuth)
// =============================================

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Accès refusé',
            message: 'Rôle administrateur requis'
        });
    }
    next();
}

// =============================================
// ROUTES AUTH
// =============================================

app.get('/api/auth/test', (req, res) => {
    res.json({ success: true, message: '✅ Route auth fonctionne !' });
});

app.post('/api/auth/register', [
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('nom').notEmpty(),
    body('prenom').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { email, password, nom, prenom, telephone } = req.body;

        const { data: existing } = await supabaseAdmin
            .from('users')
            .select('id, email')
            .eq('email', email)
            .single();

        if (existing) {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .insert([{
                email,
                password: hashedPassword,
                nom,
                prenom,
                telephone: telephone || null,
                role: 'client',
                status: 'actif',
                created_at: new Date().toISOString()
            }])
            .select('id, email, nom, prenom, telephone, role, created_at')
            .single();

        if (error) {
            console.error('Erreur inscription:', error);
            return res.status(500).json({ success: false, error: 'Erreur inscription' });
        }

        res.status(201).json({ success: true, message: 'Inscription réussie', user });
    } catch (error) {
        console.error('Erreur inscription:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', [
    body('email').isEmail(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { email, password } = req.body;

        const { data: user } = await supabaseAdmin
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (!user) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
        }

        if (user.status === 'suspendu' || user.status === 'inactif') {
            return res.status(403).json({ success: false, error: 'Compte inactif' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const { password: _, ...userData } = user;
        res.json({ success: true, message: 'Connexion réussie', token, user: userData });
    } catch (error) {
        console.error('Erreur connexion:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ROUTES CLIENT
// =============================================

app.get('/api/client/test', (req, res) => {
    res.json({ success: true, message: '✅ Route client fonctionne !' });
});

// --- Liste des trajets disponibles ---
app.get('/api/client/trajets', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('trajets')
            .select('*')
            .eq('disponible', true)
            .gte('date_depart', new Date().toISOString().split('T')[0])
            .order('date_depart', { ascending: true });

        if (error) {
            return res.status(500).json({ success: false, error: 'Erreur récupération trajets' });
        }

        res.json({ success: true, data: data || [], count: data?.length || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Recherche de trajets (filtres) ---
app.get('/api/client/recherche', async (req, res) => {
    try {
        const {
            lieu_depart,
            lieu_arrivee,
            date_depart,
            passagers,
            region,
            prix_min,
            prix_max
        } = req.query;

        let query = supabase
            .from('trajets')
            .select('*')
            .eq('disponible', true)
            .gte('date_depart', new Date().toISOString().split('T')[0]);

        if (lieu_depart) query = query.ilike('lieu_depart', `%${lieu_depart}%`);
        if (lieu_arrivee) query = query.ilike('lieu_arrivee', `%${lieu_arrivee}%`);
        if (region) query = query.or(`region_depart.ilike.%${region}%,region_arrivee.ilike.%${region}%`);
        if (date_depart) query = query.eq('date_depart', date_depart);
        if (prix_min) query = query.gte('prix', parseFloat(prix_min));
        if (prix_max) query = query.lte('prix', parseFloat(prix_max));
        if (passagers) query = query.gte('places_disponibles', parseInt(passagers));

        const { data, error } = await query
            .order('date_depart', { ascending: true })
            .order('prix', { ascending: true });

        if (error) {
            console.error('Erreur recherche:', error);
            return res.status(500).json({ success: false, error: 'Erreur lors de la recherche' });
        }

        res.json({ success: true, data: data || [], count: data?.length || 0 });
    } catch (error) {
        console.error('Erreur recherche:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Détails d'un trajet (retourne l'objet brut, pas de wrapper) ---
app.get('/api/client/trajets/:id', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('trajets')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Trajet non trouvé' });
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Créer une réservation (authentifié) ---
app.post('/api/client/reserver', requireAuth, [
    body('trajet_id').notEmpty(),
    body('nombre_passagers').isInt({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { trajet_id, nombre_passagers, siege_ids } = req.body;

        // Vérifier le trajet et sa disponibilité
        const { data: trajet, error: trajetError } = await supabaseAdmin
            .from('trajets')
            .select('*')
            .eq('id', trajet_id)
            .single();

        if (trajetError || !trajet) {
            return res.status(404).json({ success: false, error: 'Trajet non trouvé' });
        }

        if (!trajet.disponible || trajet.places_disponibles < nombre_passagers) {
            return res.status(400).json({
                success: false,
                error: 'Places insuffisantes pour ce trajet'
            });
        }

        const montant_total = trajet.prix * nombre_passagers;

        const { data: reservation, error: resError } = await supabaseAdmin
            .from('reservations')
            .insert([{
                user_id: req.user.id,
                trajet_id,
                nombre_passagers,
                siege_ids: siege_ids || null,
                montant_total,
                statut: 'en_attente',
                date_reservation: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (resError) {
            console.error('Erreur réservation:', resError);
            return res.status(500).json({ success: false, error: 'Erreur lors de la réservation' });
        }

        // Mettre à jour les places disponibles
        await supabaseAdmin
            .from('trajets')
            .update({ places_disponibles: trajet.places_disponibles - nombre_passagers })
            .eq('id', trajet_id);

        res.status(201).json({
            success: true,
            message: 'Réservation effectuée avec succès',
            reservation
        });
    } catch (error) {
        console.error('Erreur réservation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Historique des réservations du client connecté ---
app.get('/api/client/historique', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .select('*, trajets(*)')
            .eq('user_id', req.user.id)
            .order('date_reservation', { ascending: false });

        if (error) {
            console.error('Erreur historique:', error);
            return res.status(500).json({ success: false, error: 'Erreur récupération historique' });
        }

        res.json({ success: true, data: data || [], count: data?.length || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ROUTES ADMIN (protégées par requireAuth + requireAdmin)
// =============================================

app.get('/api/admin/test', (req, res) => {
    res.json({ success: true, message: '✅ Route admin fonctionne !' });
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { count: usersCount } = await supabaseAdmin
            .from('users').select('*', { count: 'exact', head: true });

        const { count: reservationsCount } = await supabaseAdmin
            .from('reservations').select('*', { count: 'exact', head: true });

        const { count: trajetsCount } = await supabaseAdmin
            .from('trajets').select('*', { count: 'exact', head: true })
            .eq('disponible', true)
            .gte('date_depart', new Date().toISOString().split('T')[0]);

        const { count: pendingCount } = await supabaseAdmin
            .from('reservations').select('*', { count: 'exact', head: true })
            .eq('statut', 'en_attente');

        const { data: revenueData } = await supabaseAdmin
            .from('reservations').select('montant_total').eq('statut', 'confirmée');

        const revenue = revenueData?.reduce((sum, r) => sum + (r.montant_total || 0), 0) || 0;

        res.json({
            success: true,
            users: usersCount || 0,
            reservations: reservationsCount || 0,
            trajetsDisponibles: trajetsCount || 0,
            reservationsEnAttente: pendingCount || 0,
            revenue
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Trajets (CRUD) ---
app.get('/api/admin/trajets', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('trajets')
            .select('*')
            .order('date_depart', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/trajets', requireAuth, requireAdmin, async (req, res) => {
    try {
        const {
            lieu_depart, lieu_arrivee, date_depart, heure_depart,
            prix, places_totales, places_disponibles, region,
            vehicule_id, description
        } = req.body;

        if (!lieu_depart || !lieu_arrivee || !date_depart || !prix) {
            return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
        }

        const { data, error } = await supabaseAdmin
            .from('trajets')
            .insert([{
                lieu_depart, lieu_arrivee, date_depart,
                heure_depart: heure_depart || '08:00',
                prix, places_totales,
                places_disponibles: places_disponibles ?? places_totales,
                region: region || null,
                vehicule_id: vehicule_id || null,
                description: description || null,
                disponible: true,
                created_at: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Trajet créé', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/trajets/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('trajets')
            .update({ ...req.body, updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Trajet mis à jour', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/trajets/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('trajets').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Trajet supprimé' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Réservations (admin) ---
app.get('/api/admin/reservations', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .select('*, trajets(*), users(id, nom, prenom, email)')
            .order('date_reservation', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/reservations/:id/annuler', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .update({ statut: 'annulée', updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Réservation annulée', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Export réservations (CSV) ---
app.get('/api/admin/export/reservations', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .select('*, trajets(lieu_depart, lieu_arrivee, date_depart), users(nom, prenom, email)')
            .order('date_reservation', { ascending: false });

        if (error) throw error;

        const rows = data || [];
        const header = 'id,client,email,depart,arrivee,date_depart,passagers,montant_total,statut\n';
        const csv = header + rows.map(r => [
            r.id,
            `${r.users?.nom || ''} ${r.users?.prenom || ''}`.trim(),
            r.users?.email || '',
            r.trajets?.lieu_depart || '',
            r.trajets?.lieu_arrivee || '',
            r.trajets?.date_depart || '',
            r.nombre_passagers,
            r.montant_total,
            r.statut
        ].join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Véhicules (CRUD) ---
app.get('/api/admin/vehicules', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('vehicules').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/vehicules', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { marque, modele, capacite, immatriculation, cooperative_id } = req.body;

        if (!marque || !modele || !capacite || !immatriculation) {
            return res.status(400).json({ success: false, error: 'Champs obligatoires manquants' });
        }

        const { data, error } = await supabaseAdmin
            .from('vehicules')
            .insert([{
                marque, modele, capacite, immatriculation,
                cooperative_id: cooperative_id || null,
                created_at: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Véhicule ajouté', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/vehicules/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('vehicules').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Véhicule supprimé' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Coopératives (CRUD) ---
app.get('/api/admin/cooperatives', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin.from('cooperatives').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/cooperatives', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { nom, telephone, email, adresse } = req.body;

        if (!nom) {
            return res.status(400).json({ success: false, error: 'Le nom est obligatoire' });
        }

        const { data, error } = await supabaseAdmin
            .from('cooperatives')
            .insert([{
                nom, telephone: telephone || null, email: email || null,
                adresse: adresse || null, created_at: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Coopérative ajoutée', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/cooperatives/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabaseAdmin.from('cooperatives').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Coopérative supprimée' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Utilisateurs (liste + suppression) ---
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { search, role } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('id, email, nom, prenom, telephone, role, status, created_at');

        if (role) query = query.eq('role', role);
        if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,email.ilike.%${search}%`);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { role, status, nom, prenom, telephone } = req.body;
        const updateData = { updated_at: new Date().toISOString() };
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (nom) updateData.nom = nom;
        if (prenom) updateData.prenom = prenom;
        if (telephone !== undefined) updateData.telephone = telephone;

        const { data, error } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', req.params.id)
            .select('id, email, nom, prenom, telephone, role, status')
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Utilisateur mis à jour', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Empêcher la suppression du dernier admin
        const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', req.params.id).single();

        if (user?.role === 'admin') {
            const { count } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin');
            if ((count || 0) <= 1) {
                return res.status(400).json({ success: false, error: 'Impossible de supprimer le dernier administrateur' });
            }
        }

        const { error } = await supabaseAdmin.from('users').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Utilisateur supprimé' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ROUTES DE TEST / SANTÉ
// =============================================

app.get('/test', (req, res) => {
    res.json({ success: true, message: '✅ Le serveur fonctionne !' });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: '✅ OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// =============================================
// FRONTEND (fichiers statiques : css, js, images...)
// =============================================

app.use(express.static(path.join(__dirname, 'frontend')));

// =============================================
// FRONTEND (Pages HTML)
// =============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('/reservations.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'reservations.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'admin-dashboard.html'));
});

// =============================================
// GESTION 404
// =============================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.originalUrl
    });
});

// =============================================
// GESTION 500
// =============================================

app.use((err, req, res, next) => {
    console.error('❌ Erreur:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur serveur',
        message: err.message || 'Une erreur est survenue'
    });
});

// =============================================
// EXPORTATION
// =============================================

// =============================================
// DÉMARRAGE DU SERVEUR (nécessaire pour Render / hébergement classique)
// =============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
});

module.exports = app;
