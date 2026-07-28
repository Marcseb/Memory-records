import { useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { MemoryRecord } from "@/context/RecordsContext";
import { VoiceLanguage } from "@/context/SettingsContext";

const MISTRAL_KEY_STORE = "mr_mistral_key";
const OPENAI_KEY_STORE = "mr_openai_key";

/** Maps voice-language codes to the national country label used in prompts. */
const COUNTRY_MAP: Record<VoiceLanguage, string> = {
  "fr-FR": "France",
  "it-IT": "Italy",
  "en-US": "United States",
};

interface RawEvent {
  title: string;
  summary: string;
}

async function callAI(
  key: string,
  endpoint: string,
  model: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a historian. Reply ONLY with a valid JSON array — no markdown code fences, no extra text or commentary whatsoever.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content.trim();
}

async function fetchWithFallback(prompt: string): Promise<string> {
  const [mistralKey, openaiKey] = await Promise.all([
    SecureStore.getItemAsync(MISTRAL_KEY_STORE),
    SecureStore.getItemAsync(OPENAI_KEY_STORE),
  ]);
  const hasMistral = !!mistralKey?.trim();
  const hasOpenAI = !!openaiKey?.trim();

  if (!hasMistral && !hasOpenAI) {
    throw new Error(
      "No AI API key configured. Add your Mistral or OpenAI key in Settings → AI Interviewer.",
    );
  }

  if (hasMistral) {
    try {
      return await callAI(
        mistralKey!.trim(),
        "https://api.mistral.ai/v1/chat/completions",
        "mistral-large-latest",
        prompt,
      );
    } catch {
      // fall through to OpenAI
    }
  }

  if (hasOpenAI) {
    return await callAI(
      openaiKey!.trim(),
      "https://api.openai.com/v1/chat/completions",
      "gpt-4o-mini",
      prompt,
    );
  }

  throw new Error("AI service unavailable.");
}

function parseRawEvents(raw: string): RawEvent[] {
  // Strip markdown code fences if the model included them despite instructions
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const arr = JSON.parse(cleaned);
  if (!Array.isArray(arr)) throw new Error("Expected a JSON array from AI.");
  return arr.filter(
    (e: unknown): e is RawEvent =>
      !!e &&
      typeof (e as RawEvent).title === "string" &&
      typeof (e as RawEvent).summary === "string",
  );
}

function buildPrompt(
  year: number,
  count: number,
  scope: "international" | "national",
  country: string,
): string {
  const focus =
    scope === "international"
      ? "worldwide or global scope (not specific to one country)"
      : `national scope in ${country}`;

  return (
    `Generate exactly ${count} of the most historically significant events from the year ${year} ` +
    `with ${focus}. ` +
    `For each event provide: "title" (concise name, max 8 words) and "summary" ` +
    `(exactly 10 sentences covering: historical background, key actors and decisions, ` +
    `what happened, immediate consequences, and long-term historical significance). ` +
    `Return ONLY a JSON array: [{"title":"...","summary":"..."}]`
  );
}

export function useHistoricalEvents() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate historical event records for a given year.
   * Fires international and national requests in parallel.
   * Returns however many records were successfully generated (partial success is accepted).
   */
  const generate = useCallback(
    async (
      year: number,
      language: VoiceLanguage,
      maxInternational: number,
      maxNational: number,
    ): Promise<MemoryRecord[]> => {
      setIsLoading(true);
      setError(null);

      try {
        const country = COUNTRY_MAP[language] ?? "France";
        const now = Date.now();
        const results: MemoryRecord[] = [];

        // Fire both scopes in parallel; treat each independently
        const [intlResult, natResult] = await Promise.allSettled([
          maxInternational > 0
            ? fetchWithFallback(buildPrompt(year, maxInternational, "international", country))
            : Promise.resolve("[]"),
          maxNational > 0
            ? fetchWithFallback(buildPrompt(year, maxNational, "national", country))
            : Promise.resolve("[]"),
        ]);

        if (intlResult.status === "fulfilled") {
          try {
            const events = parseRawEvents(intlResult.value);
            events.slice(0, maxInternational).forEach((ev, i) => {
              results.push({
                id: (now + i).toString(36) + Math.random().toString(36).slice(2, 9),
                note: `**${ev.title}**\n\n${ev.summary}`,
                date: `${year} · World Event`,
                contextYear: year,
                isHistoricalEvent: true,
                eventScope: "international",
                tags: ["historical"],
                savedToObsidian: false,
                createdAt: now + i,
              });
            });
          } catch {
            // Parsing failed for international — still try to return national
          }
        }

        if (natResult.status === "fulfilled") {
          try {
            const events = parseRawEvents(natResult.value);
            events.slice(0, maxNational).forEach((ev, i) => {
              results.push({
                id: (now + 100 + i).toString(36) + Math.random().toString(36).slice(2, 9),
                note: `**${ev.title}**\n\n${ev.summary}`,
                date: `${year} · ${country} Event`,
                contextYear: year,
                isHistoricalEvent: true,
                eventScope: "national",
                tags: ["historical"],
                savedToObsidian: false,
                createdAt: now + 100 + i,
              });
            });
          } catch {
            // Parsing failed for national
          }
        }

        if (results.length === 0) {
          // Surface the first error we have
          const rootError =
            intlResult.status === "rejected"
              ? String(intlResult.reason)
              : natResult.status === "rejected"
              ? String(natResult.reason)
              : "No events could be generated.";
          throw new Error(rootError);
        }

        return results;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not generate events.";
        setError(msg);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { generate, isLoading, error };
}
