const { fetchRegistry }                    = require('../lib/github');
const { hasPurchasedBySession, createDownloadToken } = require('../lib/db');

module.exports.config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body      = await readBody(req);
  const driver_id = body.driver_id;
  const session_id = body.session_id;  // Stripe checkout session ID

  if (!driver_id) return res.status(400).json({ error: 'driver_id required' });

  try {
    const registry = await fetchRegistry();
    const driver   = registry.drivers.find(d => d.id === driver_id);
    if (!driver)   return res.status(404).json({ error: 'Driver not found' });

    // Driver gratuit → téléchargement direct sans vérification
    const authorized = driver.free
      || (session_id && await hasPurchasedBySession(session_id, driver_id));

    if (!authorized) {
      return res.status(403).json({ error: 'Not purchased', checkout_needed: true });
    }

    // Utiliser session_id ou 'free' comme identifiant pour le token
    const tokenKey = session_id || `free_${driver_id}`;
    const token = await createDownloadToken(tokenKey, driver_id);
    res.json({ token, expires_in: 3600 });
  } catch(e) {
    console.error('[request-download]', e.message);
    res.status(500).json({ error: e.message });
  }
};