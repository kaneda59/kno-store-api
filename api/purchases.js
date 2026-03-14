const { getPurchases } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { license_key } = req.query;
  if (!license_key) return res.status(400).json({ error: 'license_key required' });

  const purchases = await getPurchases(license_key);
  res.json({ purchases });
};
