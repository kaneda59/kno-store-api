const Stripe           = require('stripe');
const { fetchRegistry } = require('../lib/github');
const { hasPurchased }  = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { driver_id, license_key, lang = 'fr' } = req.body;
  if (!driver_id || !license_key) {
    return res.status(400).json({ error: 'driver_id and license_key required' });
  }

  try {
    const stripe   = Stripe(process.env.STRIPE_SECRET);
    const registry = await fetchRegistry();
    const driver   = registry.drivers.find(d => d.id === driver_id);
    if (!driver)             return res.status(404).json({ error: 'Driver not found' });
    if (driver.free)         return res.status(400).json({ error: 'This driver is free' });
    if (await hasPurchased(license_key, driver_id)) {
      return res.status(400).json({ error: 'Already purchased' });
    }

    const desc = lang === 'fr' ? driver.description_fr : driver.description_en;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(driver.price_eur * 100),
          product_data: {
            name: `Kno Driver — ${driver.name}`,
            description: desc,
          },
        },
        quantity: 1,
      }],
      metadata: { driver_id, license_key },
      success_url: `${process.env.STORE_URL}?success=1&driver=${driver_id}`,
      cancel_url:  `${process.env.STORE_URL}?canceled=1`,
    });

    res.json({ checkout_url: session.url, session_id: session.id });
  } catch(e) {
    console.error('[checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
};
