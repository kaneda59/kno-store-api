const { hasPurchasedBySession, createDownloadToken } = require('../lib/db');

// Drivers gratuits — pas besoin de vérifier GitHub
const FREE_DRIVERS = ['driver_json_folder'];

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
    let authorized = false;

    if (FREE_DRIVERS.includes(driver_id)) {
      // Driver gratuit → toujours autorisé
      authorized = true;
    } else if (session_id) {
      // Driver payant → vérifier l'achat Stripe dans Redis
      authorized = await hasPurchasedBySession(session_id, driver_id);
    }

    if (!authorized) {
      return res.status(403).json({ error: 'Non autorisé.', checkout_needed: true });
    }

    const tokenKey = session_id || `free_${driver_id}_${Date.now()}`;
    const token    = await createDownloadToken(tokenKey, driver_id);
    return res.json({ token, driver_id, expires_in: 3600 });

  } catch(e) {
    console.error('[request-download]', e.message);
    return res.status(500).json({ error: e.message });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;