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

    return await tool.execute(params, context);
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
