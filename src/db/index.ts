import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = process.env.DATABASE_URL?.replace('file:', '') || './data/opencode.db';
mkdirSync(dirname(dataDir), { recursive: true });

const sqlite = new Database(dataDir);
// Enable WAL mode for better concurrency
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

export function initializeDatabase() {
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      agent_type TEXT NOT NULL DEFAULT 'build',
      message_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_agent_type ON sessions (agent_type);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages (session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_role ON messages (role);

    CREATE TABLE IF NOT EXISTS file_refs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content_hash TEXT,
      language TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_file_refs_session_id ON file_refs (session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_refs_session_path ON file_refs (session_id, path);

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      cwd TEXT,
      stdout TEXT,
      stderr TEXT,
      exit_code INTEGER,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_commands_session_id ON commands (session_id, created_at);

    CREATE TABLE IF NOT EXISTS agent_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '["read","write","execute"]',
      model TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      temperature REAL NOT NULL DEFAULT 0.1,
      max_tokens INTEGER NOT NULL DEFAULT 8192,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT,
      schema TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_settings_category ON settings (category);
  `);

  // Insert default agent configs
  const defaultAgents = [
    {
      id: 'agent-build',
      name: 'build',
      description: 'Full-access development agent: read, write, execute files and commands',
      permissions: '["read","write","execute","network"]',
      model: 'claude-3-5-sonnet-20241022',
      system_prompt: 'You are a senior software engineer. You have full access to the filesystem and can run commands. Be concise. Prefer editing files over creating new ones. Follow the user\'s existing code style.',
      temperature: 0.1,
      max_tokens: 8192,
    },
    {
      id: 'agent-plan',
      name: 'plan',
      description: 'Read-only analysis agent: explore codebase, answer questions, propose plans',
      permissions: '["read"]',
      model: 'claude-3-5-sonnet-20241022',
      system_prompt: 'You are a software architect. You can only read files and explore the codebase. You cannot write files or run commands. Provide thorough analysis and clear plans.',
      temperature: 0.1,
      max_tokens: 8192,
    },
    {
      id: 'agent-general',
      name: 'general',
      description: 'General-purpose agent for complex multi-step tasks',
      permissions: '["read","write","execute"]',
      model: 'claude-3-5-sonnet-20241022',
      system_prompt: 'You are a versatile AI assistant. You can read, write, and execute. Break complex tasks into steps. Ask for clarification when needed.',
      temperature: 0.1,
      max_tokens: 8192,
    },
  ];

  const insertAgent = sqlite.prepare(`
    INSERT OR IGNORE INTO agent_configs (id, name, description, permissions, model, system_prompt, temperature, max_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const agent of defaultAgents) {
    try {
      insertAgent.run(agent.id, agent.name, agent.description, agent.permissions, agent.model, agent.system_prompt, agent.temperature, agent.max_tokens);
    } catch (e) {
      // Ignore duplicates
    }
  }

  // Insert default settings
  const defaultSettings = [
    ['ai.provider', '"anthropic"', 'ai', 'AI provider: anthropic or openai', '{"type":"string","enum":["anthropic","openai"]}'],
    ['ai.model', '"claude-3-5-sonnet-20241022"', 'ai', 'Model to use', '{"type":"string"}'],
    ['ai.api_key', '""', 'ai', 'API key (user provides)', '{"type":"string"}'],
    ['ai.max_tokens', '8192', 'ai', 'Max output tokens', '{"type":"integer","minimum":1024,"maximum":32768}'],
    ['ai.temperature', '0.1', 'ai', 'Sampling temperature', '{"type":"number","minimum":0,"maximum":2}'],
    ['editor.tab_size', '2', 'editor', 'Tab size in spaces', '{"type":"integer","minimum":1,"maximum":8}'],
    ['editor.line_numbers', 'true', 'editor', 'Show line numbers', '{"type":"boolean"}'],
    ['editor.word_wrap', 'false', 'editor', 'Enable word wrap', '{"type":"boolean"}'],
    ['terminal.theme', '"dark"', 'terminal', 'Color theme: dark, light, or auto', '{"type":"string","enum":["dark","light","auto"]}'],
    ['terminal.font_size', '14', 'terminal', 'Font size in points', '{"type":"integer","minimum":10,"maximum":24}'],
    ['session.auto_save', 'true', 'general', 'Auto-save session after each message', '{"type":"boolean"}'],
    ['session.max_history_days', '90', 'general', 'Days to keep sessions before cleanup', '{"type":"integer","minimum":1,"maximum":365}'],
    ['lsp.enabled', 'true', 'editor', 'Enable LSP code intelligence', '{"type":"boolean"}'],
    ['lsp.servers', '{"typescript":"typescript-language-server","python":"pyright","rust":"rust-analyzer"}', 'editor', 'LSP servers by language', '{"type":"object"}'],
    ['keybindings.agent_switch', '"Tab"', 'terminal', 'Key to switch agents', '{"type":"string"}'],
    ['keybindings.command_mode', '"!"', 'terminal', 'Prefix for command execution', '{"type":"string"}'],
    ['keybindings.file_read', '"@"', 'terminal', 'Prefix for file read', '{"type":"string"}'],
    ['keybindings.help', '"?"', 'terminal', 'Show help', '{"type":"string"}'],
  ];

  const insertSetting = sqlite.prepare(`
    INSERT OR IGNORE INTO settings (key, value, category, description, schema)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const [key, value, category, description, schema] of defaultSettings) {
    try {
      insertSetting.run(key, value, category, description, schema);
    } catch (e) {
      // Ignore duplicates
    }
  }
}

export function closeDatabase() {
  sqlite.close();
}