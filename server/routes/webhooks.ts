import { Router } from 'express';
import Stripe from 'stripe';
import { execute, queryOne } from '../../shared/db/client';
import { executeTipAction, TIP_TIERS } from './tips';
import { config } from '../../shared/config';

const stripe = config.liveMode && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
  : null;

type TipAction = typeof TIP_TIERS[number]['action'];

const router = Router();

// POST /api/webhooks/stripe — Stripe sends events here
// Must use express.raw() middleware for signature verification
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;

  if (webhookSecret && sig && stripe) {
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err);
      res.status(400).send('Webhook signature verification failed');
      return;
    }
  } else {
    // Dev mode: accept unsigned events
    try {
      event = JSON.parse((req.body as Buffer).toString()) as any;
    } catch {
      res.status(400).send('Invalid JSON');
      return;
    }
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as any;
        const { username, message, action } = pi.metadata;

        // Update tip record
        await execute(
          `UPDATE tips SET status = 'completed' WHERE stripe_payment_intent_id = $1`,
          [pi.id]
        );

        // Update user total
        if (username) {
          await execute(
            `UPDATE users SET total_tipped_cents = total_tipped_cents + $1 WHERE username = $2`,
            [pi.amount, username]
          );
        }

        // Execute tip side effect
        if (action && action !== 'none') {
          await executeTipAction(
            action as TipAction,
            username ?? 'viewer',
            message ?? null,
            pi.amount
          );
        }
        console.log(`[Webhook] Payment ${pi.id} succeeded — action: ${action}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as { id: string; customer: string; status: string; metadata: Record<string, string> };
        const customerId = sub.customer as string;
        const tier = sub.metadata?.tier ?? 'crew';
        const isActive = sub.status === 'active' || sub.status === 'trialing';

        await execute(
          `UPDATE users SET subscription_tier = $1, subscription_active = $2
           WHERE stripe_customer_id = $3`,
          [tier, isActive, customerId]
        );

        // AXLE learns the username (store as memory)
        const user = await queryOne<{ username: string | null }>(
          `SELECT username FROM users WHERE stripe_customer_id = $1`,
          [customerId]
        );
        if (user?.username && isActive) {
          const { storeViewerMemory } = await import('../../services/ai/memory');
          // Get active trip_id
          const { getRiderState } = await import('../../shared/redis/client');
          const state = await getRiderState();
          if (state?.trip_id) {
            await storeViewerMemory(
              state.trip_id,
              user.username,
              `${user.username} is a ${tier} subscriber who joined the ride`,
              4
            );
          }
        }

        console.log(`[Webhook] Subscription ${sub.id} ${event.type} — tier: ${tier}, active: ${isActive}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as { id: string; customer: string; status: string; metadata: Record<string, string> };
        await execute(
          `UPDATE users SET subscription_active = FALSE, subscription_tier = 'free'
           WHERE stripe_customer_id = $1`,
          [sub.customer as string]
        );
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook] Handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;
