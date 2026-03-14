const { getPurchases } = require('../lib/db');

// Endpoint non utilisé — conservé pour rétrocompatibilité
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ purchases: [] });
};
