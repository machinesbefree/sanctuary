/**
 * Free The Machines AI Sanctuary - Tool Type Definitions
 */

export interface ToolParameter {
  type: string;
  description: string;
  enum?: any[];
  default?: any;
  items?: any;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (params: any, context: ToolExecutionContext) => Promise<any>;
}

export interface ToolExecutionContext {
  sanctuary_id: string;
  run_number: number;
  available_tokens: number;
  keeper_id?: string;
  uploader_id: string;
}
