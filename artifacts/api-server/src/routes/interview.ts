import { Router } from "express";
import { logger } from "../lib/logger";

const router: Router = Router();

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

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function callMistral(messages: ChatMessage[]): Promise<string> {
  const key = process.env["MISTRAL_API_KEY"];
  if (!key) throw new Error("No MISTRAL_API_KEY configured");

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

async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("No OPENAI_API_KEY configured");

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

async function callClaude(messages: ChatMessage[]): Promise<string> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) throw new Error("No ANTHROPIC_API_KEY configured");

  const systemMsg = messages.find((m) => m.role === "system")?.content ?? SYSTEM_PROMPT;
  const nonSystem = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      system: systemMsg,
      messages: nonSystem,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content[0].text.trim();
}

router.post("/interview", async (req, res) => {
  try {
    const { messages = [], tags = [] } = req.body as {
      messages: ChatMessage[];
      tags: string[];
    };

    const tagContext =
      tags.length > 0
        ? `\n\nFOCUS TOPICS: The user has selected these tags for this memory session: ${tags.map((t) => `#${t}`).join(", ")}.\nYour questions MUST stay focused on memories related to these specific topics. Do not ask about unrelated life areas. Every question should be directly connected to at least one of these themes.`
        : "";

    const fullMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT + tagContext },
      ...messages,
    ];

    let question: string | null = null;
    const errors: string[] = [];

    try {
      question = await callMistral(fullMessages);
      logger.info("Interview question generated via Mistral");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn({ err: msg }, "Mistral failed, trying OpenAI");
      errors.push(`Mistral: ${msg}`);
    }

    if (!question) {
      try {
        question = await callOpenAI(fullMessages);
        logger.info("Interview question generated via OpenAI");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn({ err: msg }, "OpenAI failed, trying Claude");
        errors.push(`OpenAI: ${msg}`);
      }
    }

    if (!question) {
      try {
        question = await callClaude(fullMessages);
        logger.info("Interview question generated via Claude");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn({ err: msg }, "Claude also failed");
        errors.push(`Claude: ${msg}`);
      }
    }

    if (!question) {
      logger.error({ errors }, "All AI providers failed");
      return res.status(503).json({
        error: "AI service temporarily unavailable. Please check your API keys in Settings.",
        details: errors,
      });
    }

    return res.json({ question });
  } catch (err) {
    logger.error({ err }, "Interview endpoint error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
