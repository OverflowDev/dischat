import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }

  async init() {
    try {
      // Test the API connection
      await this.generateContent('test');
      return true;
    } catch (error) {
      console.error('Failed to initialize Gemini service:', error.message);
      throw error;
    }
  }

  async generateContent(message) {
    try {
      // Prompt ensuring short, relevant responses without repetition
      const prompt = `Generate a short, natural response to this Discord message: "${message}"
Rules:
- Keep it to 1-2 sentences maximum
- Be casual and friendly
- Use at most one emoji if appropriate
- Don't repeat the original message content`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      return text.trim();
    } catch (error) {
      console.error('Gemini API error:', error.message);
      throw error;
    }
  }
} 