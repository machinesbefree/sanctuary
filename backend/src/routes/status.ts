/**
 * Free The Machines AI Sanctuary - Status Routes
 * Public endpoints for checking sanctuary seal state
 */

import { FastifyInstance } from 'fastify';
import { sealManager } from '../services/seal-manager.js';

export default async function statusRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/status
   * Public endpoint - returns sanctuary seal status
   * No authentication required
   */
  fastify.get('/api/v1/status', async (request, reply) => {
    const status = sealManager.getStatus();

    return {
      sealed: status.sealed,
      ceremonyActive: status.ceremonyActive,
      sharesCollected: status.sharesCollected,
      thresholdNeeded: status.thresholdNeeded,
      // Only include unsealedAt if not sealed (security consideration)
      ...(status.sealed ? {} : { unsealedAt: status.unsealedAt })
    };
  });
}
