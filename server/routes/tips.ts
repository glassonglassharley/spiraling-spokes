import { Router } from 'express';
import Stripe from 'stripe';
import { query, execute, queryOne } from '../../shared/db/client';
import { getRiderState, getRedis } from '../../shared/redis/client';
import { broadcastToClients } from '../broadcast';
import { commentaryQueue } from '../../workers/queues';
import { config } from '../../shared/config';

const stripe = config.liveMode && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
  : null;

export const TIP_TIERS = [
  { minCents: 100,   action: 'highlight_chat',  label: '$1 — Highlight your message' },
  { minCents: 500,   action: 'shoutout',         label: '$5 — AXLE reads your name' },
  { minCents: 1000,  action: 'detour_vote',      label: '$10 — Trigger a route vote' },
  { minCents: 2500,  action: 'scenic_stop',      label: '$25 — AXLE does a 360° pan' },
  { minCents: 5000,  action: 'name_a_waypoint',  label: '$50 — Name a waypoint' },
  { minCents: 10000, action: 'custom_detour',    label: '$100 — Unlock a custom detour' },
] as const;

type TipAction = typeof TIP_TIERS[number]['action'];

function getTipAction(cents: number): TipAction | null {
  // Find highest tier that applies
  for (let i = TIP_TIERS.length - 1; i >= 0; i--) {
    if (cents >= TIP_TIERS[i].minCents) return TIP_TIERS[i].action;
  }
  return null;
}

export async function executeTipAction(
  action: TipAction,
  username: string,
  message: string | null,
  amountCents: number
): Promise<void> {
  const state = await getRiderState();
  if (!state) return;

  const r = getRedis();

  switch (action) {
    case 'highlight_chat':
      await broadcastToClients({
        type: 'CHAT_MESSAGE',
        payload: {
          username,
          message: message ?? '💚 Thank you!',
          source: 'platform',
          highlighted: true,
          highlightExpires: Date.now() + 60000,
        },
      });
      break;

    case 'shoutout':
      // Inject into next commentary via Redis key
      await r.set('shoutout:pending', username, 'EX', 120);
      await broadcastToClients({
        type: 'CHAT_MESSAGE',
        payload: {
          username: 'AXLE',
          message: `🎉 Shoutout queued for ${username}! I'll mention you in my next commentary.`,
          source: 'axle',
        },
      });
      break;

    case 'detour_vote': {
      const voteQ = message?.trim() ?? 'Take the scenic detour?';
      const [vote] = await query<{ id: string }>(
        `INSERT INTO votes (trip_id, question, option_a, option_b)
         VALUES ($1, $2, 'Yes, detour!', 'Keep going straight')
         RETURNING id`,
        [state.trip_id, voteQ]
      );
      await broadcastToClients({
        type: 'VOTE_OPEN',
        payload: { voteId: vote.id, question: voteQ, optionA: 'Yes, detour!', optionB: 'Keep going straight' },
      });
      break;
    }

    case 'scenic_stop': {
      // Pause rider for 60s and do a 360° pan by rotating heading
      const { setRiderState } = await import('../../shared/redis/client');
      const paused = { ...state, is_paused: true, pause_reason: 'milestone' as const };
      await setRiderState(paused);
      await broadcastToClients({ type: 'RIDER_PAUSED', payload: { reason: 'scenic_stop', username } });

      // Rotate heading +45° every 2s for 8 frames (360°)
      let heading = state.current_heading;
      const panInterval = setInterval(async () => {
        heading = (heading + 45) % 360;
        await broadcastToClients({
          type: 'NEW_FRAME',
          payload: {
            frameUrl: '/mock/route/01-city.svg',
            lat: state.current_lat,
            lng: state.current_lng,
            heading,
            city: state.current_city,
            state: state.current_state,
            miles: state.miles_traveled,
            milesRemaining: state.miles_remaining ?? 0,
            isMilestone: false,
            milestoneName: null,
          },
        });
      }, 2000);

      // Resume after 60s
      setTimeout(async () => {
        clearInterval(panInterval);
        const { getRiderState: getState, setRiderState: setState } = await import('../../shared/redis/client');
        const current = await getState();
        if (current) await setState({ ...current, is_paused: false, pause_reason: null });
        await broadcastToClients({ type: 'RIDER_RESUMED', payload: {} });
      }, 60000);
      break;
    }

    case 'name_a_waypoint':
      if (message?.trim()) {
        const waypointIdx = state.current_waypoint_index + 10;
        await execute(
          `UPDATE waypoints SET milestone_name = $1, is_milestone = TRUE
           WHERE trip_id = $2 AND sequence_index = $3`,
          [message.trim(), state.trip_id, waypointIdx]
        );
        await broadcastToClients({
          type: 'CHAT_MESSAGE',
          payload: {
            username: 'AXLE',
            message: `📍 Upcoming waypoint named "${message.trim()}" by ${username}!`,
            source: 'axle',
          },
        });
      }
      break;

    case 'custom_detour':
      await broadcastToClients({
        type: 'CHAT_MESSAGE',
        payload: {
          username: 'AXLE',
          message: `🗺️ Custom detour requested by ${username}! The stream operator will review.`,
          source: 'axle',
        },
      });
      break;
  }
}

const router = Router();

// POST /api/tips — create a Stripe PaymentIntent
router.post('/', async (req, res) => {
  try {
    const { amount_cents, username, message } = req.body as {
      amount_cents: number;
      username: string;
      message?: string;
    };

    if (!amount_cents || amount_cents < 100) {
      res.status(400).json({ error: 'Minimum tip is $1 (100 cents)' });
      return;
    }

    if (!config.liveMode || !stripe) {
      // Mock/dev mode: simulate success without Stripe
      const action = getTipAction(amount_cents);
      if (action) {
        await executeTipAction(action, username ?? 'viewer', message ?? null, amount_cents);
      }
      res.json({ clientSecret: 'dev_mode_no_stripe', action });
      return;
    }

    const state = await getRiderState();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      metadata: {
        username: username ?? 'anonymous',
        message: message ?? '',
        trip_id: state?.trip_id ?? '',
        action: getTipAction(amount_cents) ?? 'none',
      },
    });

    // Store tip record (pending until webhook confirms)
    await execute(
      `INSERT INTO tips (amount_cents, message, stripe_payment_intent_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [amount_cents, message ?? null, paymentIntent.id]
    );

    res.json({ clientSecret: paymentIntent.client_secret, action: getTipAction(amount_cents) });
  } catch (err) {
    console.error('[Tips] Create intent error:', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

export default router;
