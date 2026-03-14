const { fetchRegistry } = require('../lib/github');
const { hasPurchased }  = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const registry    = await fetchRegistry();
    const license_key = req.query.license_key;

    if (license_key) {
      // Enrichir avec le statut d'achat
      for (const driver of registry.drivers) {
        driver.purchased = driver.free || await hasPurchased(license_key, driver.id);
      }
    }
    res.json(registry);
  } catch(e) {
    console.error('[catalog]', e.message);
    res.status(500).json({ error: 'Catalog unavailable', detail: e.message });
  }
};
