export function formatDiscordMessage(content) {
  // Remove any formal or AI-like patterns
  const casualContent = content
    .replace(/^(I apologize|I'm sorry|Sorry|Let me|I would|I think)/gi, "")
    .replace(/^(Actually|Well|You see|To answer|In response)/gi, "")
    .trim();

  return {
    content: casualContent
  };
} 