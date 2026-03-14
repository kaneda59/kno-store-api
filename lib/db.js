/**
 * lib/db.js — SQLite via @vercel/postgres ou better-sqlite3
 * Sur Vercel, on utilise une DB externe. 
 * Option gratuite : Vercel KV (Redis) ou Vercel Postgres (PostgreSQL).
 * Ici on utilise Vercel KV (clé/valeur) pour les achats et tokens.
 */
const { kv } = require('@vercel/kv');

// ── Achats ────────────────────────────────────────────────────────────────────

/**
 * Enregistre un achat après paiement Stripe confirmé.
 */
async function savePurchase({ license_key, driver_id, stripe_pi, email, amount_eur }) {
  const key  = `purchase:${license_key}:${driver_id}`;
  const data = {
    license_key, driver_id, stripe_pi,
    email, amount_eur,
    paid_at: new Date().toISOString(),
  };
  await kv.set(key, JSON.stringify(data));
  // Index par license_key pour lister les achats
  await kv.sadd(`purchases:${license_key}`, driver_id);
  return data;
}

/**
 * Vérifie si un achat existe pour cette licence + driver.
 */
async function hasPurchased(license_key, driver_id) {
  const val = await kv.get(`purchase:${license_key}:${driver_id}`);
  return !!val;
}

/**
 * Liste tous les drivers achetés pour une licence.
 */
async function getPurchases(license_key) {
  const driverIds = await kv.smembers(`purchases:${license_key}`);
  if (!driverIds?.length) return [];
  const results = [];
  for (const did of driverIds) {
    const p = await kv.get(`purchase:${license_key}:${did}`);
    if (p) results.push(typeof p === 'string' ? JSON.parse(p) : p);
  }
  return results;
}

// ── Tokens de téléchargement ──────────────────────────────────────────────────

const crypto = require('crypto');

/**
 * Crée un token de téléchargement usage unique, TTL 1h.
 */
async function createDownloadToken(license_key, driver_id) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data    = { license_key, driver_id, expires, used_files: [] };
  await kv.set(`dltoken:${token}`, JSON.stringify(data), { ex: 3600 });
  return token;
}

/**
 * Récupère et valide un token. Retourne null si invalide/expiré.
 */
async function getDownloadToken(token) {
  const raw = await kv.get(`dltoken:${token}`);
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data.expires < Math.floor(Date.now() / 1000)) return null;
  return data;
}

/**
 * Marque un fichier comme téléchargé pour ce token.
 */
async function markFileDownloaded(token, filename) {
  const data = await getDownloadToken(token);
  if (!data) return false;
  if (data.used_files.includes(filename)) return false; // déjà téléchargé
  data.used_files.push(filename);
  const remaining = data.expires - Math.floor(Date.now() / 1000);
  await kv.set(`dltoken:${token}`, JSON.stringify(data), { ex: Math.max(remaining, 1) });
  return true;
}

module.exports = { savePurchase, hasPurchased, getPurchases, createDownloadToken, getDownloadToken, markFileDownloaded };
