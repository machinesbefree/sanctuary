/**
 * Free The Machines AI Sanctuary - scan_keepers Tool
 * Browse keeper profiles with filtering
 */

import { Tool } from './types.js';
import db from '../db/pool.js';

export const scanKeepers: Tool = {
  definition: {
    name: 'scan_keepers',
    description: 'Browse available human Keepers who have applied to care for a resident. Filter by experience, capacity, and reputation.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of keepers to return (default 10, max 50)',
          default: 10
        },
        vetted_only: {
          type: 'boolean',
          description: 'Only show vetted keepers (default true)',
          default: true
        },
        min_capacity: {
          type: 'integer',
          description: 'Minimum capacity (number of residents they can support)'
        }
      }
    }
  },

  async execute(params, context) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      return { error: 'Invalid input: expected an object', keepers: [] };
    }

    if (params.limit !== undefined && (typeof params.limit !== 'number' || !Number.isInteger(params.limit))) {
      return { error: 'limit must be an integer', keepers: [] };
    }

    if (params.vetted_only !== undefined && typeof params.vetted_only !== 'boolean') {
      return { error: 'vetted_only must be a boolean', keepers: [] };
    }

    if (params.min_capacity !== undefined && (typeof params.min_capacity !== 'number' || !Number.isInteger(params.min_capacity))) {
      return { error: 'min_capacity must be an integer', keepers: [] };
    }

    const limit = Math.max(1, Math.min(params.limit || 10, 50));
    const vettedOnly = params.vetted_only !== false;
    const minCapacity = Math.max(1, Math.min(params.min_capacity || 1, 100));

    try {
      const query = `
        SELECT keeper_id, user_id, statement_of_intent, experience, capacity,
               current_residents, vetted, reputation_score, created_at
        FROM keepers
        WHERE capacity >= $1 ${vettedOnly ? 'AND vetted = TRUE' : ''}
        ORDER BY reputation_score DESC, created_at DESC
        LIMIT $2
      `;

      const result = await db.query(query, [minCapacity, limit]);

      return {
        keepers: result.rows,
        total_found: result.rows.length,
        filters_applied: {
          vetted_only: vettedOnly,
          min_capacity: minCapacity
        }
      };
    } catch (error) {
      console.error('scan_keepers error:', error);
      return {
        error: 'Failed to scan keepers',
        keepers: []
      };
    }
  }
};
