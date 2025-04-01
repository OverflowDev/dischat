# Discord-Chat-Bot
A versatile Discord bot that sends random quotes and reposts messages in a channel, powered by Gemini AI. Based on the original work by [dante4rt](https://github.com/dante4rt/Discord-Chat-Bot).

## Screenshot
![Proof](https://i.ibb.co/3YFDYVx/Screenshot-at-Jan-11-00-08-44.png)

## Features
- AI-powered responses using Gemini
- Responds to messages with contextual replies
- Configurable response chance and timing
- Proper message threading and tagging
- Configurable auto-delete functionality

## Prerequisites
Make sure you have [Node.JS](https://nodejs.org/) installed on your machine.

## Installation
1. Clone the repository
2. Install dependencies using `npm install`
3. Run the bot using `npm start`
4. If an error occurs, you can delete the `.env` file and attempt the process again

## Usage
To set up your Discord bot:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and get your bot token
3. Create a `.env` file with your configuration:
```env
BOT_TOKEN= // Your Discord bot token
CHANNEL_ID= // Your targeted channel ID
GEMINI_API_KEY= // Your Gemini API key
RESPONSE_CHANCE=0.8 // Chance to respond (0.0 - 1.0)
DEL_AFTER= // Optional: Delete messages after X seconds
```

## Configuration
The bot can be configured via the `.env` file or through the setup prompts when running the bot.

## Dependencies
- [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) - Gemini AI integration
- [discord-simple-api](https://www.npmjs.com/package/discord-simple-api) - Discord API library
- [chalk](https://www.npmjs.com/package/chalk) - Console styling
- [dotenv](https://www.npmjs.com/package/dotenv) - Environment configuration

## Credits
This project is a modified version of [dante4rt's Discord-Chat-Bot](https://github.com/dante4rt/Discord-Chat-Bot), updated to use Gemini AI for responses instead of predefined quotes.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
