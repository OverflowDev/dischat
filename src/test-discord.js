import Discord from 'discord-simple-api';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

console.log(chalk.yellow('Testing Discord connection...'));

try {
  const bot = new Discord(process.env.BOT_TOKEN);
  
  // Test user information
  bot.getUserInformation()
    .then(userInfo => {
      console.log(chalk.green(`[SUCCESS] Connected as ${userInfo.username}#${userInfo.discriminator}`));
      
      // Test channel access
      return bot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
    })
    .then(messages => {
      if (messages && messages.length > 0) {
        console.log(chalk.green('[SUCCESS] Channel access confirmed'));
        console.log(chalk.blue('Latest message:', messages[0].content.substring(0, 50) + '...'));
      } else {
        console.log(chalk.yellow('[INFO] Channel is empty'));
      }
    })
    .catch(error => {
      console.error(chalk.red('[ERROR] Channel access failed:'), error.message);
    });

} catch (error) {
  console.error(chalk.red('[ERROR] Failed to initialize bot:'), error.message);
} 