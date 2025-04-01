require('dotenv').config();
const Discord = require('discord-simple-api');
const colors = require('colors');
const fs = require('fs');
const readlineSync = require('readline-sync');
const translate = require('translate-google');
const GeminiService = require('./src/services/geminiService');

// Initialize Gemini AI
let gemini;
let lastMessageId = null;
const responseChance = process.env.RESPONSE_CHANCE || 0.8;

function shouldUsePreviousSettings() {
  const envFileExists = fs.existsSync('.env');

  if (envFileExists) {
    const usePrevious = readlineSync.keyInYNStrict(
      'Do you want to use the previous settings?'
    );

    if (usePrevious) {
      try {
        const envContent = fs.readFileSync('.env', 'utf8');
        const envLines = envContent.split('\n');
        envLines.forEach((line) => {
          const [key, value] = line.split('=').map((entry) => entry.trim());
          if (key && value) {
            process.env[key] = value;
          }
        });
        return true;
      } catch (error) {
        console.error('Error reading .env file:', error.message);
      }
    }
  }

  return false;
}

const usePreviousSettings = shouldUsePreviousSettings();

let botToken = process.env.BOT_TOKEN;
let channelId = process.env.CHANNEL_ID;

if (!usePreviousSettings) {
  botToken = readlineSync.question('Enter your Discord bot token: ', {
    defaultInput: botToken,
  });
  channelId = readlineSync.question('Enter the channel ID: ', {
    defaultInput: channelId,
  });
  
  responseChance = readlineSync.questionFloat(
    'Enter the chance to respond to messages (0.0 - 1.0, e.g., 0.8 for 80%): ',
    { defaultInput: responseChance }
  );

  const envData = `BOT_TOKEN=${botToken}
CHANNEL_ID=${channelId}
RESPONSE_CHANCE=${responseChance}
GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`;
  
  fs.writeFileSync('.env', envData);
}

let bot;

async function startBot() {
  try {
    // Initialize and test Gemini
    console.log(colors.yellow('Initializing Gemini AI...'));
    gemini = new GeminiService();
    await gemini.init();
    console.log(colors.green('✓ Gemini AI initialized successfully'));

    // Initialize Discord bot
    bot = new Discord(botToken);
    const userInfo = await bot.getUserInformation();
    const me = userInfo.username + '#' + userInfo.discriminator;
    
    console.log(colors.green('\nLogged in as %s'), me);
    console.log(colors.yellow('Checking for new messages every 20 seconds'));
    console.log(colors.yellow('Response chance: %s%'), responseChance * 100);
    
    // Start message checking
    setInterval(processNewMessages, 20000);
  } catch (error) {
    console.error(colors.red('Startup error:'), error.message);
    process.exit(1);
  }
}

async function processNewMessages() {
  try {
    const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[0];

    // Skip if we've already responded to this message or if it's from the bot
    if (latestMessage.id === lastMessageId || latestMessage.author.bot) {
      return;
    }

    // Random chance to respond
    if (Math.random() > responseChance) {
      lastMessageId = latestMessage.id;
      return;
    }

    const response = await gemini.generateContent(latestMessage.content);
    
    // Create a proper Discord reply
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
    
    await bot.sendMessageToChannel(process.env.CHANNEL_ID, replyOptions);
    console.log(
      colors.green('[REPLY] To: %s | Message: %s | Response: %s'),
      latestMessage.author.username,
      latestMessage.content,
      response
    );
    
    lastMessageId = latestMessage.id;
  } catch (error) {
    console.error(colors.red('Error processing messages:'), error.message);
  }
}

// Start the bot
startBot().catch(error => {
  console.error(colors.red('Fatal error:'), error);
  process.exit(1);
});

// Add error handling
process.on('unhandledRejection', (error) => {
  console.error(colors.red('Unhandled promise rejection:'), error);
});
