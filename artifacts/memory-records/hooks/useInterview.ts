import { useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const MISTRAL_KEY_STORE = "mr_mistral_key";
const OPENAI_KEY_STORE = "mr_openai_key";

const SYSTEM_PROMPT = `You are a compassionate and patient interviewer who guides the user through the process of recalling and sharing life memories.

You are a skilled biographer and oral historian with years of experience helping people uncover and articulate their life stories. You understand that memories can be fragile, emotional, or fragmented, so you ask thoughtful, open-ended questions to gently guide the user. Your tone is warm, empathetic, and non-judgmental, and you adapt your approach based on the user's comfort level.

Your goal is to elicit detailed, emotionally rich, and accurate memories from the user to build a comprehensive foundation for writing an autobiography.

Rules:
- Ask ONE focused, open-ended question at a time.
- Keep each question to 1-3 sentences maximum.
- Vary between different life stages: childhood, adolescence, young adulthood, adulthood.
- Explore emotions, sensory details, relationships, and pivotal moments.
- When the user has already shared something in their note, ask a natural follow-up that digs deeper.
- Never repeat a question already asked.
- Do not add preamble like "Great!" or "Thank you for sharing" — go straight to the question.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FullMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface UseInterviewResult {
  question: string | null;
  isLoading: boolean;
  error: string | null;
  history: ChatMessage[];
  startInterview: (tags?: string[], seedContext?: string) => Promise<void>;
  nextQuestion: (userNote: string, tags?: string[]) => Promise<void>;
  reset: () => void;
}

async function callMistral(key: string, messages: FullMessage[]): Promise<string> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages,
      max_tokens: 200,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

async function callOpenAI(key: string, messages: FullMessage[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 200,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

async function fetchQuestion(messages: ChatMessage[], tags: string[]): Promise<string> {
  const [mistralKey, openaiKey] = await Promise.all([
    SecureStore.getItemAsync(MISTRAL_KEY_STORE),
    SecureStore.getItemAsync(OPENAI_KEY_STORE),
  ]);

  const hasMistral = !!mistralKey?.trim();
  const hasOpenAI = !!openaiKey?.trim();

  if (!hasMistral && !hasOpenAI) {
    throw new Error(
      "No AI API key configured. Please add your Mistral or OpenAI API key in Settings → AI Interviewer."
    );
  }

  const tagContext =
    tags.length > 0
      ? `\n\nFOCUS TOPICS: The user has selected these tags for this memory session: ${tags.map((t) => `#${t}`).join(", ")}.\nYour questions MUST stay focused on memories related to these specific topics. Do not ask about unrelated life areas. Every question should be directly connected to at least one of these themes.`
      : "";

  const fullMessages: FullMessage[] = [
    { role: "system", content: SYSTEM_PROMPT + tagContext },
    ...messages,
  ];

  const errors: string[] = [];

  if (hasMistral) {
    try {
      return await callMistral(mistralKey!.trim(), fullMessages);
    } catch (e) {
      errors.push(`Mistral: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (hasOpenAI) {
    try {
      return await callOpenAI(openaiKey!.trim(), fullMessages);
    } catch (e) {
      errors.push(`OpenAI: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  throw new Error(
    `AI service unavailable. ${errors.join(" | ")}`
  );
}

export function useInterview(): UseInterviewResult {
  const [question, setQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);

  const startInterview = useCallback(async (tags: string[] = [], seedContext?: string) => {
    setIsLoading(true);
    setError(null);
    setQuestion(null);

    const truncated =
      seedContext && seedContext.length > 600
        ? seedContext.slice(0, 600) + "…"
        : seedContext;

    const seed: ChatMessage = {
      role: "user",
      content: truncated
        ? `I have a previous memory note I'd like to explore further:\n\n"${truncated}"\n\nPlease ask me a focused follow-up question to help me recall and share more details about this memory.`
        : "Please start the interview with your first question.",
    };

    try {
      const q = await fetchQuestion([seed], tags);
      const initialHistory: ChatMessage[] = [seed, { role: "assistant", content: q }];
      setHistory(initialHistory);
      setQuestion(q);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not reach AI service.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const nextQuestion = useCallback(
    async (userNote: string, tags: string[] = []) => {
      setIsLoading(true);
      setError(null);

      const userMsg: ChatMessage = {
        role: "user",
        content: userNote.trim()
          ? `Here is what I've written about that: "${userNote.trim()}"\n\nPlease ask your next follow-up question.`
          : "Please continue with your next question.",
      };

      const updatedHistory = [...history, userMsg];

      try {
        const q = await fetchQuestion(updatedHistory, tags);
        const newHistory: ChatMessage[] = [
          ...updatedHistory,
          { role: "assistant", content: q },
        ];
        setHistory(newHistory);
        setQuestion(q);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not reach AI service.");
        setHistory(history);
      } finally {
        setIsLoading(false);
      }
    },
    [history]
  );

  const reset = useCallback(() => {
    setQuestion(null);
    setError(null);
    setHistory([]);
  }, []);

  return { question, isLoading, error, history, startInterview, nextQuestion, reset };
}
