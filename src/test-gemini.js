import 'dotenv/config';
import chalk from 'chalk';
import { GeminiService } from './services/geminiService.js';

async function testGemini() {
  try {
    console.log(chalk.yellow('Initializing Gemini service...'));
    const gemini = new GeminiService();
    await gemini.init();
    console.log(chalk.green('Initialization successful!'));

    console.log(chalk.yellow('\nTesting content generation...'));
    const response = await gemini.generateContent('Hello, how are you?');
    console.log(chalk.green('Response received:', response));
    
    console.log(chalk.green('\nTest completed successfully!'));
  } catch (error) {
    console.error(chalk.red('\nTest failed:', error.message));
  }
}

testGemini(); 