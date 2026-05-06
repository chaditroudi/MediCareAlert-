import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { API_BASE } from '../lib/appConfig';
import { ui } from '../lib/ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface MedicalAssistantProps {
  user: User;
  token: string;
}

interface AiFallbackState {
  code: 'quota' | 'unavailable';
  message: string;
}

const AI_FALLBACK_PREFIX = '__MEDCARE_AI_FALLBACK__';

const parseAiFallback = (content: string): AiFallbackState | null => {
  if (!content.startsWith(`${AI_FALLBACK_PREFIX}:`)) {
    return null;
  }

  const [, code, ...messageParts] = content.split(':');
  const message = messageParts.join(':').trim();
  if ((code === 'quota' || code === 'unavailable') && message) {
    return { code, message };
  }

  return {
    code: 'unavailable',
    message: 'Le service IA est temporairement indisponible. Votre suivi continue normalement.',
  };
};

const SUGGESTED_QUESTIONS: Record<UserRole, string[]> = {
  [UserRole.PATIENT]: [
    'Quelles sont les interactions entre Doliprane et Aspirine ?',
    'Comment prendre un antibiotique correctement ?',
    'Que faire si j\'oublie une prise de médicament ?',
    'Quels effets secondaires surveiller avec les anti-inflammatoires ?',
    'Comment conserver mes médicaments à la maison ?',
  ],
  [UserRole.PHARMACIST]: [
    'Quelles sont les contre-indications des AINS chez les personnes âgées ?',
    'Comment expliquer l\'observance thérapeutique à un patient ?',
    'Quelle est la durée de conservation des antibiotiques ouverts ?',
    'Interactions médicamenteuses avec les anticoagulants ?',
    'Conseils pour les médicaments à prendre à jeun ?',
  ],
  [UserRole.ADMIN]: [
    'Quels indicateurs suivre pour l\'observance thérapeutique ?',
    'Comment évaluer la qualité d\'une pharmacie de réseau ?',
  ],
};

