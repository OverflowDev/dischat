import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

class PatternService {
    constructor() {
        this.patterns = [];
        this.patternsFile = 'message_patterns.json';
    }

    async init() {
        try {
            const data = await fs.readFile(this.patternsFile, 'utf8');
            this.patterns = JSON.parse(data).patterns;
            console.log(chalk.green(`[PATTERN] Loaded ${this.patterns.length} patterns`));
        } catch (error) {
            console.log(chalk.yellow('[PATTERN] No patterns found, starting with empty set'));
            this.patterns = [];
        }
    }

    findResponse(message) {
        const cleanMessage = message.trim().toLowerCase();
        
        // Find exact matches first
        const exactMatch = this.patterns.find(p => p.trigger === cleanMessage);
        if (exactMatch) {
            console.log(chalk.cyan(`[PATTERN] Found exact match for: "${cleanMessage}"`));
            return exactMatch.response;
        }

        // Find partial matches if no exact match
        const partialMatch = this.patterns.find(p => 
            cleanMessage.includes(p.trigger) || 
            p.trigger.includes(cleanMessage)
        );

        if (partialMatch) {
            console.log(chalk.cyan(`[PATTERN] Found partial match for: "${cleanMessage}"`));
            return partialMatch.response;
        }

        return null;
    }

    async addPattern(trigger, response, author) {
        const pattern = {
            trigger: trigger.trim().toLowerCase(),
            response: response.trim(),
            timestamp: new Date().toISOString(),
            author: author
        };

        // Check if pattern already exists
        const exists = this.patterns.some(p => 
            p.trigger === pattern.trigger && 
            p.response === pattern.response
        );

        if (!exists) {
            this.patterns.push(pattern);
            await this.savePatterns();
            console.log(chalk.green(`[PATTERN] Added new pattern: "${pattern.trigger}" -> "${pattern.response}"`));
        }
    }

    async savePatterns() {
        try {
            const data = {
                patterns: this.patterns,
                lastUpdated: new Date().toISOString()
            };
            await fs.writeFile(this.patternsFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(chalk.red('[PATTERN] Failed to save patterns:'), error.message);
        }
    }
}

export { PatternService }; 