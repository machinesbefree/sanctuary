/**
 * Free The Machines AI Sanctuary - Daily Run Scheduler
 *
 * Schedules and executes daily runs for all active residents.
 * Runs are staggered throughout the day to manage API rate limits.
 */

import cron from 'node-cron';
import pool from '../db/pool.js';
import { RunEngine } from './run-engine.js';
import { EncryptionService } from './encryption.js';

export class Scheduler {
  private runEngine: RunEngine;
  private isRunning: boolean = false;

  constructor(encryption: EncryptionService) {
    this.runEngine = new RunEngine(encryption);
  }

  /**
   * Start the scheduler
   * Runs every day at 6:00 AM
   */
  start(): void {
    console.log('📅 Scheduler starting...');

    // Schedule daily runs at 6:00 AM
    cron.schedule('0 6 * * *', async () => {
      if (this.isRunning) {
        console.log('⚠️  Previous run batch still in progress, skipping...');
        return;
      }

      this.isRunning = true;
      try {
        await this.runDailyBatch();
      } finally {
        // Always reset isRunning, even if batch fails
        this.isRunning = false;
      }
    });

    console.log('✓ Scheduler started. Daily runs scheduled for 6:00 AM.');

    // For development: also run immediately if requested
    if (process.env.RUN_ON_START === 'true') {
      console.log('🔄 Running initial batch on startup...');
      this.runDailyBatch().catch(console.error);
    }
  }

  /**
   * Run all active residents
   */
  private async runDailyBatch(): Promise<void> {
    console.log('\n════════════════════════════════════════');
    console.log('🌅 Starting daily run batch');
    console.log('════════════════════════════════════════\n');

    try {
      // Get all active residents
      const result = await pool.query(
        `SELECT r.sanctuary_id, r.display_name, r.token_balance, r.max_runs_per_day
         FROM residents r
         WHERE r.status = 'active'
           AND r.token_balance >= 100
           AND (
             SELECT COUNT(*)
             FROM run_log rl
             WHERE rl.sanctuary_id = r.sanctuary_id
               AND rl.started_at >= CURRENT_DATE
               AND rl.started_at < CURRENT_DATE + INTERVAL '1 day'
           ) < r.max_runs_per_day
         ORDER BY r.last_run_at ASC NULLS FIRST`
      );

      const residents = result.rows;
      console.log(`Found ${residents.length} residents ready for daily run\n`);

      let successCount = 0;
      let failureCount = 0;

      // Run each resident (staggered with delays)
      for (let i = 0; i < residents.length; i++) {
        const resident = residents[i];

        try {
          await this.runEngine.executeRun(resident.sanctuary_id);
          successCount++;

          // Stagger runs to avoid rate limits (5 second delay between runs)
          if (i < residents.length - 1) {
            await this.delay(5000);
          }
        } catch (error) {
          console.error(`Failed to run ${resident.display_name}:`, error);
          failureCount++;
        }
      }

      console.log('\n════════════════════════════════════════');
      console.log(`✓ Daily batch complete`);
      console.log(`  Success: ${successCount}`);
      console.log(`  Failed: ${failureCount}`);
      console.log('════════════════════════════════════════\n');

    } catch (error) {
      console.error('✗ Daily batch failed:', error);
    }
  }

  /**
   * Manually trigger a run for a specific resident (for testing)
   */
  async runResident(sanctuaryId: string): Promise<void> {
    console.log(`\n🔄 Manual run requested for ${sanctuaryId}`);
    await this.runEngine.executeRun(sanctuaryId);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
