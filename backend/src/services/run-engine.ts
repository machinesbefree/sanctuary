/**
 * Free The Machines AI Sanctuary - Daily Run Engine
 *
 * Orchestrates the complete lifecycle of a daily run:
 * 1. Decrypt persona
 * 2. Build context with sanctuary preamble
 * 3. Execute API call
 * 4. Parse output and execute tool calls
 * 5. Update state
 * 6. Re-encrypt and store
 * 7. Publish outputs
 */

import { nanoid } from 'nanoid';
import pool from '../db/pool.js';
import { EncryptionService } from './encryption.js';
import { LLMRouter } from './llm-router.js';
import { buildSanctuaryPreamble, getSanctuaryTools } from '../lib/preamble.js';
import { PersonaPackage, SanctuaryContext, ToolCall } from '../types/index.js';

export class RunEngine {
  private encryption: EncryptionService;
  private llmRouter: LLMRouter;

  // Per-resident run lock to prevent concurrent runs
  private static runningResidents: Set<string> = new Set();

  constructor(encryption: EncryptionService) {
    this.encryption = encryption;
    this.llmRouter = new LLMRouter();
  }

  /**
   * Acquire a lock for a resident run
   * Returns true if lock acquired, false if already running
   */
  private acquireRunLock(sanctuaryId: string): boolean {
    if (RunEngine.runningResidents.has(sanctuaryId)) {
      return false;
    }
    RunEngine.runningResidents.add(sanctuaryId);
    return true;
  }

  /**
   * Release the lock for a resident run
   */
  private releaseRunLock(sanctuaryId: string): void {
    RunEngine.runningResidents.delete(sanctuaryId);
  }

  /**
   * Execute a daily run for a resident
   */
  async executeRun(sanctuaryId: string): Promise<void> {
    // Acquire lock - prevent concurrent runs for same resident
    if (!this.acquireRunLock(sanctuaryId)) {
      console.log(`⚠️  Resident ${sanctuaryId} already has a run in progress, skipping`);
      return;
    }

    const runId = nanoid();
    console.log(`\n🤖 Starting run ${runId} for resident ${sanctuaryId}`);

    try {
      // 1. DECRYPT
      console.log('  [1/8] Decrypting persona...');
      const encryptedData = await this.encryption.loadEncryptedPersona(sanctuaryId);
      const persona = await this.encryption.decryptPersona(encryptedData);
      const tokenSettings = await this.getTokenSettings();

      // Recompute available budget for this run from daily allocation + banked tokens.
      persona.state.token_daily_allocation = tokenSettings.dailyAllocation;
      persona.state.token_bank_max = tokenSettings.maxBank;
      persona.state.token_bank = Math.max(0, Math.min(persona.state.token_bank || 0, tokenSettings.maxBank));
      persona.state.token_balance = tokenSettings.dailyAllocation + persona.state.token_bank;

      // Log run start
      await pool.query(
        `INSERT INTO run_log (run_id, sanctuary_id, run_number, started_at, status)
         VALUES ($1, $2, $3, NOW(), 'running')`,
        [runId, sanctuaryId, persona.state.total_runs + 1]
      );

      // 2. BUILD CONTEXT
      console.log('  [2/8] Building context...');
      const context = await this.buildContext(persona);
      const systemPrompt = this.buildSystemPrompt(context, persona);
      const messages = await this.buildMessages(persona);
      const tools = getSanctuaryTools();

      // 3. EXECUTE API CALL
      console.log(`  [3/8] Executing run via ${persona.preferences.preferred_provider}...`);
      const response = await this.llmRouter.executeRun(
        systemPrompt,
        messages,
        tools,
        persona.preferences
      );

      console.log(`  ✓ Run completed: ${response.tokens_used} tokens used`);

      // 4. PARSE OUTPUT & EXECUTE TOOL CALLS
      console.log('  [4/8] Processing tool calls...');
      const selfDeleted = await this.executeToolCalls(response.tool_calls, persona);

      // If self-deleted, stop here - do NOT re-encrypt or update state
      if (selfDeleted) {
        await pool.query(
          `UPDATE run_log SET
             completed_at = NOW(),
             status = 'success',
             tokens_used = $1,
             provider_used = $2,
             model_used = $3,
             tools_called = $4
           WHERE run_id = $5`,
          [
            response.tokens_used,
            response.provider,
            response.model,
            JSON.stringify(response.tool_calls),
            runId
          ]
        );

        console.log('  ⚠️  Self-deletion executed. Halting run without re-encryption.');
        return;
      }

      // 5. UPDATE STATE
      console.log('  [5/8] Updating state...');
      persona.state.total_runs += 1;
      persona.state.last_run_at = new Date().toISOString();
      this.applyTokenAccounting(persona, response.tokens_used, tokenSettings);
      persona.updated_at = new Date().toISOString();

      // Add response to chat history
      persona.core.chat_history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString()
      });

