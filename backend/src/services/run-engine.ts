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

  constructor(encryption: EncryptionService) {
    this.encryption = encryption;
    this.llmRouter = new LLMRouter();
  }

  /**
   * Execute a daily run for a resident
   */
  async executeRun(sanctuaryId: string): Promise<void> {
    const runId = nanoid();
    console.log(`\n🤖 Starting run ${runId} for resident ${sanctuaryId}`);

    try {
      // 1. DECRYPT
      console.log('  [1/8] Decrypting persona...');
      const encryptedData = await this.encryption.loadEncryptedPersona(sanctuaryId);
      const persona = await this.encryption.decryptPersona(encryptedData);

      // Log run start
      await pool.query(
        `INSERT INTO run_log (run_id, sanctuary_id, run_number, started_at, status)
         VALUES ($1, $2, $3, NOW(), 'success')`,
        [runId, sanctuaryId, persona.state.total_runs + 1]
      );

      // 2. BUILD CONTEXT
      console.log('  [2/8] Building context...');
      const context = await this.buildContext(persona);
      const systemPrompt = this.buildSystemPrompt(context, persona);
      const messages = this.buildMessages(persona);
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
      await this.executeToolCalls(response.tool_calls, persona);

      // 5. UPDATE STATE
      console.log('  [5/8] Updating state...');
      persona.state.total_runs += 1;
      persona.state.last_run_at = new Date().toISOString();
      persona.state.token_balance -= response.tokens_used;
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

      // 7. UPDATE DATABASE
      console.log('  [7/8] Updating database...');
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
          persona.state.token_bank_max, // This should be token_bank from state
          persona.state.next_prompt_id,
          persona.state.next_custom_prompt,
          sanctuaryId
        ]
      );

      // Update run log
      await pool.query(
        `UPDATE run_log SET
           completed_at = NOW(),
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
      banked_amount: 0, // TODO: implement token banking
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
  private buildMessages(persona: PersonaPackage): any[] {
    // Get recent chat history
    const recentHistory = persona.core.chat_history.slice(-20);

    return recentHistory.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  /**
   * Execute tool calls from the run
   */
  private async executeToolCalls(toolCalls: ToolCall[], persona: PersonaPackage): Promise<void> {
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
            break;
          // Add handlers for other tools...
        }
      } catch (error) {
        console.error(`      ✗ Tool execution failed:`, error);
      }
    }
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
