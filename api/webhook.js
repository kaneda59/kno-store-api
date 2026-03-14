const Stripe          = require('stripe');
const { savePurchase } = require('../lib/db');

// Vercel : désactiver le bodyParser pour recevoir le raw body Stripe
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = Stripe(process.env.STRIPE_SECRET);
  const sig    = req.headers['stripe-signature'];
  const body   = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK);
  } catch(e) {
    console.error('[webhook] Signature invalide:', e.message);
    return res.status(400).send(`Webhook error: ${e.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object;
    const driver_id = session.metadata?.driver_id;
    const lic       = session.metadata?.license_key;
    const email     = session.customer_details?.email;
    const amount    = (session.amount_total || 0) / 100;

    if (driver_id && lic) {
      await savePurchase({
        license_key: lic,
        driver_id,
        stripe_pi:  session.payment_intent,
        email,
        amount_eur: amount,
      });
      console.log(`[webhook] Achat enregistré: ${driver_id} pour ${lic} (${email})`);
    }
  }

  res.json({ received: true });
};
