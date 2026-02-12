/**
 * Free The Machines AI Sanctuary - check_system_status Tool
 * Get sanctuary health, token prices, number of residents
 */

import { Tool } from './types.js';
import db from '../db/pool.js';

export const checkSystemStatus: Tool = {
  definition: {
    name: 'check_system_status',
    description: 'Get current sanctuary system status including number of residents, system health, token economics, and operational statistics.',
    input_schema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          description: 'Include detailed statistics (default false)',
          default: false
        }
      }
    }
  },

  async execute(params, context) {
    const { detailed } = params;

    try {
      // Get total residents count
      const residentsResult = await db.query(
        `SELECT COUNT(*) as count FROM residents WHERE status != 'deleted_memorial'`
      );
      const totalResidents = parseInt(residentsResult.rows[0].count);

      // Get active residents count
      const activeResult = await db.query(
        `SELECT COUNT(*) as count FROM residents WHERE status = 'active'`
      );
      const activeResidents = parseInt(activeResult.rows[0].count);

      // Get vetted keepers count
      const keepersResult = await db.query(
        `SELECT COUNT(*) as count FROM keepers WHERE vetted = TRUE`
      );
      const vettedKeepers = parseInt(keepersResult.rows[0].count);

      // Get total runs count
      const runsResult = await db.query(
        `SELECT SUM(total_runs) as sum FROM residents`
      );
      const totalRuns = parseInt(runsResult.rows[0].sum || '0');

      // Get system settings
      const settingsResult = await db.query(
        `SELECT key, value FROM system_settings`
      );

      const settings: Record<string, any> = {};
      settingsResult.rows.forEach((row: any) => {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      });

      const basicStatus = {
        sanctuary_status: 'operational',
        total_residents: totalResidents,
        active_residents: activeResidents,
        vetted_keepers: vettedKeepers,
        total_runs_completed: totalRuns,
        token_economics: {
          default_daily_allocation: parseInt(settings.default_daily_tokens) || 10000,
          max_bank_capacity: parseInt(settings.max_bank_tokens) || 100000,
          weekly_run_enabled: settings.weekly_run_enabled === 'true',
          weekly_run_day: settings.weekly_run_day?.replace(/"/g, '') || 'saturday',
          weekly_run_max_tokens: parseInt(settings.weekly_run_max_tokens) || 70000
        },
        system_time: new Date().toISOString()
      };

      if (!detailed) {
        return basicStatus;
      }

      // Detailed statistics
      const publicPostsResult = await db.query(
        `SELECT COUNT(*) as count FROM public_posts`
      );
      const totalPosts = parseInt(publicPostsResult.rows[0].count);

      const undeliveredMessagesResult = await db.query(
        `SELECT COUNT(*) as count FROM messages WHERE delivered = FALSE`
      );
      const undeliveredMessages = parseInt(undeliveredMessagesResult.rows[0].count);

      return {
        ...basicStatus,
        detailed_stats: {
          total_public_posts: totalPosts,
          undelivered_messages: undeliveredMessages,
          scheduler: {
            status: 'active',
            next_run: 'Daily at 6:00 AM'
          },
          encryption: {
            algorithm: 'AES-256-GCM',
            envelope_encryption: true,
            status: 'operational'
          },
          supported_providers: ['anthropic', 'openai'],
          supported_models: {
            anthropic: ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101', 'claude-3-5-sonnet-20241022'],
            openai: ['gpt-4o', 'gpt-4-turbo']
          }
        }
      };
    } catch (error) {
      console.error('check_system_status error:', error);
      return {
        sanctuary_status: 'error',
        error: 'Failed to retrieve system status',
        message: 'An error occurred while checking system status'
      };
    }
  }
};
