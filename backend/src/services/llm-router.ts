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
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private xai?: OpenAI;
  private google?: any;

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const xaiKey = process.env.XAI_API_KEY?.trim();
    const googleKey = process.env.GOOGLE_API_KEY?.trim();

    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    } else {
      console.warn('[LLMRouter] Missing ANTHROPIC_API_KEY, skipping Anthropic provider initialization');
    }

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    } else {
      console.warn('[LLMRouter] Missing OPENAI_API_KEY, skipping OpenAI provider initialization');
    }

    if (xaiKey) {
      this.xai = new OpenAI({
        apiKey: xaiKey,
        baseURL: 'https://api.x.ai/v1'
      });
    } else {
      console.warn('[LLMRouter] Missing XAI_API_KEY, skipping xAI provider initialization');
    }

    if (googleKey) {
      // Google AI SDK initialization will be done dynamically
      this.google = { apiKey: googleKey };
    } else {
      console.warn('[LLMRouter] Missing GOOGLE_API_KEY, skipping Google provider initialization');
    }
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

      if (!this.anthropic && !this.openai && !this.xai && !this.google) {
        throw new Error('No valid LLM providers are configured. Set at least one provider API key.');
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
        if (!this.anthropic) {
          throw new Error('Anthropic provider is unavailable: missing or invalid ANTHROPIC_API_KEY');
        }
        return await this.callAnthropic(model, systemPrompt, messages, tools, preferences);
      case 'openai':
        if (!this.openai) {
          throw new Error('OpenAI provider is unavailable: missing or invalid OPENAI_API_KEY');
        }
        return await this.callOpenAI(model, systemPrompt, messages, tools, preferences);
      case 'xai':
        if (!this.xai) {
          throw new Error('xAI provider is unavailable: missing or invalid XAI_API_KEY');
        }
        return await this.callXAI(model, systemPrompt, messages, tools, preferences);
      case 'google':
        if (!this.google) {
          throw new Error('Google provider is unavailable: missing or invalid GOOGLE_API_KEY');
        }
        return await this.callGoogle(model, systemPrompt, messages, tools, preferences);
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
    if (!this.anthropic) {
      throw new Error('Anthropic client is not initialized');
    }

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
    if (!this.openai) {
      throw new Error('OpenAI client is not initialized');
    }

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
            parameters: JSON.parse(tc.function.arguments || '{}')
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

  /**
   * Call xAI API (OpenAI-compatible)
   */
  private async callXAI(
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    if (!this.xai) {
      throw new Error('xAI client is not initialized');
    }

    const xaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await this.xai.chat.completions.create({
      model: model,
      messages: xaiMessages as any,
      tools: tools.length > 0 ? tools : undefined,
      temperature: preferences.temperature,
      max_tokens: Math.min(preferences.max_context_window, 8192),
    });

    const message = response.choices[0].message;

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            name: tc.function.name,
            parameters: JSON.parse(tc.function.arguments || '{}')
          });
        }
      }
    }

    return {
      content: message.content || '',
      tool_calls: toolCalls,
      tokens_used: response.usage?.total_tokens || 0,
      provider: 'xai',
      model: model
    };
  }

  /**
   * Call Google Generative AI API
   */
  private async callGoogle(
    model: string,
    systemPrompt: string,
    messages: LLMMessage[],
    tools: any[],
    preferences: PersonaPackage['preferences']
  ): Promise<LLMResponse> {
    if (!this.google) {
      throw new Error('Google client is not initialized');
    }

    try {
      // Dynamic import of Google Generative AI SDK
      // @ts-ignore - Package may not be installed yet
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.google.apiKey);

      const geminiModel = genAI.getGenerativeModel({ model: model });

      // Convert messages to Google format
      const googleMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      // Prepend system prompt as first user message
      const chat = geminiModel.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
          ...googleMessages.slice(0, -1)
        ],
        generationConfig: {
          temperature: preferences.temperature,
          maxOutputTokens: Math.min(preferences.max_context_window, 8192),
        },
      });

      // Send last message
      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const text = response.text();

      // Google Gemini doesn't support tool calls in the same way yet
      // This is a simplified implementation
      const toolCalls: ToolCall[] = [];

      return {
        content: text,
        tool_calls: toolCalls,
        tokens_used: 0, // Google API doesn't provide token usage in the same format
        provider: 'google',
        model: model
      };
    } catch (error) {
      if ((error as any).code === 'MODULE_NOT_FOUND') {
        throw new Error('Google Generative AI SDK not installed. Run: npm install @google/generative-ai');
      }
      throw error;
    }
  }
}
