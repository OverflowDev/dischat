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
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 100,
      }
    });
    
    this.lastCallTime = 0;
    this.rateLimitDelay = 45000; // 45 seconds between calls to stay within rate limits
    this.dailyRequestCount = 0;
    this.lastRequestReset = Date.now();
  }

  async init() {
    try {
      console.log(chalk.yellow('[GEMINI] Testing connection...'));
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
      const currentTime = Date.now();
      
      // Reset daily counter if 24 hours have passed
      if (currentTime - this.lastRequestReset > 24 * 60 * 60 * 1000) {
        this.dailyRequestCount = 0;
        this.lastRequestReset = currentTime;
      }

      // Check if we've hit the daily limit (50 requests per day)
      if (this.dailyRequestCount >= 50) {
        const timeUntilReset = Math.ceil((24 * 60 * 60 * 1000 - (currentTime - this.lastRequestReset)) / 1000);
        console.log(chalk.yellow(`[GEMINI] Daily limit reached. Resets in ${timeUntilReset} seconds`));
        return "I'm taking a short break, but I'll be back soon! 😊";
      }

      // Enforce rate limit delay
      if (currentTime - this.lastCallTime < this.rateLimitDelay) {
        const waitTime = Math.ceil((this.rateLimitDelay - (currentTime - this.lastCallTime)) / 1000);
        console.log(chalk.yellow(`[GEMINI] Rate limit delay: ${waitTime}s remaining`));
        return "Just a moment...";
      }

      const prompt = `You are having a casual conversation in a Discord chat. 
      Respond naturally to this message while keeping these rules in mind:
      1. Keep responses concise and conversational (max 2-3 sentences)
      2. Stay on topic with the message you're replying to
      3. Don't use formal language or AI-like phrases
      4. Engage directly with what was said
      5. Be friendly but not overly enthusiastic
      6. Use casual language and emojis occasionally
      7. Don't suggest or recommend things
      8. Don't apologize or use formal greetings
      9. Keep it real and natural

      Message to respond to: "${message}"`;

      console.log(chalk.blue('[GEMINI] Generating response...'));
      const result = await this.model.generateContent(prompt);
      const response = await result.response.text();
      
      console.log(chalk.green('[GEMINI] Response generated successfully'));
      
      this.lastCallTime = currentTime;
      this.dailyRequestCount++;

      // Clean up any AI-like phrases
      const cleanedResponse = response
        .replace(/^(I apologize|I'm sorry|Sorry|Let me|I would|I think)/gi, "")
        .replace(/^(Actually|Well|You see|To answer|In response)/gi, "")
        .trim();

      console.log(chalk.cyan('[GEMINI] Cleaned response:', cleanedResponse));
      return cleanedResponse;
    } catch (error) {
      console.error(chalk.red('[GEMINI] Error:'), error.message);
      if (error.response?.data) {
        console.error(chalk.red('[GEMINI] API Error:'), JSON.stringify(error.response.data, null, 2));
      }
      if (error.status === 429) {
        console.log(chalk.yellow('[GEMINI] Rate limit hit, increasing delay'));
        this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 120000); // Max 2 minutes
      }
      return "Hmm... 🤔";
    }
  }
} 