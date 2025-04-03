import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Discord = require('discord-simple-api');
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Initialize Discord client
const bot = new Discord(process.env.MAIN_BOT_TOKEN);
let botUserId = null;

async function testRecentMessages() {
    try {
        console.log(chalk.blue('[TEST] Starting recent messages test...'));
        
        // Get bot information
        const userInfo = await bot.getUserInformation();
        botUserId = userInfo.id;
        console.log(chalk.green(`[TEST] Bot ID: ${botUserId}`));
        
        // Get messages from the last 5 minutes
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        console.log(chalk.blue('[TEST] Fetching recent messages...'));
        
        const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 50); // Get last 50 messages
        
        console.log(chalk.cyan(`[TEST] Found ${messages.length} messages`));
        
        // Check each message
        for (const message of messages) {
            const messageTime = new Date(message.timestamp).getTime();
            
            // Skip messages older than 5 minutes
            if (messageTime < fiveMinutesAgo) {
                continue;
            }
            
            // Check if message is a reply to bot
            const isReplyToBot = message.referenced_message?.author?.id === botUserId;
            
            // Check if message tags the bot
            const isTagged = message.mentions?.users?.some(user => user.id === botUserId);
            
            if (isReplyToBot || isTagged) {
                console.log(chalk.yellow('\n[FOUND] Relevant message:'));
                console.log(chalk.cyan(`Time: ${new Date(message.timestamp).toLocaleTimeString()}`));
                console.log(chalk.cyan(`Author: ${message.author.username}`));
                console.log(chalk.cyan(`Content: ${message.content}`));
                console.log(chalk.magenta(`Type: ${isReplyToBot ? 'Reply to bot' : 'Tagged bot'}`));
                
                if (isReplyToBot) {
                    console.log(chalk.cyan(`Replying to: ${message.referenced_message.content}`));
                }
            }
        }
        
        console.log(chalk.green('\n[TEST] Test completed!'));
        
    } catch (error) {
        console.error(chalk.red('[ERROR] Test failed:'), error);
    }
}

// Run the test
testRecentMessages(); 