require('dotenv').config();
const Discord = require('discord-simple-api');
const colors = require('colors');
const fs = require('fs');
const readlineSync = require('readline-sync');
const translate = require('translate-google');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || readlineSync.question('Enter your Gemini API key: ')
);

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
let responseChance = process.env.RESPONSE_CHANCE || 0.8;
let lastMessageId = null; // Track the last message we responded to

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

try {
  bot = new Discord(botToken);
} catch (error) {
  console.error(colors.red('Error initializing Discord bot:'), error.message);
  process.exit(1);
}

async function generateResponse(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });

    const prompt = `Generate a short, natural response to this Discord message: "${message}"
Rules:
- Keep it to 1-2 sentences maximum
- Be casual and friendly
- Use at most one emoji if appropriate
- Don't repeat the original message content
- Don't use phrases like "I see" or "I understand"`;

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    return response.trim();

  } catch (error) {
    console.error(colors.red('Error generating response:'), error.message);
    return "Sorry, I can't respond right now 😅";
  }
}

async function processNewMessages() {
  try {
    // Get only the latest message
    const messages = await bot.getMessagesInChannel(channelId, 1);
    if (!messages || messages.length === 0) return;

    const latestMessage = messages[0];

    // Skip if we've already responded to this message or if it's from the bot
    if (
      latestMessage.id === lastMessageId || 
      latestMessage.author.bot
    ) {
      return;
    }

    // Random chance to respond
    if (Math.random() > responseChance) {
      lastMessageId = latestMessage.id; // Mark as processed even if we skip it
      return;
    }

    const response = await generateResponse(latestMessage.content);
    
    // Create a proper Discord reply
    const replyOptions = {
      content: response,
      message_reference: {
        message_id: latestMessage.id,
        channel_id: channelId,
        guild_id: latestMessage.guild_id
      },
      allowed_mentions: {
        parse: ['users']
      }
    };
    
    await bot.sendMessageToChannel(channelId, replyOptions);
    console.log(
      colors.green('[REPLY] To: %s | Message: %s | Response: %s'),
      latestMessage.author.username,
      latestMessage.content,
      response
    );
    
    lastMessageId = latestMessage.id; // Update last processed message ID

  } catch (error) {
    console.error(colors.red('Error processing messages:'), error.message);
  }
}

// Initial connection message
bot.getUserInformation()
  .then((userInfo) => {
    const me = userInfo.username + '#' + userInfo.discriminator;
    console.log(colors.green('Logged in as %s'), me);
    console.log(colors.yellow('Checking for new messages every 20 seconds'));
    console.log(colors.yellow('Response chance: %s%'), responseChance * 100);
    console.log(colors.cyan('Using Gemini AI for responses'));
  })
  .catch((error) => {
    console.error(colors.red('Error getting user information:'), error.message);
  });

// Check for new messages every 20 seconds
setInterval(processNewMessages, 20000);

// Add error handling
process.on('unhandledRejection', (error) => {
  console.error(colors.red('Unhandled promise rejection:'), error);
});
