import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Discord = require('discord-simple-api');
import { MessageAnalyzer } from './services/messageAnalyzer.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Initialize Discord client and analyzer
const collectorBot = new Discord(process.env.COLLECTOR_BOT_TOKEN); // Use collector token
const analyzer = new MessageAnalyzer();
let lastMessageId = null;
const CHECK_INTERVAL = 5000; // Check every 5 seconds
const BATCH_SIZE = 100; // Number of messages to fetch per batch
const BATCH_DELAY = 2000; // Delay between batches to avoid rate limits

let collectorBotUserId = null;
let isRunning = true;
let rateLimitReached = false;
let isFetchingHistory = true; // Flag to track if we're fetching history

// Rate limit tracking
const rateLimit = {
  used: 0,
  total: 50, // Default daily limit
  resetTime: null
};

// Initialize services
async function initializeServices() {
  try {
    console.log(chalk.blue('[START] Initializing message collector...'));
    
    // Get collector bot information
    const userInfo = await collectorBot.getUserInformation();
    collectorBotUserId = userInfo.id;
    console.log(chalk.green(`[DISCORD] Collector connected as ${userInfo.username} (ID: ${collectorBotUserId})`));
    console.log(chalk.cyan(`[CHANNEL] Monitoring channel ID: ${process.env.CHANNEL_ID}`));
    
    // Start message collection
    console.log(chalk.blue('[START] Collector is running and monitoring messages...'));
    console.log(chalk.yellow('[INFO] Message collection started. No responses will be sent.'));
    console.log(chalk.yellow(`[RATE] Daily limit: ${rateLimit.total} requests`));
    
    // Start with historical messages
    await fetchHistoricalMessages();
    
    // Then start monitoring new messages
    isFetchingHistory = false;
    collectLoop();
  } catch (error) {
    console.error(chalk.red('[ERROR] Failed to initialize services:'), error.message);
    process.exit(1);
  }
}

// Fetch historical messages
async function fetchHistoricalMessages() {
  console.log(chalk.blue('[HISTORY] Starting historical message fetch...'));
  let beforeId = null;
  let hasMore = true;
  let totalFetched = 0;

  while (hasMore && isRunning && !rateLimitReached) {
    try {
      // Check rate limit before fetching
      if (rateLimit.used >= rateLimit.total) {
        console.log(chalk.red('[RATE] Daily limit reached during history fetch!'));
        rateLimitReached = true;
        break;
      }

      console.log(chalk.blue(`[HISTORY] Fetching batch of ${BATCH_SIZE} messages...`));
      const messages = await collectorBot.getMessagesInChannel(process.env.CHANNEL_ID, BATCH_SIZE, beforeId);
      
      // Increment rate limit counter
      rateLimit.used++;
      console.log(chalk.yellow(`[RATE] Used: ${rateLimit.used}/${rateLimit.total}`));

      if (!messages || messages.length === 0) {
        hasMore = false;
        console.log(chalk.green('[HISTORY] No more historical messages to fetch'));
        break;
      }

      // Process the batch
      const validMessages = messages.filter(msg => !msg.author.bot);
      await analyzer.analyzeChannelMessages(validMessages);
      
      totalFetched += validMessages.length;
      
      // Update stats
      const stats = analyzer.getStats();
      console.log(chalk.cyan(`[HISTORY] Fetched ${totalFetched} messages so far`));
      console.log(chalk.cyan(`[HISTORY] Patterns found: ${stats.totalPatterns}`));
      
      // Update beforeId for next batch
      beforeId = messages[messages.length - 1].id;
      
      // Wait before next batch to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      
    } catch (error) {
      console.error(chalk.red('[ERROR] Fetching historical messages:'), error);
      if (error.response?.data) {
        console.error(chalk.red('[ERROR] Discord API Error:'), JSON.stringify(error.response.data, null, 2));
        
        // Check for rate limit headers
        if (error.response.headers) {
          const remaining = error.response.headers['x-ratelimit-remaining'];
          const reset = error.response.headers['x-ratelimit-reset'];
          
          if (remaining !== undefined) {
            rateLimit.used = rateLimit.total - parseInt(remaining);
            console.log(chalk.yellow(`[RATE] Updated usage: ${rateLimit.used}/${rateLimit.total}`));
          }
          
          if (reset) {
            rateLimit.resetTime = parseInt(reset) * 1000;
            const timeUntilReset = Math.ceil((rateLimit.resetTime - Date.now()) / 1000 / 60);
            console.log(chalk.yellow(`[RATE] Will reset in ${timeUntilReset} minutes`));
          }
        }
      }
      break;
    }
  }

  // Show final history stats
  const stats = analyzer.getStats();
  console.log(chalk.blue('\n[HISTORY] Historical Fetch Complete:'));
  console.log(chalk.cyan(`Total messages fetched: ${totalFetched}`));
  console.log(chalk.cyan(`Total patterns found: ${stats.totalPatterns}`));
  console.log(chalk.cyan(`Messages needed: ${stats.minimumMessages - stats.totalMessages}`));
}

