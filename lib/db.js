const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Enregistrer un achat (par session Stripe) ─────────────────────────────
async function recordPurchase(session_id, driver_id) {
  await redis.set(`purchase:${session_id}:${driver_id}`, '1', { ex: 60*60*24*365*5 });
}

// ── Vérifier un achat par session Stripe ─────────────────────────────────
async function hasPurchasedBySession(session_id, driver_id) {
  const val = await redis.get(`purchase:${session_id}:${driver_id}`);
  return val === '1';
}

// ── Rétrocompatibilité ────────────────────────────────────────────────────
async function hasPurchased(identifier, driver_id) {
  if (await hasPurchasedBySession(identifier, driver_id)) return true;
  const val = await redis.get(`purchased:${identifier}:${driver_id}`);
  return val === '1';
}

// ── Créer un token de téléchargement (TTL 1h) ────────────────────────────
async function createDownloadToken(identifier, driver_id) {
  const { randomBytes } = require('crypto');
  const token = randomBytes(24).toString('hex');
  await redis.set(`dltoken:${token}`, JSON.stringify({ identifier, driver_id, files_done: [] }), { ex: 3600 });
  return token;
}

// ── Lire un token SANS le supprimer ──────────────────────────────────────
async function getDownloadToken(token) {
  const data = await redis.get(`dltoken:${token}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

// ── Marquer un fichier comme téléchargé (évite le double download) ───────
async function markFileDownloaded(token, filename) {
  const data = await getDownloadToken(token);
  if (!data) return false;
  if (data.files_done.includes(filename)) return false; // déjà téléchargé
  data.files_done.push(filename);
  // Remettre à jour avec TTL restant (on garde 1h depuis le début)
  await redis.set(`dltoken:${token}`, JSON.stringify(data), { ex: 3600 });
  return true;
}

// ── Consommer un token (usage unique, supprime la clé) ───────────────────
async function consumeDownloadToken(token) {
  const key  = `dltoken:${token}`;
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

module.exports = {
  recordPurchase,
  hasPurchasedBySession,
  hasPurchased,
  createDownloadToken,
  getDownloadToken,
  markFileDownloaded,
  consumeDownloadToken,
};