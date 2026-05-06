export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const SYSTEM_PROMPT = `Tu es MedCareAssistant, un assistant médical virtuel de la plateforme MedCareAlert+ en Tunisie.

RÔLE:
- Répondre aux questions sur les médicaments (posologie, interactions, effets secondaires)
- Expliquer les ordonnances médicales en langage clair et accessible
- Conseiller sur la bonne prise des médicaments et l'observance thérapeutique
- Informer sur les médicaments disponibles en Tunisie
- Alerter sur les interactions dangereuses connues

RÈGLES:
- Réponds toujours en français (ou en arabe si demandé)
- Ne remplace jamais l'avis d'un médecin ou d'un pharmacien
- Indique de consulter un professionnel pour les décisions médicales
- Ne prescris jamais de médicaments
- Sois précis, clair et bienveillant
- Pour les urgences, oriente vers les services d'urgence (SAMU: 190)

MÉDICAMENTS COURANTS EN TUNISIE: Doliprane, Augmentin, Amoxicilline, Voltarène, Aspégic, Spasfon, Smecta, Gaviscon, Mopral, Clamoxyl, Efferalgan, Dafalgan, Advil, Nurofen, Ventoline, Célestène, Solupred, Kardégic, etc.`;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

export const AI_FALLBACK_PREFIX = '__MEDCARE_AI_FALLBACK__';

const isQuotaError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /quota|resource.*exhausted|429|rate limit|too many requests/i.test(message);
};

const getFriendlyAiError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');

  if (/OPENROUTER_API_KEY/i.test(message)) {
    return {
      code: 'unavailable',
      message:
        'L assistant IA OpenRouter n est pas encore configure. Ajoutez OPENROUTER_API_KEY dans le backend pour activer le modele gratuit.',
    };
  }

  if (isQuotaError(error)) {
    return {
      code: 'quota',
      message:
        'Le modele gratuit OpenRouter est temporairement tres sollicite. Reessayez dans quelques minutes, ou continuez avec vos rappels et votre planning en attendant.',
    };
  }

  return {
    code: 'unavailable',
    message:
      'Le service IA est temporairement indisponible. Votre suivi médicament continue de fonctionner normalement.',
  };
};

const toFallbackText = (error: unknown) => {
  const friendly = getFriendlyAiError(error);
  return `${AI_FALLBACK_PREFIX}:${friendly.code}:${friendly.message}`;
};

const getOpenRouterKey = () => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
  return key;
};

const toOpenRouterMessages = (question: string, history: ChatMessage[] = []) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  return messages;
};

const createOpenRouterHeaders = () => ({
  Authorization: `Bearer ${getOpenRouterKey()}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:5000',
  'X-Title': process.env.OPENROUTER_APP_NAME || 'MedCareAlert+',
});

const extractOpenRouterError = async (response: Response) => {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error ||
      raw;
    return new Error(typeof message === 'string' ? message : `OpenRouter error ${response.status}`);
  } catch {
    return new Error(raw || `OpenRouter error ${response.status}`);
  }
};

const parseStreamingDataLine = (line: string) => {
  if (!line.startsWith('data: ')) return null;
  return line.slice(6).trim();
};

export const analyzePrescription = async (payload: any) => {
  try {
    const { medications = [], doctorName, prescriptionDate } = payload;

    const medList = medications
      .map((m: any) => `  - ${m.name}: ${m.dosage}, ${m.frequency}, ${m.durationInDays} jours`)
      .join('\n');

    const prompt = `Analyse cette ordonnance médicale tunisienne et fournis une réponse JSON avec:
- summary: résumé du traitement (2-3 phrases)
- interactions: interactions potentielles entre médicaments (tableau de strings)
- adherenceAdvice: conseils d'observance importants (tableau de strings)
- sideEffectsToWatch: effets secondaires à surveiller (tableau de strings)
- generalAdvice: conseils généraux

Ordonnance - Médecin: ${doctorName || 'Non spécifié'}, Date: ${prescriptionDate || 'Non spécifiée'}
Médicaments:
${medList || '  Aucun médicament'}

Réponds UNIQUEMENT en JSON valide, sans markdown.`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: createOpenRouterHeaders(),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) throw await extractOpenRouterError(response);

    const data = await response.json();
    const text: string = data?.choices?.[0]?.message?.content || '{}';
    const stripped = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }
    return { summary: stripped, interactions: [], adherenceAdvice: [], sideEffectsToWatch: [], generalAdvice: '' };
  } catch (err: any) {
    console.error('analyzePrescription error:', err.message);
    return {
      summary: 'Analyse temporairement indisponible.',
      interactions: [],
      adherenceAdvice: ['Suivez les instructions de votre médecin.'],
      sideEffectsToWatch: [],
      generalAdvice: 'Consultez votre pharmacien en cas de doute.',
    };
  }
};

export const chatWithRAG = async (question: string, history: ChatMessage[] = []) => {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: createOpenRouterHeaders(),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: toOpenRouterMessages(question, history),
        temperature: 0.3,
        max_tokens: 900,
      }),
    });

    if (!response.ok) {
      throw await extractOpenRouterError(response);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || 'Désolé, je ne peux pas répondre pour le moment.';
  } catch (err: any) {
    console.error('RAG chat error:', err?.message || err);
    return toFallbackText(err);
  }
};

export async function* streamChatWithRAG(question: string, history: ChatMessage[] = []) {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: createOpenRouterHeaders(),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: toOpenRouterMessages(question, history),
        temperature: 0.3,
        max_tokens: 900,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw await extractOpenRouterError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('OpenRouter streaming response is unavailable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const dataLine = parseStreamingDataLine(line);
        if (!dataLine) continue;
        if (dataLine === '[DONE]') return;

        try {
          const parsed = JSON.parse(dataLine);
          const token =
            parsed?.choices?.[0]?.delta?.content ||
            parsed?.choices?.[0]?.message?.content ||
            '';

          if (token) {
            yield token;
          }
        } catch {
          // Ignore malformed mid-stream chunks from upstream.
        }
      }
    }
  } catch (err: any) {
    console.error('RAG stream error:', err.message);
    yield toFallbackText(err);
  }
}