// Main collection loop
async function collectLoop() {
  while (isRunning) {
    try {
      await collectMessages();
      
      // Check rate limits
      if (rateLimit.used >= rateLimit.total) {
        console.log(chalk.red('[RATE] Daily limit reached!'));
        console.log(chalk.yellow(`[RATE] Used: ${rateLimit.used}/${rateLimit.total}`));
        if (rateLimit.resetTime) {
          const timeUntilReset = Math.ceil((rateLimit.resetTime - Date.now()) / 1000 / 60);
          console.log(chalk.yellow(`[RATE] Resets in ${timeUntilReset} minutes`));
        }
        
        // Stop the collector
        isRunning = false;
        rateLimitReached = true;
        
        // Get final stats
        const stats = analyzer.getStats();
        console.log(chalk.blue('\n[STATS] Final Collection Stats:'));
        console.log(chalk.cyan(`Messages collected: ${stats.totalMessages}/${stats.minimumMessages}`));
        console.log(chalk.cyan(`Patterns found: ${stats.totalPatterns}`));
        
        if (stats.readyForResponses) {
          console.log(chalk.green('[STATS] Ready to generate responses!'));
        } else {
          console.log(chalk.yellow(`[STATS] Need ${stats.minimumMessages - stats.totalMessages} more messages`));
        }
        
        console.log(chalk.red('\n[STOP] Collector stopped due to rate limit.'));
        console.log(chalk.yellow('[INFO] Restart the collector when the rate limit resets.'));
        break;
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    } catch (error) {
      console.error(chalk.red('[ERROR] In collection loop:'), error);
      // Don't break the loop on error, just log it
    }
  }
}

// Message collection function
async function collectMessages() {
  try {
    console.log(chalk.blue('[FETCH] Checking for new messages...'));
    const messages = await collectorBot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
    
    // Increment rate limit counter
    rateLimit.used++;
    console.log(chalk.yellow(`[RATE] Used: ${rateLimit.used}/${rateLimit.total}`));
    
    if (!messages || messages.length === 0) {
      console.log(chalk.yellow('[FETCH] No new messages found'));
      return;
    }

    const latestMessage = messages[0];
    if (latestMessage.author.bot || latestMessage.id === lastMessageId) {
      console.log(chalk.yellow('[FETCH] Message already processed or from bot'));
      return;
    }

    // Log the message
    console.log(chalk.blue(`[MESSAGE] New message from ${latestMessage.author.username}:`));
    console.log(chalk.cyan(`[CONTENT] ${latestMessage.content}`));
    
    // Analyze the message
    await analyzer.analyzeChannelMessages([latestMessage]);
    
    // Get and display stats
    const stats = analyzer.getStats();
    console.log(chalk.yellow(`[STATS] Messages collected: ${stats.totalMessages}/${stats.minimumMessages}`));
    console.log(chalk.yellow(`[STATS] Patterns found: ${stats.totalPatterns}`));
    
    if (stats.readyForResponses) {
      console.log(chalk.green('[STATS] Ready to generate responses!'));
    } else {
      console.log(chalk.yellow(`[STATS] Need ${stats.minimumMessages - stats.totalMessages} more messages`));
    }

    lastMessageId = latestMessage.id;

  } catch (error) {
    console.error(chalk.red('[ERROR] Processing message:'), error);
    if (error.response?.data) {
      console.error(chalk.red('[ERROR] Discord API Error:'), JSON.stringify(error.response.data, null, 2));
      
      // Check for rate limit headers
      if (error.response.headers) {
        const remaining = error.response.headers['x-ratelimit-remaining'];
        const reset = error.response.headers['x-ratelimit-reset'];
        
        if (remaining !== undefined) {
          rateLimit.used = rateLimit.total - parseInt(remaining);
          console.log(chalk.yellow(`[RATE] Updated usage: ${rateLimit.used}/${rateLimit.total}`));
        }
        
        if (reset) {
          rateLimit.resetTime = parseInt(reset) * 1000;
          const timeUntilReset = Math.ceil((rateLimit.resetTime - Date.now()) / 1000 / 60);
          console.log(chalk.yellow(`[RATE] Will reset in ${timeUntilReset} minutes`));
        }
      }
    }
  }
}

// Start the collector
initializeServices();

// Error handling
process.on('unhandledRejection', error => {
  console.error(chalk.red('[ERROR] Unhandled promise rejection:'), error);
}); 