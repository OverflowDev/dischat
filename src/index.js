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
let lastBotMessageId = null;

// Chat memory to store recent conversations
const chatMemory = {
  messages: [],
  maxSize: 10, // Store last 10 messages
  addMessage: function(message) {
    this.messages.push({
      author: message.author.username,
      content: message.content,
      timestamp: message.timestamp,
      isBot: message.author.bot
    });
    if (this.messages.length > this.maxSize) {
      this.messages.shift(); // Remove oldest message
    }
  },
  getContext: function() {
    return this.messages.map(msg => `${msg.author}: ${msg.content}`).join('\n');
  }
};

// Messages that don't need responses
const skipPatterns = [
  /^(ok|okay|alright|got it|nice|cool|thanks|ty|thx|k)\b/i,
  /^(👍|✅|🆗|💯|✨|🙏)/,
  /^(sure|yep|yup|yeah|yes|no|nope)\b/i,
  /^(mhm|hmm|hm|ah|oh)\b/i
];

// Nigerian response styles
const nigerianResponses = {
  greetings: [
    "Wetin dey happen? 😎",
    "How far na? ✨",
    "Abeg wetin dey sup? 😂",
    "Oya na, wetin dey? 🎉",
    "E be like say you dey miss me o! 😏"
  ],
  acknowledgments: [
    "Na you dey talk! 😂",
    "You don talk am finish! 💯",
    "Abeg no vex, I dey here! 😎",
    "Oya na, I hear you! ✨",
    "E be like say you sabi book o! 📚"
  ],
  reactions: [
    "No be small thing o! 😂",
    "E be like say you dey vex! 😅",
    "Abeg no kill person with laughter! 🤣",
    "You too much! 💪",
    "Na wa for you o! 😏"
  ]
};

