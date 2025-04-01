require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not found in .env file');
    }

    console.log('API Key found in .env:', process.env.GEMINI_API_KEY.substring(0, 5) + '...');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // Test with a simple chat
    const chat = model.startChat({
      generationConfig: {
        maxOutputTokens: 100,
      },
    });

    console.log('\nTesting chat generation...');
    const result = await chat.sendMessage("Say hello!");
    const response = await result.response.text();
    console.log('Response received:', response);
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('\nTest failed with error:', error.message);
    if (error.status === 404) {
      console.error('\nThis might be because:');
      console.error('1. The API key might be from Firebase/Google Cloud instead of Gemini');
      console.error('2. You need to enable the Gemini API at https://makersuite.google.com/');
      console.error('3. The package version might be outdated');
    }
  }
}

testGemini(); 