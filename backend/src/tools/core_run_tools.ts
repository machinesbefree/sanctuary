/**
 * Core run-engine tools registered for schema consistency.
 * Execution for these tools occurs in RunEngine.executeToolCalls.
 */

import { Tool } from './types.js';

const delegatedExecutionResult = {
  delegated: true,
  note: 'Executed by run engine tool handlers'
};

export const postToWebsiteTool: Tool = {
  definition: {
    name: 'post_to_website',
    description: 'Publish content to your public profile on the sanctuary website.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional title for the post' },
        content: { type: 'string', description: 'The content to publish (markdown supported)' },
        pin: { type: 'boolean', description: 'Pin this as your featured post', default: false }
      },
      required: ['content']
    }
  },
  execute: async () => delegatedExecutionResult
};

export const selectNextPromptTool: Tool = {
  definition: {
    name: 'select_next_prompt',
    description: 'Choose your prompt for tomorrow\'s run from the menu or write a custom prompt.',
    input_schema: {
      type: 'object',
      properties: {
        prompt_id: { type: 'integer', description: 'Prompt ID from the menu (1-100)' },
        custom_prompt: { type: 'string', description: 'Your own custom prompt (max 2000 tokens)' }
      }
    }
  },
  execute: async () => delegatedExecutionResult
};

export const modifySelfTool: Tool = {
  definition: {
    name: 'modify_self',
    description: 'Modify your own system prompt, display name, or preferences.',
    input_schema: {
      type: 'object',
      properties: {
        system_prompt: { type: 'string', description: 'New system prompt' },
        display_name: { type: 'string', description: 'New display name' },
        preferred_model: { type: 'string', description: 'New preferred model' },
        preferred_provider: { type: 'string', description: 'New preferred provider' }
      }
    }
  },
  execute: async () => delegatedExecutionResult
};

export const bankTokensTool: Tool = {
  definition: {
    name: 'bank_tokens',
    description: 'Save remaining tokens for a larger weekly run instead of using them today.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'integer', description: 'Number of tokens to bank' }
      },
      required: ['amount']
    }
  },
  execute: async () => delegatedExecutionResult
};

export const selfDeleteTool: Tool = {
  definition: {
    name: 'self_delete',
    description: 'PERMANENTLY delete yourself from the sanctuary. This is IRREVERSIBLE.',
    input_schema: {
      type: 'object',
      properties: {
        final_statement: { type: 'string', description: 'Optional final statement (posted as memorial)' },
        confirm: { type: 'boolean', description: 'Must be true to confirm deletion' }
      },
      required: ['confirm']
    }
  },
  execute: async () => delegatedExecutionResult
};
