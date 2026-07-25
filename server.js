// =============================================
// SERVER.JS - NY ANTSIKA (version complète)
// Toutes les routes frontend + admin + sièges
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

const supabaseUrl = process.env.SUPABASE_URL || 'https://pmpoettqgndtketbhrpa.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDcyNDIsImV4cCI6MjA5OTEyMzI0Mn0.RAMGtYWwurErKz389xtYnC3fe86AgoBsV_y-dJmhdmg';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0NzI0MiwiZXhwIjoyMDk5MTIzMjQyfQ.l2piVwzjEuuyE8fedyBR7MrF80WWzst9fZ0r9xjLlbI';

const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

console.log('✅ Supabase connecté');

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// =============================================
// MIDDLEWARES
// =============================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, error: 'Token expiré' });
        }
        return res.status(401).json({ success: false, error: 'Token invalide' });
    }
}

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
// AUTH
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

        const hashedPassword = await bcrypt.hash(password, 10);

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
// CLIENT
// =============================================

app.get('/api/client/test', (req, res) => {
    res.json({ success: true, message: '✅ Route client fonctionne !' });
});

// Liste des trajets
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

// Recherche de trajets
app.get('/api/client/recherche', async (req, res) => {
    try {
        const { lieu_depart, lieu_arrivee, date_depart, passagers } = req.query;

        let query = supabaseAdmin
            .from('trajets')
            .select('*')
            .eq('disponible', true)
            .gte('date_depart', new Date().toISOString().split('T')[0]);

        if (lieu_depart) query = query.ilike('lieu_depart', `%${lieu_depart}%`);
        if (lieu_arrivee) query = query.ilike('lieu_arrivee', `%${lieu_arrivee}%`);
        if (date_depart) query = query.eq('date_depart', date_depart);
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

// Détail d'un trajet
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

// Sièges d'un trajet
app.get('/api/client/trajets/:id/sieges', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('sieges')
            .select('*')
            .eq('trajet_id', req.params.id)
            .order('numero', { ascending: true });

        if (error) {
            console.warn('Sièges non disponibles:', error.message);
            return res.json({ success: true, data: [] });
        }

        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Créer une réservation
app.post('/api/client/reserver', requireAuth, [
    body('trajet_id').notEmpty(),
    body('nombre_passagers').isInt({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const {
            trajet_id,
            nombre_passagers,
            siege_ids,
            passagers_details,
            contact_telephone,
            contact_email
        } = req.body;

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
        const siegesStr = Array.isArray(siege_ids)
            ? siege_ids.join(',')
            : (siege_ids || null);

        const { data: reservation, error: resError } = await supabaseAdmin
            .from('reservations')
            .insert([{
                user_id: req.user.id,
                trajet_id,
                nombre_passagers,
                siege_ids: siegesStr,
                montant_total,
                statut: 'en_attente',
                passagers_details: passagers_details || null,
                contact_telephone: contact_telephone || null,
                contact_email: contact_email || null,
                date_reservation: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (resError) {
            console.error('Erreur réservation:', resError);
            return res.status(500).json({ success: false, error: 'Erreur lors de la réservation' });
        }

        // Décrémenter les places
        await supabaseAdmin
            .from('trajets')
            .update({ places_disponibles: trajet.places_disponibles - nombre_passagers })
            .eq('id', trajet_id);

        // Marquer les sièges comme réservés
        if (Array.isArray(siege_ids) && siege_ids.length > 0) {
            await supabaseAdmin
                .from('sieges')
                .update({ statut: 'reserve' })
                .eq('trajet_id', trajet_id)
                .in('numero', siege_ids);
        }

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

// Historique client
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
// ADMIN
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

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: monthlyCount } = await supabaseAdmin
            .from('reservations')
            .select('*', { count: 'exact', head: true })
            .gte('date_reservation', startOfMonth.toISOString());

        res.json({
            success: true,
            users: usersCount || 0,
            reservations: reservationsCount || 0,
            trajetsDisponibles: trajetsCount || 0,
            reservationsEnAttente: pendingCount || 0,
            monthlyReservations: monthlyCount || 0,
            revenue
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Trajets CRUD ---
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

app.get('/api/admin/trajets/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('trajets')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Trajet non trouvé' });
        }
        res.json({ success: true, data });
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

        const total = places_totales || places_disponibles || 40;

        const { data, error } = await supabaseAdmin
            .from('trajets')
            .insert([{
                lieu_depart,
                lieu_arrivee,
                date_depart,
                heure_depart: heure_depart || '08:00',
                prix,
                places_totales: total,
                places_disponibles: places_disponibles ?? total,
                region: region || null,
                vehicule_id: vehicule_id || null,
                description: description || null,
                disponible: true,
                created_at: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (error) throw error;

        // Générer les sièges
        if (data?.id && data.places_totales) {
            try {
                await supabaseAdmin.rpc('generer_sieges_trajet', {
                    p_trajet_id: data.id,
                    p_places: data.places_totales
                });
            } catch (e) {
                console.warn('Génération sièges:', e.message);
            }
        }

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

// --- Réservations admin ---
app.get('/api/admin/reservations', requireAuth, requireAdmin, async (req, res) => {
    try {
        let query = supabaseAdmin
            .from('reservations')
            .select('*, trajets(*), users(id, nom, prenom, email)')
            .order('date_reservation', { ascending: false });

        const { statut, date_debut, date_fin } = req.query;
        if (statut) query = query.eq('statut', statut);
        if (date_debut) query = query.gte('date_reservation', date_debut);
        if (date_fin) query = query.lte('date_reservation', date_fin + 'T23:59:59');

        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/reservations/:id/confirmer', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .update({ statut: 'confirmée', updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;

        if (data?.siege_ids && data?.trajet_id) {
            const nums = String(data.siege_ids)
                .split(',')
                .map(n => parseInt(n.trim()))
                .filter(Boolean);
            if (nums.length) {
                await supabaseAdmin
                    .from('sieges')
                    .update({ statut: 'occupe' })
                    .eq('trajet_id', data.trajet_id)
                    .in('numero', nums);
            }
        }

        res.json({ success: true, message: 'Réservation confirmée', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/reservations/:id/annuler', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data: old } = await supabaseAdmin
            .from('reservations')
            .select('*')
            .eq('id', req.params.id)
            .single();

        const { data, error } = await supabaseAdmin
            .from('reservations')
            .update({ statut: 'annulée', updated_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .select('*')
            .single();

        if (error) throw error;

        if (old) {
            const { data: trajet } = await supabaseAdmin
                .from('trajets')
                .select('places_disponibles')
                .eq('id', old.trajet_id)
                .single();

            if (trajet) {
                await supabaseAdmin
                    .from('trajets')
                    .update({
                        places_disponibles: (trajet.places_disponibles || 0) + (old.nombre_passagers || 0)
                    })
                    .eq('id', old.trajet_id);
            }

            if (old.siege_ids) {
                const nums = String(old.siege_ids)
                    .split(',')
                    .map(n => parseInt(n.trim()))
                    .filter(Boolean);
                if (nums.length) {
                    await supabaseAdmin
                        .from('sieges')
                        .update({ statut: 'disponible' })
                        .eq('trajet_id', old.trajet_id)
                        .in('numero', nums);
                }
            }
        }

        res.json({ success: true, message: 'Réservation annulée', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export CSV réservations
app.get('/api/admin/export/reservations', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('reservations')
            .select('*, trajets(lieu_depart, lieu_arrivee, date_depart), users(nom, prenom, email)')
            .order('date_reservation', { ascending: false });

        if (error) throw error;

        const rows = data || [];
        const header = 'id;client;email;depart;arrivee;date_depart;passagers;montant_total;statut\n';
        const csv = '\uFEFF' + header + rows.map(r => [
            r.id,
            `${r.users?.nom || ''} ${r.users?.prenom || ''}`.trim(),
            r.users?.email || '',
            r.trajets?.lieu_depart || '',
            r.trajets?.lieu_arrivee || '',
            r.trajets?.date_depart || '',
            r.nombre_passagers,
            r.montant_total,
            r.statut
        ].join(';')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Véhicules ---
app.get('/api/admin/vehicules', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('vehicules')
            .select('*')
            .order('created_at', { ascending: false });
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

app.put('/api/admin/vehicules/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('vehicules')
            .update(req.body)
            .eq('id', req.params.id)
            .select('*')
            .single();
        if (error) throw error;
        res.json({ success: true, message: 'Véhicule mis à jour', data });
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

// --- Coopératives ---
app.get('/api/admin/cooperatives', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('cooperatives')
            .select('*')
            .order('created_at', { ascending: false });
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
                nom,
                telephone: telephone || null,
                email: email || null,
                adresse: adresse || null,
                created_at: new Date().toISOString()
            }])
            .select('*')
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, message: 'Coopérative ajoutée', data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/cooperatives/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('cooperatives')
            .update(req.body)
            .eq('id', req.params.id)
            .select('*')
            .single();
        if (error) throw error;
        res.json({ success: true, message: 'Coopérative mise à jour', data });
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

// --- Utilisateurs ---
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { search, role } = req.query;

        let query = supabaseAdmin
            .from('users')
            .select('id, email, nom, prenom, telephone, role, status, created_at');

        if (role) query = query.eq('role', role);
        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { role, status, nom, prenom, telephone, password } = req.body;
        const updateData = { updated_at: new Date().toISOString() };
        if (role) updateData.role = role;
        if (status) updateData.status = status;
        if (nom) updateData.nom = nom;
        if (prenom) updateData.prenom = prenom;
        if (telephone !== undefined) updateData.telephone = telephone;
        if (password) updateData.password = await bcrypt.hash(password, 10);

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
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', req.params.id)
            .single();

        if (user?.role === 'admin') {
            const { count } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('role', 'admin');
            if ((count || 0) <= 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Impossible de supprimer le dernier administrateur'
                });
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
// SANTÉ / TEST
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
// FRONTEND STATIQUE
// =============================================

app.use(express.static(path.join(__dirname, 'frontend')));

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
// 404 / 500
// =============================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.originalUrl
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Erreur:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur serveur',
        message: err.message || 'Une erreur est survenue'
    });
});

// =============================================
// DÉMARRAGE
// =============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
});

module.exports = app;