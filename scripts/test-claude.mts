// scripts/test-claude.mjs
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function test() {
  const message = await client.messages.create({
    model:      'claude-haiku-4-5-20251001', // Haiku 4.5
    max_tokens: 100,
    messages: [{
      role:    'user',
      content: 'Classify this word into one topic [food, animals, work]: "apple". Reply with just the topic name.',
    }],
  });

  console.log('✅ Kết nối thành công!');
  //console.log('📝 Response:', message.content[0].text);
  console.log('📊 Tokens dùng:', message.usage);
}

test().catch(console.error);