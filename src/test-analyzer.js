import { MessageAnalyzer } from './services/messageAnalyzer.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

async function testAnalyzer() {
  try {
    console.log(chalk.blue('[TEST] Starting MessageAnalyzer test...'));
    
    const analyzer = new MessageAnalyzer();
    
    // Test message analysis
    const testMessages = [
      { author: { bot: false }, content: "Hey, how's it going?" },
      { author: { bot: false }, content: "Pretty good! Just working on some code" },
      { author: { bot: false }, content: "That's cool! What kind of project?" },
      { author: { bot: false }, content: "A Discord bot with AI features" },
      { author: { bot: false }, content: "Sounds interesting! How's it working?" }
    ];
    
    console.log(chalk.yellow('[TEST] Analyzing test messages...'));
    await analyzer.analyzeChannelMessages(testMessages);
    
    // Test response generation
    const testInputs = [
      "Hey, how's it going?",
      "What are you working on?",
      "That sounds cool!",
      "How's the project going?"
    ];
    
    console.log(chalk.yellow('\n[TEST] Testing response generation...'));
    for (const input of testInputs) {
      console.log(chalk.cyan(`\nInput: ${input}`));
      const response = await analyzer.generateResponse(input);
      console.log(chalk.green(`Response: ${response}`));
    }
    
    console.log(chalk.green('\n[TEST] Test completed successfully!'));
    
  } catch (error) {
    console.error(chalk.red('[TEST] Error during test:'), error);
  }
}

// Run the test
testAnalyzer(); 