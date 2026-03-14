/**
 * lib/db.js — Upstash Redis (remplace @vercel/kv)
 * Compatible Vercel serverless
 */
const { Redis } = require('@upstash/redis');
const crypto    = require('crypto');

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ── Achats ────────────────────────────────────────────────────────────────────

async function savePurchase({ license_key, driver_id, stripe_pi, email, amount_eur }) {
  const key  = `purchase:${license_key}:${driver_id}`;
  const data = {
    license_key, driver_id, stripe_pi,
    email, amount_eur,
    paid_at: new Date().toISOString(),
  };
  await redis.set(key, JSON.stringify(data));
  await redis.sadd(`purchases:${license_key}`, driver_id);
  return data;
}

async function hasPurchased(license_key, driver_id) {
  const val = await redis.get(`purchase:${license_key}:${driver_id}`);
  return !!val;
}

async function getPurchases(license_key) {
  const driverIds = await redis.smembers(`purchases:${license_key}`);
  if (!driverIds?.length) return [];
  const results = [];
  for (const did of driverIds) {
    const p = await redis.get(`purchase:${license_key}:${did}`);
    if (p) results.push(typeof p === 'string' ? JSON.parse(p) : p);
  }
  return results;
}

// ── Tokens de téléchargement ──────────────────────────────────────────────────

async function createDownloadToken(license_key, driver_id) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data    = { license_key, driver_id, expires, used_files: [] };
  await redis.set(`dltoken:${token}`, JSON.stringify(data), { ex: 3600 });
  return token;
}

async function getDownloadToken(token) {
  const raw = await redis.get(`dltoken:${token}`);
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data.expires < Math.floor(Date.now() / 1000)) return null;
  return data;
}

async function markFileDownloaded(token, filename) {
  const data = await getDownloadToken(token);
  if (!data) return false;
  if (data.used_files.includes(filename)) return false;
  data.used_files.push(filename);
  const remaining = data.expires - Math.floor(Date.now() / 1000);
  await redis.set(`dltoken:${token}`, JSON.stringify(data), { ex: Math.max(remaining, 1) });
  return true;
}

module.exports = { savePurchase, hasPurchased, getPurchases, createDownloadToken, getDownloadToken, markFileDownloaded };