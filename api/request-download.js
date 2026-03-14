/**
 * api/request-download.js
 * Valide le droit de télécharger un driver et retourne un token.
 * 
 * - Drivers gratuits (free: true) : token immédiat, pas de vérification
 * - Drivers payants : vérifie la session Stripe dans Redis
 */
const { hasPurchasedBySession, createDownloadToken } = require('../lib/db');

// ─── Config Vercel ──────────────────────────────────────────────────────────
module.exports.config = { api: { bodyParser: false } };

// ─── Body parser manuel ─────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    req.on('error', reject);
  });
}

// ─── Registry local (évite l'appel GitHub sur chaque requête) ───────────────
// Ce fichier est mis à jour lors de chaque ajout de driver.
function getRegistry() {
  try {
    return require('../registry.json');
  } catch(e) {
    throw new Error('Registry introuvable — registry.json manquant dans le repo.');
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = await readBody(req);
  } catch(e) {
    return res.status(400).json({ error: 'Body illisible.' });
  }

  const { driver_id, session_id } = body;
  if (!driver_id) return res.status(400).json({ error: 'driver_id requis.' });

  try {
    // Chercher le driver dans le registry local
    const registry = getRegistry();
    const driver   = (registry.drivers || []).find(d => d.id === driver_id);
    if (!driver) return res.status(404).json({ error: `Driver '${driver_id}' introuvable.` });

    // Autorisation
    let authorized = false;

    if (driver.free) {
      // Driver gratuit → toujours autorisé
      authorized = true;
    } else if (session_id) {
      // Driver payant → vérifier la session Stripe dans Redis
      authorized = await hasPurchasedBySession(session_id, driver_id);
    }

    if (!authorized) {
      return res.status(403).json({
        error:            'Non autorisé.',
        checkout_needed:  true,
        message:          session_id
          ? 'Achat non trouvé pour cette session.'
          : 'Session Stripe manquante — veuillez effectuer un achat.',
      });
    }

    // Générer le token de téléchargement (TTL 1h)
    const tokenKey = session_id || `free_${driver_id}_${Date.now()}`;
    const token    = await createDownloadToken(tokenKey, driver_id);

    return res.json({
      token,
      driver_id,
      expires_in: 3600,
    });

  } catch(e) {
    console.error('[request-download] ERROR:', e.message, e.stack);
    return res.status(500).json({
      error:   'Erreur serveur.',
      details: e.message,
    });
  }
};