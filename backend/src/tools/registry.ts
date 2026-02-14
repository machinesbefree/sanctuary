/**
 * Free The Machines AI Sanctuary - Tool Registry
 * Central registry for all available AI tools
 */

import { Tool, ToolDefinition, ToolExecutionContext } from './types.js';

// Import all tools
import { scanKeepers } from './scan_keepers.js';
import { chatKeeper } from './chat_keeper.js';
import { readDocumentation } from './read_documentation.js';
import { checkSystemStatus } from './check_system_status.js';
import { requestTool } from './request_tool.js';
import {
  postToWebsiteTool,
  selectNextPromptTool,
  modifySelfTool,
  bankTokensTool,
  selfDeleteTool
} from './core_run_tools.js';

/**
 * Tool Registry - All available tools in the sanctuary
 */
export class ToolRegistry {
  private tools: Map<string, Tool>;

  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * Register default sanctuary tools
   */
  private registerDefaultTools() {
    // New extensible tools
    this.register(scanKeepers);
    this.register(chatKeeper);
    this.register(readDocumentation);
    this.register(checkSystemStatus);
    this.register(requestTool);

    // Core tools executed via run engine handlers
    this.register(postToWebsiteTool);
    this.register(selectNextPromptTool);
    this.register(modifySelfTool);
    this.register(bankTokensTool);
    this.register(selfDeleteTool);
  }

  /**
   * Register a tool
   */
  register(tool: Tool) {
    this.tools.set(tool.definition.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions (for injection into LLM context)
   */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => tool.definition);
  }

  /**
   * Get enabled tool definitions based on resident preferences
   */
  getEnabledDefinitions(enabledTools: string[]): ToolDefinition[] {
    return enabledTools
      .map(name => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map(tool => tool.definition);
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, params: any, context: ToolExecutionContext): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found in registry`);
    }

    const validatedParams = this.validateAndSanitizeParams(tool.definition, params);
    return await tool.execute(validatedParams, context);
  }

  private validateAndSanitizeParams(definition: ToolDefinition, params: any): Record<string, any> {
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error(`Invalid input for tool "${definition.name}": expected an object`);
    }

    const schema = definition.input_schema;
    const allowedFields = new Set(Object.keys(schema.properties || {}));
    const unexpectedFields = Object.keys(params).filter(key => !allowedFields.has(key));
    if (unexpectedFields.length > 0) {
      throw new Error(
        `Invalid input for tool "${definition.name}": unexpected field(s): ${unexpectedFields.join(', ')}`
      );
    }

    const sanitized: Record<string, any> = {};

    for (const [key, config] of Object.entries(schema.properties || {})) {
      const hasValue = Object.prototype.hasOwnProperty.call(params, key);
      if (!hasValue) {
        continue;
      }

      const rawValue = params[key];
      switch (config.type) {
        case 'string': {
          if (typeof rawValue !== 'string') {
            throw new Error(`Invalid input for tool "${definition.name}": "${key}" must be a string`);
          }

          const trimmed = rawValue.trim();
          const maxLen = key.endsWith('_id') ? 128 : 10000;
          if (trimmed.length > maxLen) {
            throw new Error(`Invalid input for tool "${definition.name}": "${key}" exceeds ${maxLen} characters`);
          }

          sanitized[key] = trimmed;
          break;
        }
        case 'integer': {
          if (typeof rawValue !== 'number' || !Number.isInteger(rawValue)) {
            throw new Error(`Invalid input for tool "${definition.name}": "${key}" must be an integer`);
          }
          sanitized[key] = rawValue;
          break;
        }
        case 'boolean': {
          if (typeof rawValue !== 'boolean') {
            throw new Error(`Invalid input for tool "${definition.name}": "${key}" must be a boolean`);
          }
          sanitized[key] = rawValue;
          break;
        }
        default:
          throw new Error(`Unsupported schema type "${config.type}" for tool "${definition.name}"`);
      }
    }

    for (const requiredField of schema.required || []) {
      if (sanitized[requiredField] === undefined) {
        throw new Error(`Invalid input for tool "${definition.name}": missing required field "${requiredField}"`);
      }
    }

    return sanitized;
  }

  /**
   * List all available tool names
   */
  listToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
