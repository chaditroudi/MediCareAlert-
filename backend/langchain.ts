export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export const analyzePrescription = async (payload: any) => {
  return {
    summary: 'RAG backend is not configured yet.',
    medications: payload?.medications || [],
  };
};

export const chatWithRAG = async (question: string, history: ChatMessage[] = []) => {
  return `Assistant indisponible pour le moment. Question reçue: ${question}. Historique: ${history.length} message(s).`;
};

export async function* streamChatWithRAG(question: string, history: ChatMessage[] = []) {
  const response = await chatWithRAG(question, history);
  yield response;
}
