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
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
        this.dailyResponses = new Map(); // Track responses per day
        this.lastResponseDate = null;
    }

    async init() {
        try {
            const result = await this.model.generateContent("Test connection");
            console.log(chalk.green('[GEMINI] Connected to Gemini 2.0 Flash-Lite successfully!'));
        } catch (error) {
            console.error(chalk.red('[GEMINI] Connection failed:'), error.message);
            throw error;
        }
    }

    async generateContent(message) {
        try {
            // Clean up response patterns
            const prompt = `You are a Nigerian AI assistant. Respond naturally in English (not pidgin) with a Nigerian cultural touch. 
            Avoid phrases like "Oh man", "Oof", "Need to catch up on Zzz's", "Hope you can catch a break soon", or any sleep/rest related responses.
            Keep responses concise and relevant to the last message only.
            Message to respond to: "${message}"`;

            const result = await this.model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 100,
                }
            });

            let response = result.response.text();
            
            // Clean up AI-like phrases
            const phrasesToRemove = [
                "I understand", "I see", "I get it", "I know", "I hear you",
                "That's interesting", "That's cool", "That's nice",
                "Let me", "Allow me", "I'll", "I will",
                "As an AI", "As a language model", "As an assistant",
                "I'm here to", "I can help", "I can assist",
                "Based on", "According to", "In my experience",
                "I think", "I believe", "I feel",
                "You're right", "You're correct", "You're absolutely right",
                "That's right", "That's correct", "That's absolutely right",
                "Absolutely", "Definitely", "Certainly",
                "Of course", "Sure", "Yes",
                "No problem", "No worries", "Don't worry",
                "I hope", "I wish", "I pray",
                "Take care", "Take it easy", "Have a good one",
                "Cheers", "Best regards", "Best wishes",
                "Thanks", "Thank you", "Appreciate it",
                "You're welcome", "Anytime", "My pleasure",
                "Let me know", "Feel free", "Don't hesitate",
                "I'm glad", "I'm happy", "I'm pleased",
                "I'm sorry", "I apologize", "My apologies",
                "I'm afraid", "I'm concerned", "I'm worried",
                "I'm sure", "I'm certain", "I'm confident",
                "I'm not sure", "I'm not certain", "I'm not confident",
                "I'm not sure about that", "I'm not certain about that", "I'm not confident about that",
                "I'm not sure what to say", "I'm not certain what to say", "I'm not confident what to say",
                "I'm not sure how to respond", "I'm not certain how to respond", "I'm not confident how to respond",
                "I'm not sure what to do", "I'm not certain what to do", "I'm not confident what to do",
                "I'm not sure what to think", "I'm not certain what to think", "I'm not confident what to think",
                "I'm not sure what to feel", "I'm not certain what to feel", "I'm not confident what to feel",
                "I'm not sure what to say about that", "I'm not certain what to say about that", "I'm not confident what to say about that",
                "I'm not sure what to do about that", "I'm not certain what to do about that", "I'm not confident what to do about that",
                "I'm not sure what to think about that", "I'm not certain what to think about that", "I'm not confident what to think about that",
                "I'm not sure what to feel about that", "I'm not certain what to feel about that", "I'm not confident what to feel about that"
            ];

            for (const phrase of phrasesToRemove) {
                response = response.replace(new RegExp(phrase, 'gi'), '');
            }

            // Clean up the response
            response = response.trim();
            if (!response) {
                return "I understand.";
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
            console.error(chalk.red('[GEMINI] Error generating content:'), error.message);
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