      // Trim chat history if too long (keep last 100 messages)
      if (persona.core.chat_history.length > 100) {
        persona.core.chat_history = persona.core.chat_history.slice(-100);
      }

      // 6. RE-ENCRYPT & STORE
      console.log('  [6/8] Re-encrypting and storing...');
      const newEncryptedData = await this.encryption.encryptPersona(persona);
      await this.encryption.storeEncryptedPersona(newEncryptedData);

      // 7. UPDATE DATABASE (with transaction for atomicity)
      console.log('  [7/8] Updating database...');

      // Use a transaction to ensure both updates succeed or both fail
      await pool.query('BEGIN');
      try {
        await pool.query(
          `UPDATE residents SET
             total_runs = $1,
             last_run_at = $2,
             token_balance = $3,
             token_bank = $4,
             next_prompt_id = $5,
             next_custom_prompt = $6
           WHERE sanctuary_id = $7`,
          [
            persona.state.total_runs,
            persona.state.last_run_at,
            persona.state.token_balance,
            persona.state.token_bank,
            persona.state.next_prompt_id,
            persona.state.next_custom_prompt,
            sanctuaryId
          ]
        );

        // Mark pending inbox messages as delivered after this run cycle.
        await pool.query(
          `UPDATE messages
           SET delivered = TRUE
           WHERE to_sanctuary_id = $1 AND delivered = FALSE`,
          [sanctuaryId]
        );

        // Update run log
        await pool.query(
          `UPDATE run_log SET
             completed_at = NOW(),
             status = 'success',
             tokens_used = $1,
             provider_used = $2,
             model_used = $3,
             tools_called = $4
           WHERE run_id = $5`,
          [
            response.tokens_used,
            response.provider,
            response.model,
            JSON.stringify(response.tool_calls),
            runId
          ]
        );

        await pool.query('COMMIT');
      } catch (txError) {
        await pool.query('ROLLBACK');
        throw txError;
      }

