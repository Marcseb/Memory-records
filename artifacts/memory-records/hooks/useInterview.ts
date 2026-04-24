import { useState, useCallback } from "react";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseInterviewResult {
  question: string | null;
  isLoading: boolean;
  error: string | null;
  history: ChatMessage[];
  startInterview: (tags?: string[]) => Promise<void>;
  nextQuestion: (userNote: string, tags?: string[]) => Promise<void>;
  reset: () => void;
}

export function useInterview(): UseInterviewResult {
  const [question, setQuestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);

  const fetchQuestion = useCallback(async (messages: ChatMessage[], tags: string[]) => {
    if (!API_URL) {
      setError("API URL not configured.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, tags }),
      });
      const data = (await res.json()) as { question?: string; error?: string };
      if (!res.ok || !data.question) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      setQuestion(data.question);
      setHistory((prev) => [...prev, { role: "assistant", content: data.question! }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not reach AI service.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startInterview = useCallback(
    async (tags: string[] = []) => {
      const initialMessages: ChatMessage[] = [
        { role: "user", content: "Please start the interview with your first question." },
      ];
      setHistory([]);
      setQuestion(null);
      await fetchQuestion(initialMessages, tags);
    },
    [fetchQuestion]
  );

  const nextQuestion = useCallback(
    async (userNote: string, tags: string[] = []) => {
      const userMsg: ChatMessage = {
        role: "user",
        content: userNote.trim()
          ? `My answer / note so far: "${userNote.trim()}"\n\nPlease ask me your next follow-up question.`
          : "Please ask your next question.",
      };
      const updatedHistory = [...history, userMsg];
      setHistory(updatedHistory);
      await fetchQuestion(updatedHistory, tags);
    },
    [history, fetchQuestion]
  );

  const reset = useCallback(() => {
    setQuestion(null);
    setError(null);
    setHistory([]);
  }, []);

  return { question, isLoading, error, history, startInterview, nextQuestion, reset };
}
