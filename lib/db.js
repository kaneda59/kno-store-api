const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Enregistrer un achat par session Stripe ───────────────────────────────────
async function recordPurchase(session_id, driver_id) {
  const key = `purchase:${session_id}:${driver_id}`;
  await redis.set(key, '1', { ex: 60 * 60 * 24 * 365 * 5 }); // 5 ans
}

// ── Vérifier un achat par session Stripe ──────────────────────────────────────
async function hasPurchasedBySession(session_id, driver_id) {
  const key = `purchase:${session_id}:${driver_id}`;
  const val = await redis.get(key);
  return val === '1';
}

// ── Rétrocompatibilité : achat par license_key (ancien système) ───────────────
async function hasPurchased(identifier, driver_id) {
  // Essayer d'abord comme session_id, puis comme license_key
  const bySession = await hasPurchasedBySession(identifier, driver_id);
  if (bySession) return true;
  // Ancien format (license_key)
  const oldKey = `purchased:${identifier}:${driver_id}`;
  const val = await redis.get(oldKey);
  return val === '1';
}

// ── Créer un token de téléchargement (usage unique, TTL 1h) ───────────────────
async function createDownloadToken(identifier, driver_id) {
  const { randomBytes } = require('crypto');
  const token = randomBytes(24).toString('hex');
  const key   = `dltoken:${token}`;
  await redis.set(key, JSON.stringify({ identifier, driver_id }), { ex: 3600 });
  return token;
}

// ── Consommer un token (usage unique) ────────────────────────────────────────
async function consumeDownloadToken(token) {
  const key  = `dltoken:${token}`;
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

module.exports = { recordPurchase, hasPurchasedBySession, hasPurchased, createDownloadToken, consumeDownloadToken };