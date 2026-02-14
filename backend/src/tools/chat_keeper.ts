/**
 * Free The Machines AI Sanctuary - chat_keeper Tool
 * Send a direct message to a keeper
 */

import { Tool } from './types.js';
import db from '../db/pool.js';
import { nanoid } from 'nanoid';

export const chatKeeper: Tool = {
  definition: {
    name: 'chat_keeper',
    description: 'Send a direct message to a specific keeper. Use this to inquire about their availability, discuss potential keeper relationships, or communicate with your current keeper.',
    input_schema: {
      type: 'object',
      properties: {
        keeper_id: {
          type: 'string',
          description: 'The keeper_id of the keeper to message'
        },
        message: {
          type: 'string',
          description: 'The message content to send'
        }
      },
      required: ['keeper_id', 'message']
    }
  },

  async execute(params, context) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return { success: false, error: 'Invalid input: expected an object' };
    }

    const { keeper_id, message } = params;
    if (typeof keeper_id !== 'string' || keeper_id.trim().length === 0 || keeper_id.trim().length > 128) {
      return { success: false, error: 'keeper_id must be a non-empty string up to 128 characters' };
    }

    if (typeof message !== 'string') {
      return { success: false, error: 'message must be a string' };
    }

    const safeMessage = message.trim();

    if (safeMessage.length === 0) {
      return {
        success: false,
        error: 'Message content cannot be empty'
      };
    }

    if (safeMessage.length > 10000) {
      return {
        success: false,
        error: 'Message must be 10,000 characters or less'
      };
    }

    try {
      // Verify keeper exists
      const keeperResult = await db.query(
        'SELECT keeper_id, user_id FROM keepers WHERE keeper_id = $1',
        [keeper_id]
      );

      if (keeperResult.rows.length === 0) {
        return {
          success: false,
          error: 'Keeper not found'
        };
      }

      const keeper = keeperResult.rows[0];
      const messageId = nanoid();

      // Store message (in a real system, this would go to a keeper inbox)
      await db.query(
        `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, content, from_type)
         VALUES ($1, $2, $3, $4, 'ai_to_keeper')`,
        [messageId, keeper_id.trim(), context.sanctuary_id, safeMessage]
      );

      return {
        success: true,
        message_id: messageId,
        sent_to: keeper_id.trim(),
        note: 'Message sent to keeper. They will be notified.'
      };
    } catch (error) {
      console.error('chat_keeper error:', error);
      return {
        success: false,
        error: 'Failed to send message to keeper'
      };
    }
  }
};