const MedicalAssistant: React.FC<MedicalAssistantProps> = ({ user, token }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Bonjour ${user.name.split(' ')[0]} ! Je suis **MedCareAssistant**, votre assistant médical virtuel.\n\nJe peux vous aider avec :\n- Des questions sur vos médicaments\n- Les interactions et effets secondaires\n- Les conseils d'observance thérapeutique\n- Les informations sur les médicaments disponibles en Tunisie\n\n*Je ne remplace pas l'avis de votre médecin ou pharmacien.*\n\nComment puis-je vous aider ?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const [fallbackState, setFallbackState] = useState<AiFallbackState | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = SUGGESTED_QUESTIONS[user.role] ?? SUGGESTED_QUESTIONS[UserRole.PATIENT];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getHistory = () =>
    messages
      .filter(m => !m.isStreaming)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const sendMessage = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || isLoading) return;

    setInput('');
    setIsLoading(true);
    setFallbackState(null);

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    if (useStreaming) {
      setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

      try {
        abortRef.current = new AbortController();
        const res = await fetch(`${API_BASE}/rag/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ question: text, history: getHistory() }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error(`Server error ${res.status}`);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                accumulated += parsed.token;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: accumulated, isStreaming: true };
                  return copy;
                });
              }
              if (parsed.error) throw new Error(parsed.error);
            } catch { /* skip malformed lines */ }
          }
        }

        const finalContent = accumulated || 'Désolé, réponse vide.';
        const fallback = parseAiFallback(finalContent);
        setFallbackState(fallback);
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: fallback ? fallback.message : finalContent, isStreaming: false };
          return copy;
        });
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + ' *(arrêté)*', isStreaming: false };
            return copy;
          });
        } else {
          setFallbackState({
            code: 'unavailable',
            message: 'Le service IA est temporairement indisponible. Vous pouvez réessayer dans un instant.',
          });
          setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: 'Le service IA est temporairement indisponible. Vous pouvez réessayer dans un instant.', isStreaming: false };
            return copy;
          });
        }
      }
    } else {
      // Non-streaming fallback
      try {
        const res = await fetch(`${API_BASE}/rag/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ question: text, history: getHistory() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur serveur');
        const fallback = parseAiFallback(data.answer || '');
        setFallbackState(fallback);
        setMessages(prev => [...prev, { role: 'assistant', content: fallback ? fallback.message : data.answer }]);
      } catch (err: any) {
        setFallbackState({
          code: 'unavailable',
          message: 'Le service IA est temporairement indisponible. Vous pouvez continuer votre suivi et réessayer plus tard.',
        });
        setMessages(prev => [...prev, { role: 'assistant', content: 'Le service IA est temporairement indisponible. Vous pouvez continuer votre suivi et réessayer plus tard.' }]);
      }
    }

    setIsLoading(false);
    abortRef.current = null;
    inputRef.current?.focus();
  }, [isLoading, messages, token, useStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    setFallbackState(null);
    setMessages([{
      role: 'assistant',
      content: `Conversation réinitialisée. Comment puis-je vous aider, ${user.name.split(' ')[0]} ?`,
    }]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className={`${ui.card} mb-4 px-5 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#0A74DA] to-[#10B981] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
              <i className="fas fa-robot text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">MedCareAssistant</h2>
              <p className="text-xs font-semibold text-slate-400">Assistant médical guidé • Réponses en français</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseStreaming(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${useStreaming ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
              title="Basculer streaming"
            >
              <i className={`fas fa-bolt text-xs`}></i>
              {useStreaming ? 'Streaming' : 'Standard'}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
            >
              <i className="fas fa-trash-can text-xs"></i>
              Effacer
            </button>
          </div>
        </div>
        {fallbackState && (
          <div className={`mt-4 rounded-[1.5rem] border px-4 py-3 ${fallbackState.code === 'quota' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${fallbackState.code === 'quota' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>
                <i className={`fas ${fallbackState.code === 'quota' ? 'fa-hourglass-half' : 'fa-wifi'}`}></i>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em]">
                  {fallbackState.code === 'quota' ? 'Assistant temporairement limité' : 'Assistant en mode dégradé'}
                </p>
                <p className="mt-1 text-sm font-semibold">{fallbackState.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {suggestions.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all shadow-sm"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-white rounded-[2rem] border border-slate-200 shadow-sm p-5 space-y-4 mb-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-[#0A74DA] to-[#0B2239] text-white'
                : 'bg-gradient-to-br from-[#0A74DA] to-[#10B981] text-white'
            }`}>
              {msg.role === 'user'
                ? user.name[0].toUpperCase()
                : <i className="fas fa-robot text-xs"></i>}
            </div>
            {/* Bubble */}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#0A74DA] text-white rounded-tr-sm'
                : 'bg-slate-50 text-slate-800 border border-slate-200 rounded-tl-sm'
            }`}>
              <MessageContent content={msg.content} />
              {msg.isStreaming && (
                <span className="inline-flex gap-1 ml-2 align-middle">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Disclaimer */}
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl mb-3 text-xs text-amber-700 font-medium">
        <i className="fas fa-triangle-exclamation shrink-0"></i>
        Cet assistant fournit des informations générales. Consultez toujours un professionnel de santé pour les décisions médicales.
      </div>

      {/* Input area */}
      <div className="flex gap-3 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question médicale... (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
          rows={2}
          disabled={isLoading}
          className="flex-1 resize-none bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition disabled:opacity-50 shadow-sm"
        />
        {isLoading ? (
          <button
            onClick={handleStop}
            className="w-12 h-12 bg-red-500 hover:bg-red-600 text-white rounded-2xl flex items-center justify-center transition shadow-lg shrink-0"
            title="Arrêter la réponse"
          >
            <i className="fas fa-stop text-sm"></i>
          </button>
        ) : (
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className="w-12 h-12 bg-[#0A74DA] hover:bg-[#085fb2] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl flex items-center justify-center transition shadow-lg shrink-0"
            title="Envoyer (Entrée)"
          >
            <i className="fas fa-paper-plane text-sm"></i>
          </button>
        )}
      </div>
    </div>
  );
};

/** Render markdown-lite: bold, italic, bullet lists, line breaks */
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const isBullet = line.match(/^[-*•]\s/);
        const formatted = line
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
        return (
          <p
            key={i}
            className={isBullet ? 'pl-3 flex gap-2' : ''}
            dangerouslySetInnerHTML={{
              __html: isBullet
                ? `<span class="mt-1 w-1.5 h-1.5 rounded-full bg-current shrink-0 inline-block"></span><span>${formatted.replace(/^[-*•]\s/, '')}</span>`
                : formatted || '&nbsp;',
            }}
          />
        );
      })}
    </div>
  );
};

export default MedicalAssistant;
