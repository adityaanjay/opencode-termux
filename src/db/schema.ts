import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Sessions table
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name'),
  agentType: text('agent_type').notNull().default('build'),
  messageCount: integer('message_count').notNull().default(0),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  updatedAtIdx: index('idx_sessions_updated_at').on(table.updatedAt),
  agentTypeIdx: index('idx_sessions_agent_type').on(table.agentType),
}));

// Messages table
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),
  toolCallId: text('tool_call_id'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  sessionIdIdx: index('idx_messages_session_id').on(table.sessionId, table.createdAt),
  roleIdx: index('idx_messages_role').on(table.role),
}));

// File references table
export const fileRefs = sqliteTable('file_refs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  contentHash: text('content_hash'),
  language: text('language'),
  size: integer('size').notNull().default(0),
  lastReadAt: text('last_read_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  sessionIdIdx: index('idx_file_refs_session_id').on(table.sessionId),
  sessionPathIdx: uniqueIndex('idx_file_refs_session_path').on(table.sessionId, table.path),
}));

// Commands table
export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  command: text('command').notNull(),
  cwd: text('cwd'),
  stdout: text('stdout'),
  stderr: text('stderr'),
  exitCode: integer('exit_code'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  sessionIdIdx: index('idx_commands_session_id').on(table.sessionId, table.createdAt),
}));

// Agent configurations table
export const agentConfigs = sqliteTable('agent_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  permissions: text('permissions').notNull().default('["read","write","execute"]'),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  temperature: real('temperature').notNull().default(0.1),
  maxTokens: integer('max_tokens').notNull().default(8192),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// Settings table
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  category: text('category').notNull().default('general'),
  description: text('description'),
  schema: text('schema'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  categoryIdx: index('idx_settings_category').on(table.category),
}));

// Type inference
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type FileRef = typeof fileRefs.$inferSelect;
export type NewFileRef = typeof fileRefs.$inferInsert;
export type Command = typeof commands.$inferSelect;
export type NewCommand = typeof commands.$inferInsert;
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type NewAgentConfig = typeof agentConfigs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;