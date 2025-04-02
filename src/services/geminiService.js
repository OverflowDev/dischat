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
        temperature: 0.7,
        maxOutputTokens: 50,
        topP: 0.8,
        topK: 40
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
      
      // Try up to 3 times if we get an overload error
      let attempts = 0;
      let lastError = null;
      
      while (attempts < 3) {
        try {
          const result = await this.model.generateContent(prompt);
          const response = await result.response.text();
          
          console.log(chalk.green('[GEMINI] Response generated successfully'));
          
          this.lastCallTime = currentTime;
          this.dailyRequestCount++;

          // Clean up any AI-like phrases and format response
          const cleanedResponse = response
            .replace(/^(I apologize|I'm sorry|Sorry|Let me|I would|I think|I understand|I see|I feel)/gi, "")
            .replace(/^(Actually|Well|You see|To answer|In response|Indeed|However|Moreover)/gi, "")
            .replace(/^(As an AI|As a language model|I'm here to|I'm happy to|I'd be happy to)/gi, "")
            .replace(/^(Hi|Hello|Hey|Greetings|Good morning|Good afternoon|Good evening)/gi, "")
            .replace(/\b(please|kindly|feel free to)\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();

          // If response is empty after cleaning, generate a simple reaction
          if (!cleanedResponse) {
            const reactions = ["👍", "💯", "😄", "Got it!", "Nice!", "Cool!", "For sure!"];
            return reactions[Math.floor(Math.random() * reactions.length)];
          }

          console.log(chalk.cyan('[GEMINI] Cleaned response:', cleanedResponse));
          return cleanedResponse;
          
        } catch (error) {
          lastError = error;
          if (error.message?.includes('overloaded')) {
            attempts++;
            console.log(chalk.yellow(`[GEMINI] Model overloaded, attempt ${attempts}/3...`));
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          }
          throw error; // If it's not an overload error, throw it immediately
        }
      }
      
      // If we get here, we failed all retries
      console.error(chalk.red('[GEMINI] Failed after 3 attempts:'), lastError.message);
      return "The server's a bit busy right now, but I'm still here! 😅";

    } catch (error) {
      console.error(chalk.red('[GEMINI] Error:'), error.message);
      if (error.response?.data) {
        console.error(chalk.red('[GEMINI] API Error:'), JSON.stringify(error.response.data, null, 2));
      }
      
      // Specific error responses
      if (error.status === 429) {
        console.log(chalk.yellow('[GEMINI] Rate limit hit, increasing delay'));
        this.rateLimitDelay = Math.min(this.rateLimitDelay * 1.5, 120000); // Max 2 minutes
        return "I need a quick breather! 😅";
      }
      
      if (error.message?.includes('API key')) {
        return "Oops, having some technical difficulties! 🔧";
      }
      
      return "I'm here, but having trouble thinking clearly! 🤔";
    }
  }
} 