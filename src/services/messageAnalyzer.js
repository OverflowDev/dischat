import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

export class MessageAnalyzer {
  constructor() {
    this.messageHistory = [];
    this.responsePatterns = new Map();
    this.lastAnalysisTime = 0;
    this.analysisInterval = 5 * 60 * 1000; // Analyze every 5 minutes
    this.minimumMessages = 50; // Minimum messages needed before generating responses
  }

  async analyzeChannelMessages(messages) {
    try {
      const currentTime = Date.now();
      
      // Only analyze if enough time has passed
      if (currentTime - this.lastAnalysisTime < this.analysisInterval) {
        return;
      }

      console.log(chalk.blue('[ANALYZER] Starting message analysis...'));
      
      // Update message history
      this.messageHistory = [...messages, ...this.messageHistory].slice(0, 1000); // Keep last 1000 messages
      
      // Analyze conversation patterns
      for (let i = 0; i < this.messageHistory.length - 1; i++) {
        const message = this.messageHistory[i];
        const response = this.messageHistory[i + 1];
        
        if (message.author.bot || response.author.bot) continue;
        
        const key = this.normalizeMessage(message.content);
        if (!this.responsePatterns.has(key)) {
          this.responsePatterns.set(key, []);
        }
        this.responsePatterns.get(key).push(response.content);
      }

      const totalMessages = this.messageHistory.length;
      const totalPatterns = this.responsePatterns.size;
      
      console.log(chalk.green(`[ANALYZER] Analyzed ${totalMessages} messages`));
      console.log(chalk.cyan(`[ANALYZER] Found ${totalPatterns} conversation patterns`));
      
      // Check if we have enough data
      if (totalMessages < this.minimumMessages) {
        console.log(chalk.yellow(`[ANALYZER] Need ${this.minimumMessages - totalMessages} more messages before generating responses`));
      } else {
        console.log(chalk.green('[ANALYZER] Ready to generate responses!'));
      }
      
      this.lastAnalysisTime = currentTime;
    } catch (error) {
      console.error(chalk.red('[ANALYZER] Error analyzing messages:'), error);
    }
  }

  normalizeMessage(message) {
    // Convert to lowercase and remove special characters
    return message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  getStats() {
    return {
      totalMessages: this.messageHistory.length,
      totalPatterns: this.responsePatterns.size,
      minimumMessages: this.minimumMessages,
      readyForResponses: this.messageHistory.length >= this.minimumMessages
    };
  }

  similarity(str1, str2) {
    // Simple similarity check based on word overlap
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    return intersection.size / Math.max(words1.size, words2.size);
  }
} 