// Queue for pending responses
const responseQueue = {
  messages: [],
  add: function(message, shouldTag) {
    this.messages.push({
      message,
      shouldTag,
      timestamp: Date.now()
    });
  },
  getNext: function() {
    return this.messages.shift();
  },
  clearOld: function() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    this.messages = this.messages.filter(msg => msg.timestamp > fiveMinutesAgo);
  }
};

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
    
    // Clear old messages from queue
    responseQueue.clearOld();
    
    // If we have messages in queue and enough time has passed, process next one
    if (responseQueue.messages.length > 0 && timeSinceLastResponse >= WAIT_BETWEEN_MESSAGES) {
      const nextMessage = responseQueue.getNext();
      if (nextMessage) {
        await sendResponse(nextMessage.message, nextMessage.shouldTag);
        return;
      }
    }

    console.log(chalk.blue('[FETCH] Checking for new messages...'));
    const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 50);
    
    if (!messages || messages.length === 0) {
      console.log(chalk.yellow('[FETCH] No messages found'));
      return;
    }

    // Find all relevant messages to respond to
    const messagesToRespond = [];
    
    for (const message of messages) {
      if (message.id === lastMessageId) continue;
      
      const isTagged = message.mentions?.users?.some(user => user.id === botUserId);
      const isReplyToBot = message.referenced_message?.author?.id === botUserId;
      
      if (isTagged || isReplyToBot) {
        messagesToRespond.push({
          message,
          shouldTag: true
        });
      }
    }

    // If no tagged/reply messages found, use the last non-bot message
    if (messagesToRespond.length === 0) {
      for (const message of messages) {
        if (!message.author.bot && message.id !== lastMessageId) {
          messagesToRespond.push({
            message,
            shouldTag: false
          });
          break;
        }
      }
    }

    if (messagesToRespond.length === 0) {
      console.log(chalk.yellow('[SKIP] No new messages to respond to'));
      return;
    }

    // Add all messages to queue
    messagesToRespond.forEach(({message, shouldTag}) => {
      responseQueue.add(message, shouldTag);
    });

    // Process next message if we can
    if (timeSinceLastResponse >= WAIT_BETWEEN_MESSAGES) {
      const nextMessage = responseQueue.getNext();
      if (nextMessage) {
        await sendResponse(nextMessage.message, nextMessage.shouldTag);
      }
    } else {
      console.log(chalk.yellow(`[QUEUE] Added ${messagesToRespond.length} messages to queue. Next response in ${Math.ceil(timeUntilNextResponse/1000)}s`));
    }

  } catch (error) {
    console.error(chalk.red('[ERROR] Processing message:'), error);
    if (error.response?.data) {
      console.error(chalk.red('[ERROR] Discord API Error:'), JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Function to send response
async function sendResponse(messageToRespondTo, shouldTagUser) {
  try {
    // Add message to chat memory
    chatMemory.addMessage(messageToRespondTo);

    console.log(chalk.blue(`[MESSAGE] Processing message from ${messageToRespondTo.author.username}:`));
    console.log(chalk.cyan(`[ORIGINAL] ${messageToRespondTo.content}`));
    console.log(chalk.yellow(`[MODE] ${shouldTagUser ? 'Tagged/Reply Response' : 'Last Message Reply'}`));

    // Skip if message matches patterns that don't need responses
    if (skipPatterns.some(pattern => pattern.test(messageToRespondTo.content.trim()))) {
      console.log(chalk.yellow('[SKIP] Message appears to be an acknowledgment:', messageToRespondTo.content));
      return;
    }

    let responseText = null;
    let responseSource = '';

    // Try Gemini first if not rate limited
    if (!isGeminiRateLimited) {
      try {
        console.log(chalk.blue('[GEMINI] Requesting response...'));
        const context = chatMemory.getContext();
        const prompt = `Previous chat context:\n${context}\n\nCurrent message to respond to: ${messageToRespondTo.content}\n\nRespond in a casual Nigerian style, using Nigerian slang and expressions naturally. Keep it fun and respectful.`;
        responseText = await gemini.generateContent(prompt);
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
      responseText = patternService.findResponse(messageToRespondTo.content);
      responseSource = 'pattern';
      if (responseText) {
        console.log(chalk.cyan(`[PATTERN] Using pattern-based response`));
      }
    }

    // If no response found, use a Nigerian-style reaction
    if (!responseText) {
      const randomResponses = shouldTagUser ? nigerianResponses.acknowledgments : nigerianResponses.reactions;
      responseText = randomResponses[Math.floor(Math.random() * randomResponses.length)];
      responseSource = 'fallback';
      console.log(chalk.yellow('[FALLBACK] Using Nigerian-style reaction'));
    }

    // Truncate if too long
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + "...";
    }

    // Prepare message options for reply
    const messageOptions = {
      message_reference: {
        message_id: messageToRespondTo.id,
        channel_id: process.env.CHANNEL_ID,
        guild_id: messageToRespondTo.guild_id,
        fail_if_not_exists: true
      }
    };

    // Add user mention if needed
    if (shouldTagUser) {
      messageOptions.allowed_mentions = {
        replied_user: true,
        users: [messageToRespondTo.author.id],
        parse: ['users']
      };
      responseText = `<@${messageToRespondTo.author.id}> ${responseText}`;
    }

    // Send message with appropriate options
    console.log(chalk.blue('[DISCORD] Sending response...'));
    const sentMessage = await bot.sendMessageToChannel(
      process.env.CHANNEL_ID,
      responseText,
      messageOptions
    );

    // Store the bot's message ID for reply tracking
    lastBotMessageId = sentMessage.id;
    
    // Add bot's response to chat memory
    chatMemory.addMessage(sentMessage);
    
    console.log(chalk.green('[SUCCESS] Message sent:'));
    console.log(chalk.blue(`[ORIGINAL] ${messageToRespondTo.content}`));
    console.log(chalk.cyan(`[RESPONSE] ${responseText}`));
    console.log(chalk.magenta(`[SOURCE] Response from: ${responseSource}`));
    console.log(chalk.magenta(`[MODE] ${shouldTagUser ? 'Tagged/Reply Response' : 'Last Message Reply'}`));

    lastResponseTime = Date.now();
    lastMessageId = messageToRespondTo.id;

  } catch (error) {
    console.error(chalk.red('[ERROR] Sending response:'), error);
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