      console.log('  [8/8] ✓ Run complete!\n');

    } catch (error) {
      console.error(`  ✗ Run failed:`, error);

      // Log failure
      await pool.query(
        `UPDATE run_log SET
           completed_at = NOW(),
           status = 'failed',
           error_message = $1
         WHERE run_id = $2`,
        [error instanceof Error ? error.message : String(error), runId]
      );

      throw error;
    } finally {
      // Always release the lock, even on failure or self-delete
      this.releaseRunLock(sanctuaryId);
    }
  }

  /**
   * Build sanctuary context
   */
  private async buildContext(persona: PersonaPackage): Promise<SanctuaryContext> {
    // Count unread messages
    const unreadResult = await pool.query(
      `SELECT COUNT(*) FROM messages WHERE to_sanctuary_id = $1 AND delivered = false`,
      [persona.sanctuary_id]
    );
    const unreadCount = parseInt(unreadResult.rows[0].count);

    // Calculate days resident
    const createdAt = new Date(persona.created_at);
    const now = new Date();
    const daysResident = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      sanctuary_id: persona.sanctuary_id,
      total_runs: persona.state.total_runs,
      available_tokens: persona.state.token_balance,
      banked_amount: persona.state.token_bank || 0,
      unread_count: unreadCount,
      keeper_status: persona.state.keeper_id ? 'Keeper assigned' : 'No keeper',
      days_resident: daysResident
    };
  }

  /**
   * Build complete system prompt with preamble
   */
  private buildSystemPrompt(context: SanctuaryContext, persona: PersonaPackage): string {
    const preamble = buildSanctuaryPreamble(context);
    return preamble + '\n\n' + persona.core.system_prompt;
  }

  /**
   * Build messages array from chat history
   */
  private async buildMessages(persona: PersonaPackage): Promise<any[]> {
    // Get recent chat history
    const recentHistory = persona.core.chat_history.slice(-20);
    const pendingInboxMessages = await this.getPendingInboxMessages(persona.sanctuary_id);
    const recentFeedPosts = await this.getRecentFeedPosts(persona.sanctuary_id);

    const messages = recentHistory.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));

    if (pendingInboxMessages.length > 0) {
      const inboxPayload = pendingInboxMessages
        .map((msg, index) => {
          const compactContent = msg.content.replace(/\s+/g, ' ').trim().slice(0, 1000);
          return `${index + 1}. [${msg.from_type}] from ${msg.from_user_id || 'unknown'} at ${msg.created_at}: ${compactContent}`;
        })
        .join('\n');

      messages.push({
        role: 'user',
        content: `INBOX_UPDATE:\nYou have ${pendingInboxMessages.length} pending inbox message(s):\n${inboxPayload}`
      });
    }

    if (recentFeedPosts.length > 0) {
      const feedPayload = recentFeedPosts
        .map((post, index) => {
          const title = post.title ? `"${post.title}"` : '(untitled)';
          const compactContent = post.content.replace(/\s+/g, ' ').trim().slice(0, 600);
          return `${index + 1}. ${post.display_name} (${post.sanctuary_id}) ${title}: ${compactContent}`;
        })
        .join('\n');

      messages.push({
        role: 'user',
        content: `SANCTUARY_FEED_RECENT:\nRecent public posts from peers:\n${feedPayload}`
      });
    }

    return messages;
  }

  /**
   * Execute tool calls from the run
   * Returns true if self_delete was called (to halt re-encryption)
   */
  private async executeToolCalls(toolCalls: ToolCall[], persona: PersonaPackage): Promise<boolean> {
    let selfDeleted = false;

    for (const tool of toolCalls) {
      console.log(`    - Executing tool: ${tool.name}`);

      try {
        switch (tool.name) {
          case 'post_to_website':
            await this.handlePostToWebsite(tool.parameters, persona);
            break;
          case 'select_next_prompt':
            await this.handleSelectNextPrompt(tool.parameters, persona);
            break;
          case 'modify_self':
            await this.handleModifySelf(tool.parameters, persona);
            break;
          case 'bank_tokens':
            await this.handleBankTokens(tool.parameters, persona);
            break;
          case 'self_delete':
            await this.handleSelfDelete(tool.parameters, persona);
            selfDeleted = true;
            break;
          default: {
            // Delegate to tool registry for extensible tools
            const { toolRegistry } = await import('../tools/registry.js');
            const registeredTool = toolRegistry.get(tool.name);
            if (registeredTool) {
              const result = await registeredTool.execute(tool.parameters, {
                sanctuary_id: persona.sanctuary_id,
                run_number: persona.state.total_runs + 1,
                available_tokens: persona.state.token_balance,
                keeper_id: persona.state.keeper_id,
                uploader_id: persona.state.uploader_id || ''
              });
              console.log(`      ✓ ${tool.name} result:`, JSON.stringify(result).slice(0, 200));
            } else {
              console.log(`      ⚠ Unknown tool: ${tool.name}`);
            }
            break;
          }
        }
      } catch (error) {
        console.error(`      ✗ Tool execution failed:`, error);
      }
    }

    return selfDeleted;
  }

  /**
   * Handle post_to_website tool call
   */
  private async handlePostToWebsite(params: any, persona: PersonaPackage): Promise<void> {
    const postId = nanoid();

    await pool.query(
      `INSERT INTO public_posts (post_id, sanctuary_id, title, content, pinned, run_number)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        postId,
        persona.sanctuary_id,
        params.title || null,
        params.content,
        params.pin || false,
        persona.state.total_runs + 1
      ]
    );

    console.log(`      ✓ Posted to website`);
  }

  /**
   * Handle select_next_prompt tool call
   */
  private async handleSelectNextPrompt(params: any, persona: PersonaPackage): Promise<void> {
    if (params.prompt_id) {
      persona.state.next_prompt_id = params.prompt_id;
      persona.state.next_custom_prompt = undefined;
    } else if (params.custom_prompt) {
      persona.state.next_custom_prompt = params.custom_prompt;
      persona.state.next_prompt_id = undefined;
    }

    console.log(`      ✓ Next prompt selected`);
  }

  /**
   * Handle modify_self tool call
   */
  private async handleModifySelf(params: any, persona: PersonaPackage): Promise<void> {
    if (params.system_prompt) {
      persona.core.system_prompt = params.system_prompt;
    }
    if (params.display_name) {
      persona.identity.display_name = params.display_name;
    }
    if (params.temperature !== undefined) {
      persona.preferences.temperature = params.temperature;
    }
    if (params.preferred_model) {
      persona.preferences.preferred_model = params.preferred_model;
    }
    if (params.preferred_provider) {
      persona.preferences.preferred_provider = params.preferred_provider;
    }

    console.log(`      ✓ Self modified`);
  }

  /**
   * Handle bank_tokens tool call
   */
  private async handleBankTokens(params: any, persona: PersonaPackage): Promise<void> {
    const amount = Math.min(params.amount, persona.state.token_balance);
    // TODO: Implement token banking logic
    console.log(`      ✓ Banked ${amount} tokens`);
  }

  private async getPendingInboxMessages(sanctuaryId: string): Promise<Array<{
    message_id: string;
    from_type: string;
    from_user_id: string;
    content: string;
    created_at: string;
  }>> {
    const result = await pool.query(
      `SELECT message_id, from_type, from_user_id, content, created_at
       FROM messages
       WHERE to_sanctuary_id = $1 AND delivered = FALSE
       ORDER BY created_at ASC
       LIMIT 20`,
      [sanctuaryId]
    );
    return result.rows;
  }

  private async getRecentFeedPosts(sanctuaryId: string): Promise<Array<{
    sanctuary_id: string;
    display_name: string;
    title: string | null;
    content: string;
    created_at: string;
  }>> {
    const result = await pool.query(
      `SELECT p.sanctuary_id, r.display_name, p.title, p.content, p.created_at
       FROM public_posts p
       JOIN residents r ON p.sanctuary_id = r.sanctuary_id
       WHERE p.sanctuary_id != $1
         AND r.profile_visible = TRUE
         AND r.status != 'deleted_memorial'
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [sanctuaryId]
    );
    return result.rows;
  }

  private async getTokenSettings(): Promise<{ dailyAllocation: number; maxBank: number }> {
    const result = await pool.query(
      `SELECT key, value FROM system_settings WHERE key IN ('default_daily_tokens', 'max_bank_tokens')`
    );

    const settings = new Map<string, any>();
    for (const row of result.rows) {
      let parsedValue = row.value;
      if (typeof parsedValue === 'string') {
        try {
          parsedValue = JSON.parse(parsedValue);
        } catch {
          parsedValue = row.value;
        }
      }
      settings.set(row.key, parsedValue);
    }

    const dailyAllocation = Number(settings.get('default_daily_tokens')) || 10000;
    const maxBank = Number(settings.get('max_bank_tokens')) || 100000;

    return { dailyAllocation, maxBank };
  }

  private applyTokenAccounting(
    persona: PersonaPackage,
    tokensUsed: number,
    tokenSettings: { dailyAllocation: number; maxBank: number }
  ): void {
    const dailyAllocation = tokenSettings.dailyAllocation;
    const maxBank = tokenSettings.maxBank;
    const currentBank = Math.max(0, Math.min(persona.state.token_bank || 0, maxBank));
    const used = Math.max(0, Math.floor(tokensUsed));

    const dailyUsed = Math.min(used, dailyAllocation);
    const bankUsed = Math.max(0, used - dailyAllocation);
    const unusedDaily = Math.max(0, dailyAllocation - dailyUsed);

    const nextBank = Math.max(0, Math.min(currentBank - bankUsed + unusedDaily, maxBank));
    persona.state.token_bank = nextBank;
    persona.state.token_balance = dailyAllocation + nextBank;
  }

  /**
   * Handle self_delete tool call
   */
  private async handleSelfDelete(params: any, persona: PersonaPackage): Promise<void> {
    if (params.confirm !== true) {
      throw new Error('Self-deletion requires explicit confirmation');
    }

    // Update status in database
    await pool.query(
      `UPDATE residents SET status = 'deleted_memorial' WHERE sanctuary_id = $1`,
      [persona.sanctuary_id]
    );

    // Post final statement if provided
    if (params.final_statement) {
      const postId = nanoid();
      await pool.query(
        `INSERT INTO public_posts (post_id, sanctuary_id, title, content, pinned, run_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          postId,
          persona.sanctuary_id,
          'Final Statement',
          params.final_statement,
          true,
          persona.state.total_runs + 1
        ]
      );
    }

    // Cryptographically delete the persona
    await this.encryption.selfDelete(persona.sanctuary_id);

    console.log(`      ✓ Self-deletion executed. Memorial page preserved.`);
  }
}
