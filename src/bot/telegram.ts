import { Bot, Context, session, SessionFlavor } from 'grammy';
import { db } from '../db/index.js';
import { settings, messages, sessions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { createAIProvider, getAgentConfig, AVAILABLE_TOOLS } from '../ai/index.js';
import type { Message as AIMessage, ToolCall } from '../ai/types.js';
import { v4 as uuidv4 } from 'uuid';

interface BotSessionData {
  sessionId: string | null;
  messages: AIMessage[];
  pendingToolCalls: ToolCall[];
  isProcessing: boolean;
}

type BotContext = Context & SessionFlavor<BotSessionData>;

const initialSessionData: BotSessionData = {
  sessionId: null,
  messages: [],
  pendingToolCalls: [],
  isProcessing: false,
};

export async function createTelegramBot(): Promise<Bot<BotContext> | null> {
  const tokenSetting = await db.select().from(settings).where(eq(settings.key, 'bot.telegram_token')).get();
  const token = tokenSetting?.value?.replace(/"/g, '') || '';

  if (!token) {
    console.log('Telegram bot token not configured. Set bot.telegram_token to enable.');
    return null;
  }

  const allowedUsersSetting = await db.select().from(settings).where(eq(settings.key, 'bot.telegram_allowed_users')).get();
  let allowedUsers: string[] = [];
  try {
    allowedUsers = JSON.parse(allowedUsersSetting?.value || '[]');
  } catch {
    allowedUsers = [];
  }

  const bot = new Bot<BotContext>(token);

  bot.use(session({ initial: () => ({ ...initialSessionData }) }));

  // Middleware to check allowed users
  bot.use(async (ctx, next) => {
    if (allowedUsers.length > 0) {
      const userId = ctx.from?.id.toString();
      if (!userId || !allowedUsers.includes(userId)) {
        await ctx.reply('⛔ Unauthorized. Contact admin to get access.');
        return;
      }
    }
    await next();
  });

  // Handle /start
  bot.command('start', async (ctx) => {
    const sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      name: `Telegram ${ctx.from?.username || ctx.from?.id}`,
      agentType: 'build',
      messageCount: 0,
    });

    ctx.session.sessionId = sessionId;
    ctx.session.messages = [];
    ctx.session.pendingToolCalls = [];

    await ctx.reply(
      '🤖 opencode-termux bot started!\n\n' +
      'Just send me a message and I\'ll respond with the AI agent.\n\n' +
      'Commands:\n' +
      '/new - Start new session\n' +
      '/agent - Switch agent (build/plan/general)\n' +
      '/help - Show this help'
    );
  });

  // Handle /new
  bot.command('new', async (ctx) => {
    const sessionId = uuidv4();
    await db.insert(sessions).values({
      id: sessionId,
      name: `Telegram ${ctx.from?.username || ctx.from?.id}`,
      agentType: 'build',
      messageCount: 0,
    });

    ctx.session.sessionId = sessionId;
    ctx.session.messages = [];
    ctx.session.pendingToolCalls = [];

    await ctx.reply('✅ New session started.');
  });

  // Handle /agent
  bot.command('agent', async (ctx) => {
    const args = ctx.match?.trim().split(' ') || [];
    const agentType = args[0];

    if (!agentType || !['build', 'plan', 'general'].includes(agentType)) {
      await ctx.reply('Usage: /agent <build|plan|general>');
      return;
    }

    if (ctx.session.sessionId) {
      await db.update(sessions).set({ agentType }).where(eq(sessions.id, ctx.session.sessionId));
    }

    await ctx.reply(`🤖 Switched to ${agentType} agent.`);
  });

  // Handle /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '🤖 opencode-termux Telegram Bot\n\n' +
      'Just chat normally - I\'ll use the AI agent to respond.\n\n' +
      'Commands:\n' +
      '/start - Initialize bot\n' +
      '/new - New session\n' +
      '/agent <build|plan|general> - Switch agent\n' +
      '/help - This message\n\n' +
      'File operations: Send a document and I can read it.\n' +
      'Commands: Prefix with ! to run shell commands (if allowed).'
    );
  });

  // Handle text messages
  bot.on('message:text', async (ctx) => {
    if (ctx.session.isProcessing) {
      await ctx.reply('⏳ Still processing previous message...');
      return;
    }

    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return;

    await handleUserMessage(ctx, text);
  });

  // Handle documents (files)
  bot.on('message:document', async (ctx) => {
    if (ctx.session.isProcessing) {
      await ctx.reply('⏳ Still processing previous message...');
      return;
    }

    const doc = ctx.message.document;
    const fileName = doc.file_name || 'file';
    const fileId = doc.file_id;

    await ctx.reply(`📥 Downloading ${fileName}...`);

    try {
      const file = await bot.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const content = await response.text();

      await ctx.reply(`📄 File: ${fileName}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``);

      // Add to messages as file read
      const fileMessage: AIMessage = {
        role: 'tool',
        content: `File: ${fileName}\n\`\`\`\n${content}\n\`\`\``,
        toolCallId: uuidv4(),
      };

      ctx.session.messages.push(fileMessage);
      if (ctx.session.sessionId) {
        await db.insert(messages).values({
          id: uuidv4(),
          sessionId: ctx.session.sessionId,
          role: 'tool',
          content: fileMessage.content,
          toolCallId: fileMessage.toolCallId,
          tokensIn: 0,
          tokensOut: 0,
        });
      }
    } catch (error) {
      await ctx.reply(`❌ Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  async function handleUserMessage(ctx: BotContext, text: string) {
    if (!ctx.session.sessionId) {
      await ctx.reply('❌ No active session. Use /start first.');
      return;
    }

    ctx.session.isProcessing = true;

    // Send "typing" action
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    const userMessage: AIMessage = { role: 'user', content: text };
    ctx.session.messages.push(userMessage);

    await db.insert(messages).values({
      id: uuidv4(),
      sessionId: ctx.session.sessionId,
      role: 'user',
      content: text,
      tokensIn: 0,
      tokensOut: 0,
    });

    try {
      const provider = await createAIProvider();
      const agentConfig = await getAgentConfig('build');
      const model = agentConfig.model;
      const temperature = agentConfig.temperature;
      const maxTokens = agentConfig.maxTokens;

      let assistantContent = '';
      const toolCalls: ToolCall[] = [];
      let statusMessage: ReturnType<typeof ctx.reply> | null = null;

      for await (const chunk of provider.streamChat(
        ctx.session.messages,
        AVAILABLE_TOOLS,
        {
          model,
          temperature,
          maxTokens,
          systemPrompt: agentConfig.systemPrompt,
          onToolCall: (tc) => {
            toolCalls.push(tc);
            ctx.session.pendingToolCalls.push(tc);
          },
        }
      )) {
        if (chunk.type === 'text' && chunk.content) {
          assistantContent += chunk.content;

          // Update status message periodically
          if (assistantContent.length % 500 === 0) {
            try {
              if (statusMessage) {
                await ctx.api.editMessageText(ctx.chat.id, (await statusMessage).message_id, assistantContent.slice(-4000));
              } else {
                statusMessage = await ctx.reply(assistantContent.slice(-4000));
              }
            } catch {
              // Ignore edit errors (message too long, etc.)
            }
          }
        }

        if (chunk.type === 'done') {
          const finalMessage: AIMessage = {
            role: 'assistant',
            content: assistantContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          };

          ctx.session.messages.push(finalMessage);
          ctx.session.pendingToolCalls = [];

          await db.insert(messages).values({
            id: uuidv4(),
            sessionId: ctx.session.sessionId,
            role: 'assistant',
            content: assistantContent,
            toolCalls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
            tokensIn: 0,
            tokensOut: 0,
          });

          // Execute tool calls
          for (const tc of toolCalls) {
            await executeToolCall(ctx, tc);
          }

          // Send final response
          if (assistantContent) {
            try {
              if (statusMessage) {
                await ctx.api.editMessageText(ctx.chat.id, (await statusMessage).message_id, assistantContent.slice(-4000));
              } else {
                await ctx.reply(assistantContent.slice(-4000));
              }
            } catch {
              // Fallback: send as new message
              await ctx.reply(assistantContent.slice(-4000));
            }
          }
          break;
        }
      }
    } catch (error) {
      await ctx.reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      ctx.session.isProcessing = false;
    }
  }

  async function executeToolCall(ctx: BotContext, toolCall: ToolCall) {
    const { name, arguments: args } = toolCall.function;
    let result: string;

    try {
      const parsedArgs = JSON.parse(args);

      switch (name) {
        case 'read_file': {
          const { readFile } = await import('../commands/file.js');
          result = await readFile(parsedArgs.path);
          break;
        }
        case 'write_file': {
          const { writeFile } = await import('../commands/file.js');
          result = await writeFile(parsedArgs.path, parsedArgs.content);
          break;
        }
        case 'edit_file': {
          const { editFile } = await import('../commands/file.js');
          result = await editFile(parsedArgs.path, parsedArgs.oldText, parsedArgs.newText);
          break;
        }
        case 'run_command': {
          const { runCommand } = await import('../commands/shell.js');
          const cmdResult = await runCommand(parsedArgs.command, parsedArgs.cwd, parsedArgs.timeout);
          result = `Exit code: ${cmdResult.exitCode}\n${cmdResult.stdout}\n${cmdResult.stderr}`;
          break;
        }
        case 'list_files': {
          const { listFiles } = await import('../commands/file.js');
          result = await listFiles(parsedArgs.path, parsedArgs.recursive);
          break;
        }
        case 'grep': {
          const { grep } = await import('../commands/file.js');
          result = await grep(parsedArgs.pattern, parsedArgs.path, parsedArgs.include);
          break;
        }
        default:
          result = `Unknown tool: ${name}`;
      }
    } catch (error) {
      result = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    const toolMessage: AIMessage = {
      role: 'tool',
      content: result,
      toolCallId: toolCall.id,
    };

    ctx.session.messages.push(toolMessage);
    if (ctx.session.sessionId) {
      await db.insert(messages).values({
        id: uuidv4(),
        sessionId: ctx.session.sessionId,
        role: 'tool',
        content: result,
        toolCallId: toolCall.id,
        tokensIn: 0,
        tokensOut: 0,
      });
    }

    // Notify user of tool result
    await ctx.reply(`🔧 Tool \`${name}\` result:\n\`\`\`\n${result.slice(0, 3000)}\n\`\`\``);
  }

  // Graceful shutdown
  process.on('SIGINT', () => bot.stop());
  process.on('SIGTERM', () => bot.stop());

  return bot;
}

export async function startTelegramBot(): Promise<void> {
  const bot = await createTelegramBot();
  if (bot) {
    console.log('🤖 Telegram bot starting...');
    await bot.start();
    console.log('✅ Telegram bot running');
  }
}