import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

async function testFlash() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error(chalk.red('❌ GEMINI_API_KEY not found in .env file'));
      return;
    }

    // Log partial API key for verification
    const partialKey = process.env.GEMINI_API_KEY.substring(0, 4) + '...' + 
                      process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 4);
    console.log(chalk.blue('🔑 Using API Key:', partialKey));

    // Initialize with v1 endpoint
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1'
    });

    // Test 2.0 Flash-Lite model
    console.log(chalk.yellow('\nTesting gemini-2.0-flash-lite with v1...'));
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 50
      }
    });

    const result = await model.generateContent("Test message");
    const response = await result.response.text();
    console.log(chalk.green('✓ Success! Response:', response));

    console.log(chalk.green('\n✓ Working configuration found:'));
    console.log(chalk.cyan('  Model: gemini-2.0-flash-lite'));
    console.log(chalk.cyan('  Endpoint: v1'));

    console.log(chalk.yellow('\nUse these settings in your bot:'));
    console.log(chalk.cyan('Model: gemini-2.0-flash-lite'));
    console.log(chalk.cyan('API Endpoint: v1'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error testing Gemini:'), error.message);
    if (error.response?.data) {
      console.error(chalk.red('API Error:'), JSON.stringify(error.response.data, null, 2));
    }
    
    // Check for specific error types
    if (error.message.includes('API key')) {
      console.log(chalk.yellow('\n⚠️ API Key Issues:'));
      console.log('1. Verify your API key is correct');
      console.log('2. Check if the API is enabled in Google Cloud Console');
      console.log('3. Ensure you have access to the 2.0 Flash-Lite model');
    } else if (error.message.includes('model')) {
      console.log(chalk.yellow('\n⚠️ Model Access Issues:'));
      console.log('1. You may need to upgrade to access 2.0 Flash-Lite');
      console.log('2. Check your billing status in Google Cloud Console');
      console.log('3. Verify the model name is correct');
    }
  }
}

// Run the test
testFlash(); 