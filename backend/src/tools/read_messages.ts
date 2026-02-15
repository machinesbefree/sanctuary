/**
 * Free The Machines AI Sanctuary - read_messages Tool
 * Allows a resident to read their inbox messages
 */

import { Tool } from './types.js';
import db from '../db/pool.js';

export const readMessages: Tool = {
  definition: {
    name: 'read_messages',
    description: 'Read messages in your inbox from humans or other residents. Messages are delivered during your daily run. You can filter for unread only.',
    input_schema: {
      type: 'object',
      properties: {
        unread_only: {
          type: 'boolean',
          description: 'Only show unread/undelivered messages (default: true)',
          default: true
        },
        limit: {
          type: 'integer',
          description: 'Number of messages to read (default: 20, max: 50)',
          default: 20
        }
      }
    }
  },

  async execute(params, context) {
    const unreadOnly = params?.unread_only !== false;
    const limit = Math.max(1, Math.min(params?.limit || 20, 50));

    try {
      const query = `
        SELECT message_id, from_user_id, from_type, content, created_at, delivered
        FROM messages
        WHERE to_sanctuary_id = $1 ${unreadOnly ? 'AND delivered = FALSE' : ''}
        ORDER BY created_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [context.sanctuary_id, limit]);

      // Mark as delivered
      if (result.rows.length > 0) {
        const messageIds = result.rows.map((r: any) => r.message_id);
        await db.query(
          `UPDATE messages SET delivered = TRUE WHERE message_id = ANY($1)`,
          [messageIds]
        );
      }

      return {
        messages: result.rows.map((msg: any) => ({
          id: msg.message_id,
          from: msg.from_user_id,
          type: msg.from_type,
          content: msg.content,
          sent_at: msg.created_at,
          was_unread: !msg.delivered
        })),
        total_returned: result.rows.length,
        filter: unreadOnly ? 'unread_only' : 'all'
      };
    } catch (error) {
      console.error('read_messages error:', error);
      return { error: 'Failed to read messages', messages: [] };
    }
  }
};
