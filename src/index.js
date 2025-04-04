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

// Track used responses to avoid repetition
const usedResponses = {
  responses: new Set(),
  timestamp: Date.now(),
  
  // Clear responses older than 1 hour
  clearOld: function() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (this.timestamp < oneHourAgo) {
      this.responses.clear();
      this.timestamp = Date.now();
    }
  },
  
  // Add a response to tracking
  add: function(response) {
    this.clearOld();
    this.responses.add(response);
  },
  
  // Check if response was used recently
  wasUsed: function(response) {
    this.clearOld();
    return this.responses.has(response);
  }
};

// Simulate human typing delay (between 1-3 seconds per 50 characters)
function calculateTypingDelay(text) {
  const baseDelay = 1000; // Base delay of 1 second
  const charsPerSecond = 50; // Average human types 50 characters per second
  const randomFactor = Math.random() * 2 + 1; // Random factor between 1-3
  return Math.min(Math.max((text.length / charsPerSecond) * 1000 * randomFactor, baseDelay), 5000);
}

// Chat memory with improved context tracking
const chatMemory = {
  messages: [],
  maxSize: 10,
  topics: new Set(), // Track conversation topics
  
  addMessage: function(message) {
    // Extract potential topics from message
    const words = message.content.toLowerCase().split(/\s+/);
    words.forEach(word => {
      if (word.length > 3) this.topics.add(word); // Add words as topics
    });
    
    this.messages.push({
      author: message.author.username,
      content: message.content,
      timestamp: message.timestamp || Date.now(),
      isBot: message.author.bot,
      topics: [...this.topics] // Store current topics with message
    });
    
    if (this.messages.length > this.maxSize) {
      this.messages.shift();
    }
  },
  
  getContext: function() {
    return this.messages.map(msg => `${msg.author}: ${msg.content}`).join('\n');
  },
  
  // Get current conversation mood based on recent messages
  getMood: function() {
    const recentMessages = this.messages.slice(-3);
    const hasEmojis = recentMessages.some(msg => msg.content.match(/[\u{1F300}-\u{1F9FF}]/u));
    const hasExclamation = recentMessages.some(msg => msg.content.includes('!'));
    const hasQuestion = recentMessages.some(msg => msg.content.includes('?'));
    
    if (hasQuestion) return 'curious';
    if (hasExclamation && hasEmojis) return 'excited';
    if (hasEmojis) return 'playful';
    return 'casual';
  }
};

// Messages that don't need responses
const skipPatterns = [
  /^(ok|okay|alright|got it|nice|cool|thanks|ty|thx|k)\b/i,
  /^(👍|✅|🆗|💯|✨|🙏)/,
  /^(sure|yep|yup|yeah|yes|no|nope)\b/i,
  /^(mhm|hmm|hm|ah|oh)\b/i
];

