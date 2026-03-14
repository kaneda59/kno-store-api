const Stripe = require('stripe');
const { recordPurchase } = require('../lib/db');

// Webhook Stripe — pas de body parser (besoin du raw body pour vérifier la signature)
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe    = Stripe(process.env.STRIPE_SECRET);
  const rawBody   = await readRawBody(req);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK);
  } catch(e) {
    console.error('[webhook] signature error:', e.message);
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const driver_id = session.metadata?.driver_id;
    const sid       = session.id;  // cs_live_xxx ou cs_test_xxx

    if (driver_id && sid) {
      // Stocker l'achat avec session_id comme clé (pas besoin de license_key)
      await recordPurchase(sid, driver_id);
      console.log(`[webhook] Purchase recorded: session=${sid} driver=${driver_id}`);
    }
  }

  res.json({ received: true });
};