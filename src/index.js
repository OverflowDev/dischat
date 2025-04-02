// Import dependencies
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Discord = require('discord-simple-api');
import { GeminiService } from './services/geminiService.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Initialize Discord client and Gemini service
const bot = new Discord(process.env.BOT_TOKEN);
const gemini = new GeminiService();
let lastMessageId = null;
let lastResponseTime = 0;
const COOLDOWN = 45000; // 45 seconds cooldown to match Gemini's rate limit
const WAIT_AFTER_COOLDOWN = 2000; // 2 seconds after cooldown
const TOTAL_WAIT = 47000; // 47 seconds total

let botUserId = null;

// Messages that don't need responses
const skipPatterns = [
  /^(ok|okay|alright|got it|nice|cool|thanks|ty|thx|k)\b/i,
  /^(👍|✅|🆗|💯|✨|🙏)/,
  /^(sure|yep|yup|yeah|yes|no|nope)\b/i,
  /^(mhm|hmm|hm|ah|oh)\b/i
];

// Initialize services
async function initializeServices() {
  try {
    console.log(chalk.blue('[START] Initializing services...'));
    await gemini.init();
    
    // Get bot information
    const userInfo = await bot.getUserInformation();
    botUserId = userInfo.id;
    console.log(chalk.green(`[SUCCESS] Logged in as ${userInfo.username} (ID: ${botUserId})`));
    
    // Start message processing
    console.log(chalk.blue('[START] Bot is running and monitoring messages...'));
    console.log(chalk.yellow(`[INFO] Cooldown: ${COOLDOWN/1000}s, Wait after: ${WAIT_AFTER_COOLDOWN/1000}s`));
    setInterval(processMessage, COOLDOWN);
  } catch (error) {
    console.error(chalk.red('[ERROR] Failed to initialize services:'), error.message);
    process.exit(1);
  }
}

// Message handling function
async function processMessage() {
  try {
    const currentTime = Date.now();
    
    // Check if we're in cooldown period
    if (currentTime - lastResponseTime < COOLDOWN) {
      const remainingCooldown = Math.ceil((COOLDOWN - (currentTime - lastResponseTime)) / 1000);
      console.log(chalk.yellow(`[COOLDOWN] Waiting: ${remainingCooldown}s remaining`));
      return;
    }

    // Wait additional time after cooldown
    if (currentTime - lastResponseTime < COOLDOWN + WAIT_AFTER_COOLDOWN) {
      const remainingWait = Math.ceil((COOLDOWN + WAIT_AFTER_COOLDOWN - (currentTime - lastResponseTime)) / 1000);
      console.log(chalk.yellow(`[WAIT] Additional time: ${remainingWait}s remaining`));
      return;
    }

    console.log(chalk.blue('[FETCH] Checking for new messages...'));
    const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
    if (!messages || messages.length === 0) {
      console.log(chalk.yellow('[FETCH] No new messages found'));
      return;
    }

    const latestMessage = messages[0];
    if (latestMessage.author.bot || latestMessage.id === lastMessageId) {
      console.log(chalk.yellow('[FETCH] Message already processed or from bot'));
      return;
    }

    // Check if bot was tagged
    const isTagged = latestMessage.mentions?.users?.some(user => user.id === botUserId);
    
    console.log(chalk.blue(`[MESSAGE] New message from ${latestMessage.author.username}:`));
    console.log(chalk.cyan(`Content: ${latestMessage.content}`));
    console.log(chalk.yellow(`[TAG] Bot was ${isTagged ? 'tagged' : 'not tagged'}`));

    // Skip if message matches patterns that don't need responses
    if (skipPatterns.some(pattern => pattern.test(latestMessage.content.trim()))) {
      console.log(chalk.yellow('[SKIP] Message appears to be an acknowledgment:', latestMessage.content));
      return;
    }

    // Generate response using Gemini
    console.log(chalk.blue('[GEMINI] Requesting response...'));
    const responseText = await gemini.generateContent(latestMessage.content);

    // Truncate if too long
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + "...";
    }

    // Send message with reply
    console.log(chalk.blue('[DISCORD] Sending response...'));
    const sentMessage = await bot.sendMessageToChannel(
      process.env.CHANNEL_ID,
      responseText,
      {
        message_reference: {
          message_id: latestMessage.id,
          channel_id: process.env.CHANNEL_ID,
          guild_id: latestMessage.guild_id,
          fail_if_not_exists: false
        },
        allowed_mentions: {
          replied_user: true,
          users: [latestMessage.author.id],
          parse: ['users']
        }
      }
    );
    
    console.log(chalk.green('[SUCCESS] Message sent:'));
    console.log(chalk.blue(`Original: ${latestMessage.content.substring(0, 50)}${latestMessage.content.length > 50 ? '...' : ''}`));
    console.log(chalk.cyan(`Response: ${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}`));
    console.log(chalk.magenta(`[MODE] ${isTagged ? 'Direct Reply' : 'Last Message Reply'}`));

    lastResponseTime = currentTime;
    lastMessageId = latestMessage.id;

  } catch (error) {
    console.error(chalk.red('[ERROR] Processing message:'), error);
    if (error.response?.data) {
      console.error(chalk.red('[ERROR] Discord API Error:'), JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Start the bot
initializeServices();

// Error handling
process.on('unhandledRejection', error => {
  console.error(chalk.red('[ERROR] Unhandled promise rejection:'), error);
}); 