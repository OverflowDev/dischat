import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';

async function testGemini() {
  try {
    console.log(chalk.yellow('Starting Gemini API test...'));

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not found in .env file');
    }
    console.log(chalk.cyan('API Key found:', process.env.GEMINI_API_KEY.substring(0, 6) + '...'));

    // Try different models and API versions
    const modelConfigs = [
      { model: "gemini-1.5-pro", endpoint: "v1" },
      { model: "gemini-pro", endpoint: "v1" },
      { model: "gemini-1.5-flash", endpoint: "v1" },
      { model: "gemini-pro", endpoint: "v1beta" }
    ];

    for (const config of modelConfigs) {
      try {
        console.log(chalk.yellow(`\nTesting ${config.model} with ${config.endpoint}...`));
        
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
          apiEndpoint: `https://generativelanguage.googleapis.com/${config.endpoint}`
        });

        const model = genAI.getGenerativeModel({ 
          model: config.model,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100,
          }
        });

        const result = await model.generateContent("Test message");
        const response = await result.response.text();
        
        console.log(chalk.green('✓ Success! Response:', response));
        console.log(chalk.green(`\n✓ Working configuration found:`));
        console.log(chalk.green(`  Model: ${config.model}`));
        console.log(chalk.green(`  Endpoint: ${config.endpoint}`));
        
        // Save working config to a file
        const configData = {
          model: config.model,
          endpoint: config.endpoint,
          apiKey: process.env.GEMINI_API_KEY
        };
        
        console.log(chalk.cyan('\nUse these settings in your bot:'));
        console.log(chalk.cyan(`Model: ${config.model}`));
        console.log(chalk.cyan(`API Endpoint: ${config.endpoint}`));
        return;
      } catch (error) {
        console.log(chalk.red(`× Failed with ${config.model}:`, error.message));
      }
    }

    console.log(chalk.red('\n× No working configuration found'));
    console.log(chalk.yellow('\nTroubleshooting steps:'));
    console.log('1. Verify your API key is from https://makersuite.google.com/app/apikey');
    console.log('2. Enable Gemini API in Google Cloud Console');
    console.log('3. Check if Gemini API is available in your region');
    console.log('4. Try creating a new API key');

  } catch (error) {
    console.error(chalk.red('\nTest failed:'), error.message);
  }
}

console.log(chalk.cyan('=== Gemini API Test ===\n'));
testGemini(); 