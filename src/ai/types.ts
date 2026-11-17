export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIProvider {
  name: string;
  streamChat(messages: Message[], tools: Tool[], options: ChatOptions): AsyncGenerator<ChatChunk>;
  countTokens(messages: Message[]): Promise<number>;
}

export interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  onToolCall?: (toolCall: ToolCall) => void;
}

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  toolResult?: { toolCallId: string; content: string };
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export const AGENT_TYPES = ['build', 'plan', 'general'] as const;
export type AgentType = typeof AGENT_TYPES[number];