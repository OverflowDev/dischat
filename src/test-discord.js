import Discord from 'discord-simple-api';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

async function testDiscordReply() {
    try {
        console.log(chalk.blue('[TEST] Starting Discord reply test...'));
        
        const bot = new Discord(process.env.BOT_TOKEN);
        
        // Get the last message in the channel
        console.log(chalk.yellow('[TEST] Fetching last message...'));
        const messages = await bot.getMessagesInChannel(process.env.CHANNEL_ID, 1);
        
        if (!messages || messages.length === 0) {
            console.log(chalk.red('[TEST] No messages found'));
            return;
        }

        const lastMessage = messages[0];
        console.log(chalk.green('[TEST] Last message found:'));
        console.log(chalk.cyan(`Message ID: ${lastMessage.id}`));
        console.log(chalk.cyan(`Content: ${lastMessage.content}`));
        console.log(chalk.cyan(`Author: ${lastMessage.author.username}`));
        console.log(chalk.cyan(`Author ID: ${lastMessage.author.id}`));

        // Test reply with quote
        console.log(chalk.yellow('\n[TEST] Testing reply with quote...'));
        
        const replyText = `Testing reply with quote`;
        
        try {
            const reply = await bot.sendMessageToChannel(
                process.env.CHANNEL_ID,
                replyText,
                {
                    message_reference: {
                        message_id: lastMessage.id,
                        channel_id: process.env.CHANNEL_ID,
                        guild_id: lastMessage.guild_id
                    },
                    allowed_mentions: {
                        replied_user: true
                    }
                }
            );

            console.log(chalk.green('[TEST] Reply sent successfully'));
            console.log(chalk.cyan('Reply content:', replyText));
            console.log(chalk.cyan('Message reference:', JSON.stringify(reply.message_reference, null, 2)));
            console.log(chalk.cyan('Allowed mentions:', JSON.stringify(reply.allowed_mentions, null, 2)));

        } catch (error) {
            if (error.response?.data?.code === 20016) {
                // Handle slowmode rate limit
                const retryAfter = error.response.data.retry_after;
                console.log(chalk.yellow(`[TEST] Rate limited. Waiting ${retryAfter} seconds...`));
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000 + 1000)); // Add 1 second buffer
                
                // Retry the send
                console.log(chalk.yellow('[TEST] Retrying send...'));
                const reply = await bot.sendMessageToChannel(
                    process.env.CHANNEL_ID,
                    replyText,
                    {
                        message_reference: {
                            message_id: lastMessage.id,
                            channel_id: process.env.CHANNEL_ID,
                            guild_id: lastMessage.guild_id
                        },
                        allowed_mentions: {
                            replied_user: true
                        }
                    }
                );
                
                console.log(chalk.green('[TEST] Reply sent successfully after retry'));
                console.log(chalk.cyan('Reply content:', replyText));
                console.log(chalk.cyan('Message reference:', JSON.stringify(reply.message_reference, null, 2)));
                console.log(chalk.cyan('Allowed mentions:', JSON.stringify(reply.allowed_mentions, null, 2)));
            } else {
                throw error;
            }
        }

    } catch (error) {
        console.error(chalk.red('[TEST] Error:'), error);
        if (error.response?.data) {
            console.error(chalk.red('[TEST] API Error:'), JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the test
console.log(chalk.yellow('[START] Running Discord reply feature test...'));
testDiscordReply().then(() => {
    console.log(chalk.green('[DONE] Test completed'));
}).catch(error => {
    console.error(chalk.red('[ERROR] Test failed:'), error);
}); 