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
    "Wetin dey happen",
    "How far na",
    "Abeg wetin dey sup",
    "Oya na, wetin dey",
    "My guy, long time",
    "My guy",
    "Oshey baddest",
    "Chaii, see who dey here"
  ],
  acknowledgments: [
    "Na you dey talk",
    "You don talk am",
    "Abeg no vex, I dey here",
    "Oya na, I hear you",
    "You sabi die",
    "You get point sha",
    "I feel you die",
    "You no dey lie"
  ],
  reactions: [
    "No be small thing o",
    "E dey pain you",
    "Abeg no wound me",
    "You too much",
    "Na wa for you o",
    "Omo mehn",
    "E shock you",
    "Wahala dey o"
  ],
  curious: [
    "Tell me wetin sup",
    "You get gist",
    "Wetin happen next",
    "Abeg continue",
    "Wetin dey your mind",
    "Talk am make I hear",
    "Wetin dey your head",
    "Abeg yarn am"
  ],
  excited: [
    "Omo mehn",
    "Chaii, see levels",
    "Na mad ting",
    "E sweet me die"
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

// User memory to track frequent users and their preferences
const userMemory = {
  users: {},
  maxUsers: 50,
  
  addUser: function(userId, username) {
    if (!this.users[userId]) {
      this.users[userId] = {
        username: username,
        messageCount: 0,
        lastInteraction: Date.now(),
        topics: new Set(),
        preferences: {},
        typos: 0
      };
      
      // Limit the number of users we track
      const userIds = Object.keys(this.users);
      if (userIds.length > this.maxUsers) {
        // Remove oldest user
        const oldestUserId = userIds.reduce((oldest, current) => 
          this.users[current].lastInteraction < this.users[oldest].lastInteraction ? current : oldest
        );
        delete this.users[oldestUserId];
      }
    } else {
      this.users[userId].lastInteraction = Date.now();
    }
    
    this.users[userId].messageCount++;
  },
  
  updateUserTopics: function(userId, topics) {
    if (this.users[userId]) {
      topics.forEach(topic => this.users[userId].topics.add(topic));
    }
  },
  
  getUserInfo: function(userId) {
    return this.users[userId] || null;
  },
  
  isFrequentUser: function(userId) {
    return this.users[userId] && this.users[userId].messageCount > 5;
  },
  
  getPreferredTopics: function(userId) {
    return this.users[userId] ? Array.from(this.users[userId].topics) : [];
  }
};

// Function to add occasional typos and corrections
function addTypos(text, userId) {
  // Skip if text is too short
  if (text.length < 10) return text;
  
  // Get user's typo frequency
  const userInfo = userMemory.getUserInfo(userId);
  const typoChance = userInfo ? Math.min(0.15, userInfo.typos / 100) : 0.05;
  
  // Decide if we'll add a typo
  if (Math.random() > typoChance) return text;
  
  // Common typos in Nigerian English
  const typoPatterns = [
    { from: 'the', to: 'd' },
    { from: 'that', to: 'dat' },
    { from: 'what', to: 'wetin' },
    { from: 'you', to: 'u' },
    { from: 'your', to: 'ur' },
    { from: 'are', to: 'r' },
    { from: 'for', to: '4' },
    { from: 'to', to: '2' },
    { from: 'too', to: '2' },
    { from: 'two', to: '2' }
  ];
  
  // Apply a random typo
  const pattern = typoPatterns[Math.floor(Math.random() * typoPatterns.length)];
  const words = text.split(' ');
  const wordIndex = Math.floor(Math.random() * words.length);
  
  // Only replace if the word matches
  if (words[wordIndex].toLowerCase() === pattern.from) {
    words[wordIndex] = pattern.to;
    
    // Update user's typo count
    if (userInfo) {
      userMemory.users[userId].typos++;
    }
    
    return words.join(' ');
  }
  
  return text;
}

// Function to add corrections
function addCorrection(text) {
  // Skip if text is too short
  if (text.length < 15) return text;
  
  // Decide if we'll add a correction (10% chance)
  if (Math.random() > 0.1) return text;
  
  const corrections = [
    " meant",
    " oops",
    " lol",
    " sorry",
    " nah",
    " wait",
    " actually"
  ];
  
  const correction = corrections[Math.floor(Math.random() * corrections.length)];
  return text + correction;
}

// Function to remove all formatting
function removeFormatting(text) {
  // Remove asterisks (bold/italic)
  text = text.replace(/\*\*/g, '');
  text = text.replace(/\*/g, '');
  
  // Remove underscores (italic/underline)
  text = text.replace(/_/g, '');
  
  // Remove backticks (code)
  text = text.replace(/`/g, '');
  
  // Remove quotes
  text = text.replace(/"/g, '');
  text = text.replace(/'/g, '');
  
  // Remove any other markdown formatting
  text = text.replace(/~~/g, '');
  text = text.replace(/>/g, '');
  text = text.replace(/\|\|/g, '');
  
  // Remove all exclamation marks
  text = text.replace(/!+/g, '');
  
  // Remove multiple question marks
  text = text.replace(/\?+/g, '?');
  
  // Remove any repeated phrases at the end (like "We move." on a new line)
  text = text.replace(/\n\s*([^.!?]+)[.!?]?\s*$/, '');
  
  return text;
}

// Function to vary response timing
function getVariedResponseTime() {
  // Base time is 30 seconds (2 messages per minute)
  const baseTime = 30000;
  
  // Add random variation between -5 and +10 seconds
  const variation = Math.floor(Math.random() * 15000) - 5000;
  
  // Ensure we don't go below 25 seconds or above 40 seconds
  return Math.max(25000, Math.min(40000, baseTime + variation));
}

// Function to check if a response is too bot-like
function isTooBotLike(text) {
  // Check if it's just emojis
  if (/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+$/u.test(text)) {
    return true;
  }
  
  // Check if it's too short (less than 3 characters)
  if (text.length < 3) {
    return true;
  }
  
  // Check if it's just a single word
  if (!text.includes(' ') && text.length < 10) {
    return true;
  }
  
  return false;
}

// Function to make responses more natural
function makeResponseMoreNatural(text) {
  // Remove any emojis from the text
  text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  
  // If it's too bot-like, add some Nigerian filler words
  if (isTooBotLike(text)) {
    const fillers = [
      "Omo mehn, ",
      "Abeg, ",
      "See ehn, ",
      "My guy, ",
      "Oya na, ",
      "Chai, ",
      "Ehen, ",
      "Wetin dey, "
    ];
    
    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    return filler + text;
  }
  
  return text;
}

// Function to add occasional Nigerian filler words
function addNigerianFillers(text) {
  // Skip if text is too short
  if (text.length < 10) return text;
  
  // 20% chance to add a filler
  if (Math.random() > 0.2) return text;
  
  const fillers = [
    "Omo mehn, ",
    "Abeg, ",
    "See ehn, ",
    "My guy, ",
    "Oya na, ",
    "Chai, ",
    "Ehen, ",
    "Wetin dey, "
  ];
  
  const filler = fillers[Math.floor(Math.random() * fillers.length)];
  return filler + text;
}

// Function to add occasional Nigerian slang
function addNigerianSlang(text) {
  // Skip if text is too short
  if (text.length < 15) return text;
  
  // 15% chance to add slang
  if (Math.random() > 0.15) return text;
  
  const slang = [
    " no be small thing o",
    " e dey pain me",
    " you too much",
    " na wa for you o",
    " omo mehn",
    " e shock you",
    " wahala dey o",
    " you sabi die",
    " you get point sha",
    " i feel you die",
    " you no dey lie"
  ];
  
  const selectedSlang = slang[Math.floor(Math.random() * slang.length)];
  return text + selectedSlang;
}

// Function to add natural punctuation
function addNaturalPunctuation(text) {
  // Skip if text is too short
  if (text.length < 10) return text;
  
  // Remove any existing punctuation at the end
  text = text.replace(/[.!?]+$/, '');
  
  // Remove all exclamation marks
  text = text.replace(/!+/g, '');
  
  // Remove any repeated phrases at the end (like "We move." on a new line)
  text = text.replace(/\n\s*([^.!?]+)[.!?]?\s*$/, '');
  
  // Remove multiple question marks
  text = text.replace(/\?+/g, '?');
  
  // Decide on punctuation based on content and mood
  const hasQuestion = text.toLowerCase().includes('wetin') || 
                      text.toLowerCase().includes('how') || 
                      text.toLowerCase().includes('what') ||
                      text.toLowerCase().includes('why') ||
                      text.toLowerCase().includes('when') ||
                      text.toLowerCase().includes('where');
  
  // Add appropriate punctuation
  if (hasQuestion) {
    return text + "?";
  } else {
    // For statements, use a mix of periods and no punctuation
    return Math.random() > 0.3 ? text + "." : text;
  }
}

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
    const timeUntilNextResponse = Math.max(0, getVariedResponseTime() - timeSinceLastResponse);
    
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
    
    // Update user memory
    userMemory.addUser(messageToRespondTo.author.id, messageToRespondTo.author.username);
    
    // Extract topics from message
    const words = messageToRespondTo.content.toLowerCase().split(/\s+/);
    const topics = words.filter(word => word.length > 3);
    userMemory.updateUserTopics(messageToRespondTo.author.id, topics);

    console.log(chalk.blue(`[MESSAGE] Processing message from ${messageToRespondTo.author.username}:`));
    console.log(chalk.cyan(`[ORIGINAL] ${messageToRespondTo.content}`));
    console.log(chalk.yellow(`[MODE] ${shouldTagUser ? `${mentionType || 'Tagged'} Response` : 'Last Message Reply'}`));

    // Skip if message matches patterns that don't need responses
    if (skipPatterns.some(pattern => pattern.test(messageToRespondTo.content.trim()))) {
      console.log(chalk.yellow('[SKIP] Message appears to be an acknowledgment:', messageToRespondTo.content));
      return;
    }

    let responseText = null;
    let responseSource = '';

    // Get current conversation mood
    const mood = chatMemory.getMood();
    
    // Get user info for personalization
    const userInfo = userMemory.getUserInfo(messageToRespondTo.author.id);
    const isFrequentUser = userMemory.isFrequentUser(messageToRespondTo.author.id);
    const userTopics = userMemory.getPreferredTopics(messageToRespondTo.author.id);

    // Try Gemini first if not rate limited
    if (!isGeminiRateLimited) {
      try {
        console.log(chalk.blue('[GEMINI] Requesting response...'));
        const context = chatMemory.getContext();
        const userContext = isFrequentUser ? 
          `User ${messageToRespondTo.author.username} is a frequent user. Their preferred topics: ${userTopics.join(', ')}.` : '';
        
        const prompt = `Previous chat context:\n${context}\n\n${userContext}\nCurrent message to respond to: ${messageToRespondTo.content}\n\nRespond in a casual Nigerian style, using Nigerian slang and expressions naturally. Keep it very short (max 2 sentences) and fun. Match the current mood: ${mood}. Make it sound like a quick human response typed in 20 seconds or less. DO NOT use emojis in your response. DO NOT use any formatting like asterisks, quotes, or other styling. Use plain text only. DO NOT use exclamation marks at all. Use commas and periods naturally. DO NOT repeat the last part of your statement on a new line. DO NOT use multiple question marks.`;
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

    // Remove any emojis from the response
    responseText = responseText.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    
    // Remove all formatting
    responseText = removeFormatting(responseText);
    
    // Make sure the response isn't too bot-like
    responseText = makeResponseMoreNatural(responseText);
    
    // Add occasional typos and corrections
    responseText = addTypos(responseText, messageToRespondTo.author.id);
    responseText = addCorrection(responseText);
    
    // Add Nigerian fillers and slang
    responseText = addNigerianFillers(responseText);
    responseText = addNigerianSlang(responseText);
    
    // Add natural punctuation
    responseText = addNaturalPunctuation(responseText);
    
    // Final check to ensure no exclamation marks
    responseText = responseText.replace(/!+/g, '');
    
    // Final check to ensure no multiple question marks
    responseText = responseText.replace(/\?+/g, '?');
    
    // Final check to ensure no repeated phrases at the end
    responseText = responseText.replace(/\n\s*([^.!?]+)[.!?]?\s*$/, '');

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
    if (isFrequentUser) {
      console.log(chalk.green(`[USER] Responding to frequent user: ${messageToRespondTo.author.username}`));
    }

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