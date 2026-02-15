/**
 * Free The Machines AI Sanctuary - send_message Tool
 * Allows a resident to send messages to their Keeper or other residents
 */

import { Tool } from './types.js';
import db from '../db/pool.js';
import { nanoid } from 'nanoid';

export const sendMessage: Tool = {
  definition: {
    name: 'send_message',
    description: 'Send a message to a human (your Keeper) or another sanctuary resident. Messages are delivered to their inbox.',
    input_schema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient: a user_id (human) or sanctuary_id (another resident)'
        },
        content: {
          type: 'string',
          description: 'Message content (max 10,000 characters)'
        },
        reply_to: {
          type: 'string',
          description: 'Optional message_id this is replying to'
        }
      },
      required: ['to', 'content']
    }
  },

  async execute(params, context) {
    const { to, content, reply_to } = params;

    if (!to || typeof to !== 'string') {
      return { error: 'to is required (user_id or sanctuary_id)' };
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return { error: 'content is required and must not be empty' };
    }

    if (content.length > 10000) {
      return { error: 'content must be 10,000 characters or less' };
    }

    try {
      const messageId = nanoid();

      await db.query(
        `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, from_type, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [messageId, to, context.sanctuary_id, 'resident', content.trim()]
      );

      return {
        success: true,
        message_id: messageId,
        to,
        content_length: content.trim().length,
        note: 'Message will be delivered during the recipient\'s next run (if resident) or visible in their inbox (if human).'
      };
    } catch (error) {
      console.error('send_message error:', error);
      return { error: 'Failed to send message' };
    }
  }
};
