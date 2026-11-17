import OpenAI from 'openai';
import type { AIProvider, Message, Tool, ChatOptions, ChatChunk, ToolCall } from './types.js';

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string, baseUrl?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async *streamChat(
    messages: Message[],
    tools: Tool[],
    options: ChatOptions
  ): AsyncGenerator<ChatChunk> {
    const systemPrompt = options.systemPrompt || '';
    const openaiMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.role === 'tool' ? m.content : m.content,
        tool_call_id: m.toolCallId,
        tool_calls: m.toolCalls,
      }));

    if (systemPrompt) {
      openaiMessages.unshift({ role: 'system', content: systemPrompt });
    }

    const openaiTools = tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: openaiMessages,
      tools: openaiTools,
      stream: true,
    });

    let currentToolCall: Partial<ToolCall> | null = null;
    let toolCallBuffer = '';

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta.content) {
        yield { type: 'text', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            if (currentToolCall) {
              try {
                JSON.parse(currentToolCall.function!.arguments);
                yield { type: 'tool_call', toolCall: currentToolCall as ToolCall };
                if (options.onToolCall) {
                  options.onToolCall(currentToolCall as ToolCall);
                }
              } catch (e) {
                // Invalid JSON
              }
            }
            currentToolCall = {
              id: tc.id,
              type: 'function',
              function: { name: tc.function?.name || '', arguments: '' },
            };
            toolCallBuffer = '';
          }
          if (tc.function?.arguments) {
            toolCallBuffer += tc.function.arguments;
            if (currentToolCall) {
              currentToolCall.function!.arguments = toolCallBuffer;
            }
          }
        }
      }

      if (choice.finish_reason === 'tool_calls' && currentToolCall) {
        try {
          JSON.parse(currentToolCall.function!.arguments);
          yield { type: 'tool_call', toolCall: currentToolCall as ToolCall };
          if (options.onToolCall) {
            options.onToolCall(currentToolCall as ToolCall);
          }
        } catch (e) {
          // Invalid JSON
        }
        currentToolCall = null;
      }
    }

    yield { type: 'done', usage: { inputTokens: 0, outputTokens: 0 } };
  }

  async countTokens(messages: Message[]): Promise<number> {
    const text = messages.map(m => m.content).join('\n');
    return Math.ceil(text.length / 4);
  }
}