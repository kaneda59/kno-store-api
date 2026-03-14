const Stripe           = require('stripe');
const { fetchRegistry } = require('../lib/github');
const { hasPurchased }  = require('../lib/db');

// ─── Config Vercel ───────────────────────────────────────────────────────────
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
  const lang      = body.lang || 'fr';

  if (!driver_id) return res.status(400).json({ error: 'driver_id required' });

  try {
    const registry = await fetchRegistry();
    const driver   = registry.drivers.find(d => d.id === driver_id);
    if (!driver)   return res.status(404).json({ error: 'Driver not found' });
    if (driver.free) return res.status(400).json({ error: 'Driver is free, no checkout needed' });

    const stripe       = Stripe(process.env.STRIPE_SECRET);
    const storeUrl     = process.env.STORE_URL || 'https://kno.fdevelopment.eu/kno/store.html';
    const driverName   = lang === 'fr'
      ? (driver.name_fr || driver.name)
      : driver.name;

    // success_url inclut {CHECKOUT_SESSION_ID} — Stripe le remplace automatiquement
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  Math.round(driver.price_eur * 100),
          product_data: {
            name:        `Kno Driver — ${driverName}`,
            description: lang === 'fr'
              ? `Driver pluggable Kno : ${driver.id}`
              : `Kno pluggable driver: ${driver.id}`,
          },
        },
        quantity: 1,
      }],
      mode:        'payment',
      // Stripe remplace {CHECKOUT_SESSION_ID} par l'ID de session réel
      success_url: `${storeUrl}?session={CHECKOUT_SESSION_ID}&driver=${encodeURIComponent(driver_id)}&purchased=1`,
      cancel_url:  `${storeUrl}?cancelled=1`,
      metadata: {
        driver_id,
        product: 'kno_driver',
      },
    });

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) {
    console.error('[checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
};