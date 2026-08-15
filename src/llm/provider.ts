export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<LLMResponse>;
}