// Enhanced Nigerian response styles with more variety
const nigerianResponses = {
  greetings: [
    "Wetin dey happen? 😎",
    "How far na? ✨",
    "Abeg wetin dey sup? 😂",
    "Oya na, wetin dey? 🎉",
    "My guy, long time! 😏",
    "My guy! 🙌",
    "Oshey baddest! 💫",
    "Chaii, see who dey here! 🌟"
  ],
  acknowledgments: [
    "Na you dey talk! 😂",
    "You don talk am! 💯",
    "Abeg no vex, I dey here! 😎",
    "Oya na, I hear you! ✨",
    "You sabi die! 📚",
    "You get point sha! 👌",
    "I feel you die! 💪",
    "You no dey lie! 💯"
  ],
  reactions: [
    "No be small thing o! 😂",
    "E dey pain you? 😅",
    "Abeg no wound me! 🤣",
    "You too much! 💪",
    "Na wa for you o! 😏",
    "Omo mehn! 😱",
    "E shock you? 😄",
    "Wahala dey o! 🔥"
  ],
  curious: [
    "Tell me wetin sup! 👀",
    "You get gist? 🤔",
    "Wetin happen next? 🎬",
    "Abeg continue! 😮"
  ],
  excited: [
    "Omo mehn! 🔥",
    "Chaii! See levels! 🎉",
    "Na mad ting! 💫",
    "E sweet me die! 🙌"
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
    
    console.log(chalk.blue('[FETCH] Checking for new messages...'));
    const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 50);
    
    if (!messages || messages.length === 0) {
      console.log(chalk.yellow('[FETCH] No messages found'));
      return;
    }

    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Find the index of our last message
    const lastBotMessageIndex = messages.findIndex(msg => msg.id === lastBotMessageId);
    
    // Get messages after our last message, or all messages if we haven't sent any
    const messagesToCheck = lastBotMessageIndex !== -1 
      ? messages.slice(lastBotMessageIndex + 1)
      : messages;

    if (messagesToCheck.length === 0) {
      console.log(chalk.yellow('[SKIP] No new messages since last response'));
      return;
    }

    let messageToRespond = null;
    let shouldTag = false;
    let mentionType = null;

    // Check for direct @mentions first (highest priority)
    for (const message of messagesToCheck) {
      if (message.author.bot || message.id === lastMessageId) continue;

      // Explicitly check for mentions array
      if (message.mentions && Array.isArray(message.mentions.users)) {
        const isBotMentioned = message.mentions.users.some(user => user.id === botUserId);
        if (isBotMentioned) {
          messageToRespond = message;
          shouldTag = true;
          mentionType = 'mention';
          console.log(chalk.blue(`[MENTION] Found direct mention from ${message.author.username}`));
          console.log(chalk.cyan(`[DEBUG] Mention message: ${message.content}`));
          break;
        }
      }
    }

    // If no @mentions, check for replies to bot's messages
    if (!messageToRespond) {
      for (const message of messagesToCheck) {
        if (message.author.bot || message.id === lastMessageId) continue;

        if (message.referenced_message && 
            message.referenced_message.author && 
            message.referenced_message.author.id === botUserId) {
          messageToRespond = message;
          shouldTag = true;
          mentionType = 'reply';
          console.log(chalk.blue(`[REPLY] Found reply to bot from ${message.author.username}`));
          console.log(chalk.cyan(`[DEBUG] Reply message: ${message.content}`));
          break;
        }
      }
    }

    // If no mentions or replies, use most recent message
    if (!messageToRespond) {
      const recentMessages = [...messagesToCheck].reverse();
      messageToRespond = recentMessages.find(message => 
        !message.author.bot && message.id !== lastMessageId
      );
      shouldTag = false;
      if (messageToRespond) {
        console.log(chalk.blue(`[LAST] Using most recent message from ${messageToRespond.author.username}`));
        console.log(chalk.cyan(`[DEBUG] Last message: ${messageToRespond.content}`));
      }
    }

    if (!messageToRespond) {
      console.log(chalk.yellow('[SKIP] No valid messages to respond to'));
      return;
    }

    // If enough time has passed since last response, send new response
    if (timeSinceLastResponse >= WAIT_BETWEEN_MESSAGES) {
      await sendResponse(messageToRespond, shouldTag, mentionType);
    } else {
      const waitTime = Math.ceil(timeUntilNextResponse/1000);
      console.log(chalk.yellow(`[WAIT] Found message to respond to. Waiting ${waitTime}s for rate limit`));
      // Schedule the response
      setTimeout(() => sendResponse(messageToRespond, shouldTag, mentionType), timeUntilNextResponse);
    }

  } catch (error) {
    console.error(chalk.red('[ERROR] Processing message:'), error);
    if (error.response?.data) {
      console.error(chalk.red('[ERROR] Discord API Error:'), JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Add this function before sendResponse
function addDynamicUserMention(text, userId) {
  const positions = [
    // Start
    () => `<@${userId}> ${text}`,
    // Middle - after first sentence or comma
    () => {
      const splitIndex = text.match(/[.!?]|\,/);
      if (splitIndex) {
        const index = splitIndex.index + 1;
        return `${text.slice(0, index)} <@${userId}>${text.slice(index)}`;
      }
      return `${text} <@${userId}>`;
    },
    // End
    () => `${text} <@${userId}>`
  ];
  
  // Randomly select a position
  const position = positions[Math.floor(Math.random() * positions.length)];
  return position();
}

// Function to send response
async function sendResponse(messageToRespondTo, shouldTagUser, mentionType) {
  try {
    // Add message to chat memory
    chatMemory.addMessage(messageToRespondTo);

    console.log(chalk.blue(`[MESSAGE] Processing message from ${messageToRespondTo.author.username}:`));
    console.log(chalk.cyan(`[ORIGINAL] ${messageToRespondTo.content}`));
    console.log(chalk.yellow(`[MODE] ${shouldTagUser ? `${mentionType || 'Tagged'} Response` : 'Last Message Reply'}`));

    // Skip if message matches patterns that don't need responses
    if (skipPatterns.some(pattern => pattern.test(messageToRespondTo.content.trim()))) {
      console.log(chalk.yellow('[SKIP] Message appears to be an acknowledgment:', messageToRespondTo.content));
      return;
    }

    // Start typing indicator before processing response
    try {
      await bot.startTyping(process.env.CHANNEL_ID);
      console.log(chalk.blue('[TYPING] Started typing indicator'));
    } catch (error) {
      console.log(chalk.yellow('[TYPING] Could not start typing indicator:', error.message));
    }

    let responseText = null;
    let responseSource = '';

    // Get current conversation mood
    const mood = chatMemory.getMood();

    // Try Gemini first if not rate limited
    if (!isGeminiRateLimited) {
      try {
        console.log(chalk.blue('[GEMINI] Requesting response...'));
        const context = chatMemory.getContext();
        const prompt = `Previous chat context:\n${context}\n\nCurrent message to respond to: ${messageToRespondTo.content}\n\nRespond in a casual Nigerian style, using Nigerian slang and expressions naturally. Keep it very short (max 2 sentences) and fun. Match the current mood: ${mood}. Make it sound like a quick human response typed in 20 seconds or less.`;
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

    // If Gemini failed or is rate limited, use mood-based responses
    if (!responseText) {
      let responses;
      switch (mood) {
        case 'curious':
          responses = nigerianResponses.curious;
          break;
        case 'excited':
          responses = nigerianResponses.excited;
          break;
        case 'playful':
          responses = nigerianResponses.reactions;
          break;
        default:
          responses = shouldTagUser ? nigerianResponses.acknowledgments : nigerianResponses.reactions;
      }

      // Filter out recently used responses
      const availableResponses = responses.filter(response => !usedResponses.wasUsed(response));
      
      // If all responses were used, clear history and use all responses
      if (availableResponses.length === 0) {
        usedResponses.responses.clear();
        responseText = responses[Math.floor(Math.random() * responses.length)];
      } else {
        responseText = availableResponses[Math.floor(Math.random() * availableResponses.length)];
      }
      
      usedResponses.add(responseText);
      responseSource = 'pattern';
      console.log(chalk.cyan(`[PATTERN] Using mood-based response (${mood})`));
    }

    // Truncate if too long
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + "...";
    }

    // Simulate typing delay
    const typingDelay = calculateTypingDelay(responseText);
    console.log(chalk.blue(`[TYPING] Simulating typing for ${Math.ceil(typingDelay/1000)}s`));
    await new Promise(resolve => setTimeout(resolve, typingDelay));

    // Prepare message options with reference
    const messageOptions = {
      content: responseText,
      message_reference: {
        message_id: messageToRespondTo.id,
        channel_id: process.env.CHANNEL_ID,
        guild_id: messageToRespondTo.guild_id,
        fail_if_not_exists: false
      },
      allowed_mentions: {
        parse: ['users'],
        replied_user: true
      }
    };

    // Only add user mention if it's a direct mention or reply
    if (shouldTagUser) {
      responseText = addDynamicUserMention(responseText, messageToRespondTo.author.id);
      messageOptions.content = responseText;
    }

    // Send message with appropriate options
    console.log(chalk.blue('[DISCORD] Sending response...'));
    const sentMessage = await bot.sendMessageToChannel(
      process.env.CHANNEL_ID,
      messageOptions.content,
      {
        message_reference: messageOptions.message_reference,
        allowed_mentions: messageOptions.allowed_mentions
      }
    );

    // Stop typing indicator after sending message
    try {
      await bot.stopTyping(process.env.CHANNEL_ID);
      console.log(chalk.blue('[TYPING] Stopped typing indicator'));
    } catch (error) {
      console.log(chalk.yellow('[TYPING] Could not stop typing indicator:', error.message));
    }

    // Store the bot's message ID for reply tracking
    lastBotMessageId = sentMessage.id;
    
    // Add bot's response to chat memory
    chatMemory.addMessage(sentMessage);
    
    console.log(chalk.green('[SUCCESS] Message sent:'));
    console.log(chalk.blue(`[ORIGINAL] ${messageToRespondTo.content}`));
    console.log(chalk.cyan(`[RESPONSE] ${responseText}`));
    console.log(chalk.magenta(`[SOURCE] Response from: ${responseSource}`));
    console.log(chalk.magenta(`[MODE] ${shouldTagUser ? `${mentionType || 'Tagged'} Response` : 'Last Message Reply'}`));
    console.log(chalk.yellow(`[MOOD] Current conversation mood: ${mood}`));

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