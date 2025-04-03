import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

class GeminiService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: {
                temperature: 0.9,
                topK: 1,
                topP: 1,
                maxOutputTokens: 100,  // Limit response length
                stopSequences: ["\n\n", "Here's", "Let me", "I'll", "You should"]  // Reduced to 5 sequences
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_NONE",
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_NONE",
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_NONE",
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_NONE",
                },
            ],
        });
        this.dailyResponses = new Map(); // Track responses per day
        this.lastResponseDate = null;
    }

    async init() {
        try {
            console.log(chalk.yellow('[GEMINI] Testing connection to 2.0 Flash-Lite...'));
            const testResult = await this.model.generateContent("Abeg, wetin dey happen?");
            console.log(chalk.green('[GEMINI] Connection successful!'));
            console.log(chalk.cyan('[GEMINI] Test response:'), testResult.response.text());
        } catch (error) {
            console.error(chalk.red('[GEMINI] Connection failed:'), error.message);
            throw error;
        }
    }

    async generateContent(message) {
        try {
            console.log(chalk.blue('[GEMINI] Generating response...'));
            
            // Add Nigerian context to the prompt
            const nigerianPrompt = `Respond like a casual Nigerian friend. Keep it short and fun. No teaching or long explanations. Just vibe with the message. Use Nigerian slang and expressions. Here's what they said: ${message}`;
            
            const result = await this.model.generateContent(nigerianPrompt);
            let response = result.response.text();

            // Clean up any remaining AI-like phrases
            const phrasesToRemove = [
                "Here's", "Let me", "I'll", "You should", "To", "First", "Next", "Finally", 
                "Remember", "Keep in mind", "Make sure", "Don't forget", "Always", "Never",
                "The key", "The most important", "The best way", "The right way", "The proper way",
                "The correct way", "The way to", "How to", "What you need to", "What you should",
                "What you must", "What you have to", "What you ought to", "What you're supposed to",
                "What you're expected to", "What you're required to", "What you're obligated to",
                "What you're meant to", "What you're intended to", "What you're designed to",
                "What you're built to", "What you're created to", "What you're made to",
                "What you're programmed to", "What you're trained to", "What you're taught to",
                "What you're instructed to", "What you're directed to", "What you're guided to",
                "What you're led to", "What you're shown to", "What you're demonstrated to",
                "What you're illustrated to", "What you're exemplified to", "What you're modeled to",
                "What you're patterned to", "What you're based on", "What you're founded on",
                "What you're established on", "What you're built on", "What you're created on",
                "What you're made on", "What you're programmed on", "What you're trained on",
                "What you're taught on", "What you're instructed on", "What you're directed on",
                "What you're guided on", "What you're led on", "What you're shown on",
                "What you're demonstrated on", "What you're illustrated on", "What you're exemplified on",
                "What you're modeled on", "What you're patterned on", "What you're based upon",
                "What you're founded upon", "What you're established upon", "What you're built upon",
                "What you're created upon", "What you're made upon", "What you're programmed upon",
                "What you're trained upon", "What you're taught upon", "What you're instructed upon",
                "What you're directed upon", "What you're guided upon", "What you're led upon",
                "What you're shown upon", "What you're demonstrated upon", "What you're illustrated upon",
                "What you're exemplified upon", "What you're modeled upon", "What you're patterned upon"
            ];

            for (const phrase of phrasesToRemove) {
                response = response.replace(new RegExp(phrase, 'gi'), '');
            }

            // If response is empty after cleaning, use a simple reaction
            if (!response.trim()) {
                response = '👍';
            }

            // Check if this response has been used too many times today
            const today = new Date().toDateString();
            if (this.lastResponseDate !== today) {
                this.dailyResponses.clear();
                this.lastResponseDate = today;
            }

            const responseCount = this.dailyResponses.get(response) || 0;
            if (responseCount >= 3) {
                console.log(chalk.yellow('[GEMINI] Response used too many times today, generating alternative'));
                return this.generateAlternativeResponse(message);
            }

            this.dailyResponses.set(response, responseCount + 1);
            return response;
        } catch (error) {
            console.error(chalk.red('[GEMINI] Error generating content:'), error);
            throw error;
        }
    }

    async generateAlternativeResponse(message) {
        const prompt = `Generate a different response to this message, avoiding the previous responses. 
        Keep it natural and Nigerian in style (not pidgin). Message: "${message}"`;
        
        const result = await this.model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.8, // Slightly higher temperature for variety
                maxOutputTokens: 100,
            }
        });

        return result.response.text().trim();
    }
}

export { GeminiService }; 