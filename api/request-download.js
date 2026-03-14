const crypto = require('crypto');
const { hasPurchasedBySession, createDownloadToken } = require('../lib/db');

const FREE_DRIVERS  = ['driver_json_folder'];
const TOKEN_SECRET  = process.env.TOKEN_SECRET || 'kno-store-token-secret-2026';

// ── Token sans Redis pour les drivers gratuits ───────────────────────────────
function createFreeToken(driver_id) {
  const payload = Buffer.from(JSON.stringify({ driver_id, free: true, ts: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex').slice(0, 16);
  return `free.${payload}.${sig}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    req.on('error', reject);
  });
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body       = await readBody(req);
  const driver_id  = body.driver_id;
  const session_id = body.session_id;

  if (!driver_id) return res.status(400).json({ error: 'driver_id requis.' });

  try {
    if (FREE_DRIVERS.includes(driver_id)) {
      // Driver gratuit → token autonome, pas de Redis
      const token = createFreeToken(driver_id);
      return res.json({ token, driver_id, expires_in: 3600 });
    }

    if (!session_id) {
      return res.status(403).json({ error: 'Non autorisé.', checkout_needed: true });
    }

    const authorized = await hasPurchasedBySession(session_id, driver_id);
    if (!authorized) {
      return res.status(403).json({ error: 'Achat non trouvé.', checkout_needed: true });
    }

    const token = await createDownloadToken(session_id, driver_id);
    return res.json({ token, driver_id, expires_in: 3600 });

  } catch(e) {
    console.error('[request-download]', e.message);
    return res.status(500).json({ error: e.message });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;