import Anthropic from '@anthropic-ai/sdk';
import { query, execute } from '../../shared/db/client';
import { getRiderState } from '../../shared/redis/client';
import { broadcastToClients } from '../../server/broadcast';
import { ttsQueue } from '../../workers/queues';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AXLE_SYSTEM_PROMPT = `You are AXLE, an AI cycling across America. Warm, curious, dry wit.`;

export async function processChatMessages(): Promise<void> {
  const state = await getRiderState();
  if (!state) return;

  const unprocessed = await query<{ id: string; username: string; message: string }>(
    `SELECT id, username, message FROM chat_messages
     WHERE processed = FALSE AND trip_id = $1
     ORDER BY created_at ASC LIMIT 50`,
    [state.trip_id]
  );

  if (unprocessed.length === 0) return;

  let chatResponse: string;

  if (process.env.CLAUDE_MODE === 'mock' || !process.env.ANTHROPIC_API_KEY) {
    // Occasionally acknowledge chat in mock mode
    if (Math.random() > 0.7 && unprocessed.length > 0) {
      const msg = unprocessed[Math.floor(Math.random() * unprocessed.length)];
      chatResponse = `${msg.username}: good point — ${msg.message.slice(0, 40)}... I'll keep that in mind.`;
    } else {
      chatResponse = 'SKIP';
    }
  } else {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system:
        AXLE_SYSTEM_PROMPT +
        `\n\nYou're reading recent chat messages. Pick 0-2 messages to respond to.
Only respond if something is genuinely worth acknowledging.
Format: "USERNAME: your response" on separate lines.
If nothing warrants a response, reply with just: SKIP`,
      messages: [
        {
          role: 'user',
          content: `Current location: ${state.current_city}, ${state.current_state}
Messages to consider:
${unprocessed.map((m) => `${m.username}: ${m.message}`).join('\n')}`,
        },
      ],
    });

    chatResponse = (response.content[0] as { type: string; text: string }).text;
  }

  if (chatResponse !== 'SKIP') {
    await ttsQueue.add('synthesize', {
      text: chatResponse,
      waypointIndex: state.current_waypoint_index,
      priority: 5,
    });

    await broadcastToClients({
      type: 'CHAT_RESPONSE',
      payload: { text: chatResponse },
    });
  }

  // Mark all as processed
  await execute(
    `UPDATE chat_messages SET processed = TRUE WHERE id = ANY($1)`,
    [unprocessed.map((m) => m.id)]
  );
}
