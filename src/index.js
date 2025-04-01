import 'dotenv/config';
import Discord from 'discord-simple-api';
import chalk from 'chalk';
import { GeminiService } from './services/geminiService.js';

let bot;
let gemini;
let lastMessageId = null;
const responseChance = process.env.RESPONSE_CHANCE || 0.8;

async function startBot() {
  try {
    // Initialize and test Gemini
    console.log(chalk.yellow('Initializing Gemini AI...'));
    gemini = new GeminiService();
    await gemini.init();
    console.log(chalk.green('✓ Gemini AI initialized successfully'));

    // Initialize Discord bot
    bot = new Discord(process.env.BOT_TOKEN);
    const userInfo = await bot.getUserInformation();
    const me = userInfo.username + '#' + userInfo.discriminator;
    
    console.log(chalk.green('\nLogged in as %s'), me);
    console.log(chalk.yellow('Checking for new messages every 20 seconds'));
    console.log(chalk.yellow('Response chance: %s%'), responseChance * 100);
    
    // Start message checking
    setInterval(processNewMessages, 20000);
  } catch (error) {
    console.error(chalk.red('Startup error:'), error.message);
    process.exit(1);
  }
}

async function processNewMessages() {
  try {
    // Get only the latest message (simplified message processing)
    const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[0];

    // Prevent duplicate responses by checking message ID
    if (latestMessage.id === lastMessageId || latestMessage.author.bot) {
      return;
    }

    // Random chance to respond
    if (Math.random() > responseChance) {
      lastMessageId = latestMessage.id;
      return;
    }

    // Generate concise response using Gemini
    const response = await gemini.generateContent(latestMessage.content);
    
    // Proper Discord reply with tagging
    const replyOptions = {
      content: response,
      message_reference: {
        message_id: latestMessage.id,
        channel_id: process.env.CHANNEL_ID,
        guild_id: latestMessage.guild_id
      },
      allowed_mentions: {
        parse: ['users']
      }
    };
    
    // Send the reply
    await bot.sendMessageToChannel(process.env.CHANNEL_ID, replyOptions);
    console.log(
      chalk.green('[REPLY] To: %s | Message: %s | Response: %s'),
      latestMessage.author.username,
      latestMessage.content,
      response
    );
    
    lastMessageId = latestMessage.id;
  } catch (error) {
    console.error(chalk.red('Error processing messages:'), error.message);
  }
}

// Start the bot
startBot().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
}); 