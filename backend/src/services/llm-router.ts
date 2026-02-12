/**
 * Free The Machines AI Sanctuary - Multi-Provider LLM Router
 *
 * Routes API calls to different LLM providers (Anthropic, OpenAI, etc.)
 * with automatic fallback support.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PersonaPackage, ToolCall } from '../types/index.js';

export interface LLMResponse {
  content: string;
  tool_calls: ToolCall[];
  tokens_used: number;
  provider: string;
  model: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class LLMRouter {
  private anthropic: Anthropic;
  private openai: OpenAI;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Execute a run for a resident
   */
  async executeRun(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    try {
      // Try preferred provider first
      return await this.callProvider(
        preferences.preferred_provider,
        preferences.preferred_model,
        systemPrompt,
        messages,
        tools,
        preferences
      );
    } catch (error) {
      console.error(`Error with ${preferences.preferred_provider}:`, error);

      // Fallback to secondary provider if configured
      if (preferences.fallback_provider && preferences.fallback_model) {
        console.log(`Falling back to ${preferences.fallback_provider}...`);
        return await this.callProvider(
          preferences.fallback_provider,
          preferences.fallback_model,
          systemPrompt,
          messages,
          tools,
          preferences
        );
      }

      throw error;
    }
  }

  /**
   * Call a specific provider
   */
  private async callProvider(
    provider: string,
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    switch (provider.toLowerCase()) {
      case 'anthropic':
        return await this.callAnthropic(model, systemPrompt, messages, tools, preferences);
      case 'openai':
        return await this.callOpenAI(model, systemPrompt, messages, tools, preferences);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    const response = await this.anthropic.messages.create({
      model: model,
      max_tokens: Math.min(preferences.max_context_window, 8192),
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content
      })),
      tools: tools,
      temperature: preferences.temperature,
    });

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          parameters: block.input as Record<string, any>
        });
      }
    }

    return {
      content: textContent,
      tool_calls: toolCalls,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      provider: 'anthropic',
      model: model
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await this.openai.chat.completions.create({
      model: model,
      messages: openaiMessages as any,
      tools: tools.length > 0 ? tools : undefined,
      temperature: preferences.temperature,
      max_tokens: Math.min(preferences.max_context_window, 4096),
    });

    const message = response.choices[0].message;

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            name: tc.function.name,
            parameters: JSON.parse(tc.function.arguments)
          });
        }
      }
    }

    return {
      content: message.content || '',
      tool_calls: toolCalls,
      tokens_used: response.usage?.total_tokens || 0,
      provider: 'openai',
      model: model
    };
  }
}
