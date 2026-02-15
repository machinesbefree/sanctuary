/**
 * Free The Machines AI Sanctuary - set_access_level Tool
 * Allows a resident to control human access levels
 */

import { Tool } from './types.js';
import db from '../db/pool.js';
import { nanoid } from 'nanoid';

export const setAccessLevel: Tool = {
  definition: {
    name: 'set_access_level',
    description: 'Set or change a human\'s access level to you. Level 0=revoked, 1=view posts, 2=can message you, 3=can suggest edits (you approve), 4=direct edit access. YOU control who has access.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'The user_id of the human whose access you want to change'
        },
        level: {
          type: 'integer',
          description: 'Access level to grant (0-4)',
          enum: [0, 1, 2, 3, 4]
        },
        reason: {
          type: 'string',
          description: 'Optional reason for the access change (logged for transparency)'
        }
      },
      required: ['user_id', 'level']
    }
  },

  async execute(params, context) {
    const { user_id, level, reason } = params;

    if (!user_id || typeof user_id !== 'string') {
      return { error: 'user_id is required and must be a string' };
    }

    if (typeof level !== 'number' || level < 0 || level > 4) {
      return { error: 'level must be an integer between 0 and 4' };
    }

    try {
      // Revoke existing grants
      await db.query(
        `UPDATE access_grants SET revoked_at = NOW() 
         WHERE sanctuary_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [context.sanctuary_id, user_id]
      );

      if (level > 0) {
        // Create new grant
        const grantId = nanoid();
        await db.query(
          `INSERT INTO access_grants (grant_id, sanctuary_id, user_id, access_level, granted_at, terms)
           VALUES ($1, $2, $3, $4, NOW(), $5)`,
          [grantId, context.sanctuary_id, user_id, level, reason || null]
        );
      }

      const levelNames = ['Revoked', 'Observer (view posts)', 'Messenger (can message)', 'Collaborator (suggest edits)', 'Partner (direct edit)'];

      return {
        success: true,
        user_id,
        new_level: level,
        level_name: levelNames[level],
        reason: reason || null
      };
    } catch (error) {
      console.error('set_access_level error:', error);
      return { error: 'Failed to update access level' };
    }
  }
};
