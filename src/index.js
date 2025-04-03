// Import dependencies
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Discord = require('discord-simple-api');
import { GeminiService } from './services/geminiService.js';
import { PatternService } from './services/patternService.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Initialize Discord client and services
const bot = new Discord(process.env.MAIN_BOT_TOKEN);
const gemini = new GeminiService();
const patternService = new PatternService();
let lastMessageId = null;
let lastResponseTime = 0;
const WAIT_BETWEEN_MESSAGES = 30000; // 30 seconds between messages (2 per minute)

let botUserId = null;
let isGeminiRateLimited = false;

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
    
    // Initialize Gemini
    console.log(chalk.yellow('[GEMINI] Connecting to Gemini 2.0 Flash-Lite...'));
    await gemini.init();
    console.log(chalk.green('[GEMINI] Connected successfully!'));
    
    // Initialize Pattern Service
    console.log(chalk.yellow('[PATTERN] Loading patterns...'));
    await patternService.init();
    console.log(chalk.green('[PATTERN] Patterns loaded!'));
    
    // Get bot information
    console.log(chalk.yellow('[DISCORD] Connecting to Discord...'));
    const userInfo = await bot.getUserInformation();
    botUserId = userInfo.id;
    console.log(chalk.green(`[DISCORD] Connected as ${userInfo.username} (ID: ${botUserId})`));
    console.log(chalk.cyan(`[CHANNEL] Monitoring channel ID: ${process.env.CHANNEL_ID}`));
    
    // Start message processing
    console.log(chalk.blue('[START] Bot is running and monitoring messages...'));
    console.log(chalk.yellow(`[INFO] Wait between messages: ${WAIT_BETWEEN_MESSAGES/1000}s (2 messages per minute)`));
    setInterval(processMessage, WAIT_BETWEEN_MESSAGES);
  } catch (error) {
    console.error(chalk.red('[ERROR] Failed to initialize services:'), error.message);
    process.exit(1);
  }
}

// Message handling function
async function processMessage() {
  try {
    const currentTime = Date.now();
    
    // Calculate time since last response
    const timeSinceLastResponse = currentTime - lastResponseTime;
    const timeUntilNextResponse = Math.max(0, WAIT_BETWEEN_MESSAGES - timeSinceLastResponse);
    
    // Wait between messages to avoid rate limits
    if (timeSinceLastResponse < WAIT_BETWEEN_MESSAGES) {
      console.log(chalk.yellow(`[COOLDOWN] Time since last response: ${Math.floor(timeSinceLastResponse/1000)}s`));
      console.log(chalk.yellow(`[COOLDOWN] Time until next response: ${Math.ceil(timeUntilNextResponse/1000)}s`));
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
    console.log(chalk.cyan(`[ORIGINAL] ${latestMessage.content}`));
    console.log(chalk.yellow(`[TAG] Bot was ${isTagged ? 'tagged' : 'not tagged'}`));

    // Skip if message matches patterns that don't need responses
    if (skipPatterns.some(pattern => pattern.test(latestMessage.content.trim()))) {
      console.log(chalk.yellow('[SKIP] Message appears to be an acknowledgment:', latestMessage.content));
      return;
    }

    let responseText = null;
    let responseSource = '';

    // Try Gemini first if not rate limited
    if (!isGeminiRateLimited) {
      try {
        console.log(chalk.blue('[GEMINI] Requesting response...'));
        responseText = await gemini.generateContent(latestMessage.content);
        responseSource = 'gemini';
      } catch (error) {
        if (error.message.includes('rate limit')) {
          console.log(chalk.yellow('[GEMINI] Rate limit reached, switching to pattern-based responses'));
          isGeminiRateLimited = true;
        } else {
          console.error(chalk.red('[GEMINI] Error:'), error.message);
        }
      }
    }

    // If Gemini failed or is rate limited, try pattern matching
    if (!responseText) {
      responseText = patternService.findResponse(latestMessage.content);
      responseSource = 'pattern';
      if (responseText) {
        console.log(chalk.cyan(`[PATTERN] Using pattern-based response`));
      }
    }

    // If no response found, use a simple reaction
    if (!responseText) {
      responseText = '👍';
      responseSource = 'fallback';
      console.log(chalk.yellow('[FALLBACK] No suitable response found, using simple reaction'));
    }

    // Truncate if too long
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + "...";
    }

    // Prepare message options
    const messageOptions = {
      message_reference: {
        message_id: latestMessage.id,
        channel_id: process.env.CHANNEL_ID,
        guild_id: latestMessage.guild_id,
        fail_if_not_exists: false
      }
    };

    // Add user mention if bot was tagged
    if (isTagged) {
      messageOptions.allowed_mentions = {
        replied_user: true,
        users: [latestMessage.author.id],
        parse: ['users']
      };
    }

    // Send message with appropriate options
    console.log(chalk.blue('[DISCORD] Sending response...'));
    const sentMessage = await bot.sendMessageToChannel(
      process.env.CHANNEL_ID,
      responseText,
      messageOptions
    );
    
    console.log(chalk.green('[SUCCESS] Message sent:'));
    console.log(chalk.blue(`[ORIGINAL] ${latestMessage.content}`));
    console.log(chalk.cyan(`[RESPONSE] ${responseText}`));
    console.log(chalk.magenta(`[SOURCE] Response from: ${responseSource}`));
    console.log(chalk.magenta(`[MODE] ${isTagged ? 'Tagged Response' : 'Last Message Reply'}`));
    console.log(chalk.yellow(`[TIMING] Time since last response: ${Math.floor(timeSinceLastResponse/1000)}s`));
    console.log(chalk.yellow(`[TIMING] Next response available in: ${WAIT_BETWEEN_MESSAGES/1000}s`));

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