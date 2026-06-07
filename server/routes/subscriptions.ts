import { Router } from 'express';
import Stripe from 'stripe';
import { execute, queryOne } from '../../shared/db/client';
import { config } from '../../shared/config';

const stripe = config.liveMode && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
  : null;

export const SUBSCRIPTION_TIERS = {
  crew: {
    name: 'Crew Member',
    amount: 499,
    envKey: 'STRIPE_PRICE_CREW_MONTHLY',
    description: 'Unlimited chat, 2x vote weight, AXLE learns your username',
  },
  legend: {
    name: 'Legend',
    amount: 1999,
    envKey: 'STRIPE_PRICE_LEGEND_MONTHLY',
    description: 'Everything in Crew + 5x vote weight + monthly shoutout + name a waypoint',
  },
} as const;

// Auto-create Stripe products/prices on first run if they don't exist
export async function ensureStripeProducts(): Promise<void> {
  if (!config.liveMode || !stripe) {
    console.warn('[Subscriptions] LIVE_MODE/STRIPE_SECRET_KEY missing — skipping product creation');
    return;
  }

  for (const [tier, config] of Object.entries(SUBSCRIPTION_TIERS)) {
    if (process.env[config.envKey]) continue; // already have the price ID

    try {
      const product = await stripe.products.create({
        name: `AXLE ${config.name}`,
        description: config.description,
        metadata: { tier },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.amount,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { tier },
      });

      console.log(`[Subscriptions] Created ${tier} price: ${price.id} ($${config.amount / 100}/mo)`);
      // Note: set this in your .env manually after first run
      console.log(`  → Set ${config.envKey}=${price.id} in .env`);
    } catch (err) {
      console.error(`[Subscriptions] Failed to create ${tier} product:`, err);
    }
  }
}

const router = Router();

// GET /api/subscriptions/tiers
router.get('/tiers', (_req, res) => {
  res.json(
    Object.entries(SUBSCRIPTION_TIERS).map(([tier, config]) => ({
      tier,
      name: config.name,
      amount: config.amount,
      description: config.description,
    }))
  );
});

// POST /api/subscriptions/create — start a subscription for a user
router.post('/create', async (req, res) => {
  try {
    const { tier, email, username } = req.body as {
      tier: keyof typeof SUBSCRIPTION_TIERS;
      email: string;
      username: string;
    };

    const tierConfig = SUBSCRIPTION_TIERS[tier];
    if (!tierConfig) {
      res.status(400).json({ error: 'Invalid tier' });
      return;
    }

    const priceId = process.env[tierConfig.envKey];
    if (!config.liveMode || !stripe || !priceId) {
      res.status(503).json({ error: 'Subscriptions require LIVE_MODE=true plus Stripe key and price ID' });
      return;
    }

    // Get or create Stripe customer
    let user = await queryOne<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM users WHERE email = $1`,
      [email]
    );

    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { username } });
      customerId = customer.id;
      await execute(
        `INSERT INTO users (email, username, stripe_customer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET stripe_customer_id = $3`,
        [email, username, customerId]
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}?subscription=success`,
      cancel_url: `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}?subscription=cancelled`,
      metadata: { tier, username },
    });

    res.json({ sessionUrl: session.url });
  } catch (err) {
    console.error('[Subscriptions] Create error:', err);
    res.status(500).json({ error: 'Failed to create subscription session' });
  }
});

export default router;
