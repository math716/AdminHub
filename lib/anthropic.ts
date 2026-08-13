import Anthropic from '@anthropic-ai/sdk';

// Singleton — reutiliza a conexão entre chamadas no mesmo processo
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export default anthropic;
