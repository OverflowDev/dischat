import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

export class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1'
    });
    
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 50,
        topP: 0.8,
        topK: 40
      }
    });
  }

  async init() {
    try {
      console.log(chalk.yellow('[GEMINI] Testing connection with 2.0 Flash-Lite...'));
      const result = await this.model.generateContent("Test message");
      const response = await result.response.text();
      console.log(chalk.green('[GEMINI] Connection successful!'));
      console.log(chalk.cyan('[GEMINI] Test response:', response));
      return true;
    } catch (error) {
      console.error(chalk.red('[GEMINI] Initialization failed:'), error.message);
      if (error.response?.data) {
        console.error(chalk.red('[GEMINI] API Error:'), JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  async generateContent(message) {
    try {
      const prompt = `You are casually chatting in a Discord server. Read and analyze this message, then respond naturally as a friend would.

      Guidelines for your response:
      - Keep it super short and casual (1-2 sentences max)
      - Match the tone and energy of the message
      - Use natural language like a real person
      - It's okay to use emojis occasionally, but don't overdo it
      - Stay on topic and engage with what they said
      - Don't be overly formal or robotic
      - Never apologize or use greetings
      - Avoid phrases like "I think", "Well", "Actually"
      - Just jump right into your response

      Analyze and respond to this message: "${message}"`;

      console.log(chalk.blue('[GEMINI] Generating response...'));
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response.text();
      
      console.log(chalk.green('[GEMINI] Response generated successfully'));
      
      // Clean up the response
      let cleanedResponse = response.trim();
      
      // Remove any AI-like phrases
      const aiPhrases = [
        "As an AI", "I'm an AI", "I am an AI",
        "I'm here to", "I can help", "I understand",
        "Let me", "Allow me", "I'll help",
        "I can", "I will", "I would",
        "Based on", "According to", "In my analysis",
        "I think", "I believe", "In my opinion",
        "Well", "Actually", "You see",
        "Hello", "Hi", "Hey there",
        "Thanks for", "Thank you", "Appreciate"
      ];
      
      aiPhrases.forEach(phrase => {
        const regex = new RegExp(`^${phrase}[,.!?]?\\s*`, 'i');
        cleanedResponse = cleanedResponse.replace(regex, '');
      });
      
      // If response is empty after cleaning, use a simple reaction
      if (!cleanedResponse.trim()) {
        const reactions = ["👍", "😊", "👌", "✨", "💯"];
        cleanedResponse = reactions[Math.floor(Math.random() * reactions.length)];
      }
      
      return cleanedResponse;
    } catch (error) {
      console.error(chalk.red('[GEMINI] Error generating content:'), error.message);
      if (error.response?.data) {
        console.error(chalk.red('[GEMINI] API Error:'), JSON.stringify(error.response.data, null, 2));
      }
      return "Oops! Let me try that again...";
    }
  }
} 