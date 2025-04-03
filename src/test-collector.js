import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Discord = require('discord-simple-api');
import dotenv from 'dotenv';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

// Constants
const BATCH_SIZE = 100; // Messages per request
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_HISTORY_DAYS = 14; // 2 weeks of history
const PATTERNS_FILE = 'message_patterns.json';

// Initialize Discord client
const bot = new Discord(process.env.COLLECTOR_BOT_TOKEN);
let botUserId = null;

// Message patterns storage
let messagePatterns = {
    patterns: [],
    lastUpdated: new Date().toISOString()
};

// Initialize services
async function initializeServices() {
    try {
        console.log(chalk.blue('[START] Initializing collector...'));
        
        // Get bot information
        console.log(chalk.yellow('[DISCORD] Connecting to Discord...'));
        const userInfo = await bot.getUserInformation();
        botUserId = userInfo.id;
        console.log(chalk.green(`[DISCORD] Connected as ${userInfo.username} (ID: ${botUserId})`));
        
        // Load existing patterns if any
        await loadPatterns();
        
        // Start collection
        await fetchHistoricalMessages();
    } catch (error) {
        console.error(chalk.red('[ERROR] Failed to initialize services:'), error.message);
        process.exit(1);
    }
}

// Load existing patterns
async function loadPatterns() {
    try {
        const data = await fs.readFile(PATTERNS_FILE, 'utf8');
        messagePatterns = JSON.parse(data);
        console.log(chalk.green(`[LOAD] Loaded ${messagePatterns.patterns.length} existing patterns`));
    } catch (error) {
        console.log(chalk.yellow('[LOAD] No existing patterns found, starting fresh'));
        messagePatterns = {
            patterns: [],
            lastUpdated: new Date().toISOString()
        };
    }
}

// Save patterns to file
async function savePatterns() {
    try {
        messagePatterns.lastUpdated = new Date().toISOString();
        await fs.writeFile(PATTERNS_FILE, JSON.stringify(messagePatterns, null, 2));
        console.log(chalk.green(`[SAVE] Saved ${messagePatterns.patterns.length} patterns`));
    } catch (error) {
        console.error(chalk.red('[ERROR] Failed to save patterns:'), error.message);
    }
}

// Analyze message for patterns
function analyzeMessage(message) {
    // Skip bot messages
    if (message.author.bot) return;

    // Get message content and clean it
    const content = message.content.trim().toLowerCase();
    if (!content) return;

    // Check if message is a response to another message
    const isResponse = message.referenced_message !== null;
    const parentMessage = isResponse ? message.referenced_message : null;

    if (isResponse && parentMessage) {
        // This is a response to another message, store the pattern
        const pattern = {
            trigger: parentMessage.content.trim().toLowerCase(),
            response: content,
            timestamp: new Date(message.timestamp).toISOString(),
            author: message.author.username
        };

        // Check if similar pattern exists
        const existingPattern = messagePatterns.patterns.find(p => 
            p.trigger === pattern.trigger && 
            p.response === pattern.response
        );

        if (!existingPattern) {
            messagePatterns.patterns.push(pattern);
            console.log(chalk.cyan(`[PATTERN] New pattern found: "${pattern.trigger}" -> "${pattern.response}"`));
        }
    }
}

// Fetch historical messages
async function fetchHistoricalMessages() {
    console.log(chalk.blue('[HISTORY] Starting historical message collection...'));
    
    let beforeId = null;
    let totalMessages = 0;
    let rateLimitUsed = 0;
    const startTime = Date.now();
    const twoWeeksAgo = Date.now() - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);

    while (true) {
        try {
            // Check rate limit
            if (rateLimitUsed >= 45) { // Leave some buffer
                console.log(chalk.yellow('[RATE] Approaching rate limit, pausing for 1 second'));
                await new Promise(resolve => setTimeout(resolve, 1000));
                rateLimitUsed = 0;
            }

            // Fetch messages
            const messages = await bot.getMessagesInChannel(
                process.env.CHANNEL_ID,
                BATCH_SIZE,
                beforeId ? { before: beforeId } : undefined
            );

            if (!messages || messages.length === 0) {
                console.log(chalk.green('[HISTORY] Reached end of message history'));
                break;
            }

            // Process messages
            for (const message of messages) {
                // Check if message is within 2 weeks
                const messageTime = new Date(message.timestamp).getTime();
                if (messageTime < twoWeeksAgo) {
                    console.log(chalk.yellow('[HISTORY] Reached 2-week limit'));
                    await savePatterns();
                    return;
                }

                analyzeMessage(message);
                totalMessages++;
            }

            // Update for next batch
            beforeId = messages[messages.length - 1].id;
            rateLimitUsed++;

            // Show progress
            console.log(chalk.blue(`[PROGRESS] Processed ${totalMessages} messages, found ${messagePatterns.patterns.length} patterns`));
            
            // Save patterns every 1000 messages
            if (totalMessages % 1000 === 0) {
                await savePatterns();
            }

            // Respect rate limits
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));

        } catch (error) {
            console.error(chalk.red('[ERROR] Fetching messages:'), error.message);
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                console.log(chalk.yellow(`[RATE] Rate limited, waiting ${retryAfter} seconds`));
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            } else {
                break;
            }
        }
    }

    // Final save
    await savePatterns();
    console.log(chalk.green(`[COMPLETE] Finished processing ${totalMessages} messages`));
    console.log(chalk.green(`[PATTERNS] Found ${messagePatterns.patterns.length} unique patterns`));
}

// Start the collector
initializeServices();

// Error handling
process.on('unhandledRejection', error => {
    console.error(chalk.red('[ERROR] Unhandled promise rejection:'), error);
}); 