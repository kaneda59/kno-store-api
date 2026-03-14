const { fetchRegistry }       = require('../lib/github');
const { hasPurchased, createDownloadToken } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { license_key, driver_id } = req.body;
  if (!license_key || !driver_id) {
    return res.status(400).json({ error: 'license_key and driver_id required' });
  }

  try {
    const registry   = await fetchRegistry();
    const driver     = registry.drivers.find(d => d.id === driver_id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const authorized = driver.free || await hasPurchased(license_key, driver_id);
    if (!authorized) {
      return res.status(403).json({ error: 'Not purchased', checkout_needed: true });
    }

    const token = await createDownloadToken(license_key, driver_id);
    res.json({ token, expires_in: 3600 });
  } catch(e) {
    console.error('[request-download]', e.message);
    res.status(500).json({ error: e.message });
  }
};
