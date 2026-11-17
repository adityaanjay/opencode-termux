import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import type { AIProvider, AgentConfig, Tool } from './types.js';
import { db } from '../db/index.js';
import { agentConfigs, settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const AVAILABLE_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing text',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          oldText: { type: 'string', description: 'Text to replace' },
          newText: { type: 'string', description: 'New text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in ms', default: 30000 },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
          recursive: { type: 'boolean', default: false },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for text in files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern' },
          path: { type: 'string', description: 'Directory to search' },
          include: { type: 'string', description: 'File pattern' },
        },
        required: ['pattern'],
      },
    },
  },
];

export async function createAIProvider(): Promise<AIProvider> {
  const providerSetting = await db.select().from(settings).where(eq(settings.key, 'ai.provider')).get();
  const apiKeySetting = await db.select().from(settings).where(eq(settings.key, 'ai.api_key')).get();
  const baseUrlSetting = await db.select().from(settings).where(eq(settings.key, 'ai.base_url')).get();

  const provider = providerSetting?.value?.replace(/"/g, '') || 'anthropic';
  const apiKey = apiKeySetting?.value?.replace(/"/g, '') || '';
  const baseUrl = baseUrlSetting?.value?.replace(/"/g, '') || undefined;

  if (!apiKey) {
    throw new Error('API key not configured. Run /config to set ai.api_key');
  }

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(apiKey);
    case 'openai':
    case 'nvidia':
      return new OpenAIProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function getAgentConfig(agentType: string): Promise<AgentConfig> {
  const agent = await db.select().from(agentConfigs).where(eq(agentConfigs.name, agentType)).get();
  if (!agent) {
    throw new Error(`Agent not found: ${agentType}`);
  }
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    permissions: JSON.parse(agent.permissions),
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
  };
}

export async function getModelSetting(): Promise<string> {
  const setting = await db.select().from(settings).where(eq(settings.key, 'ai.model')).get();
  return setting?.value?.replace(/"/g, '') || 'claude-3-5-sonnet-20241022';
}

export async function getTemperatureSetting(): Promise<number> {
  const setting = await db.select().from(settings).where(eq(settings.key, 'ai.temperature')).get();
  return parseFloat(setting?.value || '0.1');
}

export async function getMaxTokensSetting(): Promise<number> {
  const setting = await db.select().from(settings).where(eq(settings.key, 'ai.max_tokens')).get();
  return parseInt(setting?.value || '8192', 10);
}

export function getAgentPermissions(agentType: string): string[] {
  const agent = {
    build: ['read', 'write', 'execute', 'network'],
    plan: ['read'],
    general: ['read', 'write', 'execute'],
  };
  return agent[agentType as keyof typeof agent] || ['read'];
}