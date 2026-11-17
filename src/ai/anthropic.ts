import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, Message, Tool, ChatOptions, ChatChunk, ToolCall } from './types.js';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *streamChat(
    messages: Message[],
    tools: Tool[],
    options: ChatOptions
  ): AsyncGenerator<ChatChunk> {
    const systemPrompt = options.systemPrompt || '';
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.role === 'tool'
          ? [{ type: 'tool_result', tool_use_id: m.toolCallId!, content: m.content }]
          : m.content,
      }));

    const anthropicTools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    const stream = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
      stream: true,
    });

    let accumulatedText = '';
    let currentToolCall: Partial<ToolCall> | null = null;
    let toolCallBuffer = '';

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'content_block_start': {
          if (chunk.content_block.type === 'tool_use') {
            currentToolCall = {
              id: chunk.content_block.id,
              type: 'function',
              function: { name: chunk.content_block.name, arguments: '' },
            };
            toolCallBuffer = '';
          }
          break;
        }
        case 'content_block_delta': {
          if (chunk.delta.type === 'text_delta') {
            accumulatedText += chunk.delta.text;
            yield { type: 'text', content: chunk.delta.text };
          } else if (chunk.delta.type === 'input_json_delta') {
            toolCallBuffer += chunk.delta.partial_json;
            if (currentToolCall) {
              currentToolCall.function!.arguments = toolCallBuffer;
            }
          }
          break;
        }
        case 'content_block_stop': {
          if (currentToolCall && currentToolCall.function) {
            try {
              JSON.parse(currentToolCall.function.arguments);
              yield { type: 'tool_call', toolCall: currentToolCall as ToolCall };
              if (options.onToolCall) {
                options.onToolCall(currentToolCall as ToolCall);
              }
            } catch (e) {
              // Invalid JSON, skip
            }
            currentToolCall = null;
            toolCallBuffer = '';
          }
          break;
        }
        case 'message_stop': {
          if (chunk.amendment) {
            // Handle amendments if needed
          }
          break;
        }
      }
    }

    // Final usage
    yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async countTokens(messages: Message[]): Promise<number> {
    const text = messages.map(m => m.content).join('\n');
    return Math.ceil(text.length / 4); // Rough estimate
  }
}