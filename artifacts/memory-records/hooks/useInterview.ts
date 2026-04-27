import { useState, useCallback } from "react";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

export interface ChatMessage {
  role: "user" | "assistant";
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

async function fetchFromAPI(messages: ChatMessage[], tags: string[]): Promise<string> {
  if (!API_URL) throw new Error("API URL not configured.");

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tags }),
    });
  } catch {
    throw new Error("Cannot reach the AI service. Check your internet connection and try again.");
  }

  const text = await res.text();

  let data: { question?: string; error?: string };
  try {
    data = JSON.parse(text) as { question?: string; error?: string };
  } catch {
    // Server returned HTML (e.g. a 502 proxy page while the server is restarting)
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        `The AI service is temporarily unavailable (server returned status ${res.status}). Please wait a few seconds and try again.`
      );
    }
    throw new Error(`Unexpected response from server (status ${res.status}).`);
  }

  if (!res.ok || !data.question) {
    throw new Error(data.error ?? `Server error ${res.status}`);
  }
  return data.question;
}

export function useInterview(): UseInterviewResult {
  const [question, setQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Full conversation history: alternating user / assistant, starting with user.
  const [history, setHistory] = useState<ChatMessage[]>([]);

  const startInterview = useCallback(async (tags: string[] = [], seedContext?: string) => {
    setIsLoading(true);
    setError(null);
    setQuestion(null);

    const truncated = seedContext && seedContext.length > 600
      ? seedContext.slice(0, 600) + "…"
      : seedContext;

    const seed: ChatMessage = {
      role: "user",
      content: truncated
        ? `I have a previous memory note I'd like to explore further:\n\n"${truncated}"\n\nPlease ask me a focused follow-up question to help me recall and share more details about this memory.`
        : "Please start the interview with your first question.",
    };

    try {
      const q = await fetchFromAPI([seed], tags);
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
        const q = await fetchFromAPI(updatedHistory, tags);
        const newHistory: ChatMessage[] = [...updatedHistory, { role: "assistant", content: q }];
        setHistory(newHistory);
        setQuestion(q);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not reach AI service.");
        // Roll back the optimistic user message so history stays consistent
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
