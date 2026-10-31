import { GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";

export type GeminiErrorCode =
  | "NO_KEY"
  | "AUTH"
  | "QUOTA"
  | "TIMEOUT"
  | "BLOCKED"
  | "BAD_JSON"
  | "EMPTY"
  | "UNKNOWN";

export class GeminiError extends Error {
  readonly code: GeminiErrorCode;
  readonly retryable: boolean;

  constructor(code: GeminiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.retryable = retryable;
  }
}

const DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

function modelChain(): string[] {
  const pinned = process.env.GEMINI_MODEL?.trim();
  return pinned ? [pinned] : DEFAULT_MODELS;
}

let client: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError(
      "NO_KEY",
      "No Gemini API key is configured on the server.",
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

function classify(error: unknown): GeminiError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : null;

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("unauthenticated") ||
    lower.includes("invalid api key")
  ) {
    return new GeminiError("AUTH", "The Gemini API key was rejected.", false);
  }
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit")
  ) {
    return new GeminiError("QUOTA", "The Gemini quota is exhausted.", true);
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return new GeminiError("TIMEOUT", "The model took too long to answer.", true);
  }
  if (status === 503 || lower.includes("unavailable") || lower.includes("overloaded")) {
    return new GeminiError("UNKNOWN", "The model is temporarily unavailable.", true);
  }
  if (lower.includes("safety") || lower.includes("blocked")) {
    return new GeminiError("BLOCKED", "The model refused to answer.", false);
  }
  return new GeminiError("UNKNOWN", message.slice(0, 300), false);
}

function readText(response: unknown): string {
  const value = (response as { text?: unknown })?.text;
  if (typeof value === "string") return value;
  if (typeof value === "function") {
    const produced = (value as () => unknown).call(response);
    if (typeof produced === "string") return produced;
  }
  return "";
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Parse the first JSON object in a reply, tolerating prose or code fences around it. */
export function parseJsonReply(raw: string): unknown {
  const text = stripFences(raw);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new GeminiError("BAD_JSON", "The model did not return JSON.");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new GeminiError("BAD_JSON", "The model returned malformed JSON.");
  }
}

export interface JsonRequest<T> {
  label: string;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/**
 * Ask the model for one JSON object and validate it against a Zod schema.
 * Tries each model in the fallback chain, retrying transient failures once.
 */
export async function generateJson<T>(request: JsonRequest<T>): Promise<T> {
  const ai = getClient();
  const models = modelChain();
  const timeoutMs = request.timeoutMs ?? 60_000;
  let lastError: GeminiError | null = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let raw: string;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: request.prompt,
          config: {
            systemInstruction: request.system,
            temperature: request.temperature ?? 0.15,
            maxOutputTokens: request.maxOutputTokens ?? 4096,
            responseMimeType: "application/json",
            abortSignal: AbortSignal.timeout(timeoutMs),
            ...(model.startsWith("gemini-2.5-flash")
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        });
        raw = readText(response);
      } catch (error) {
        const classified = classify(error);
        lastError = classified;
        if (classified.retryable && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        if (classified.code === "NO_KEY" || classified.code === "AUTH") {
          throw classified;
        }
        break;
      }

      if (!raw.trim()) {
        lastError = new GeminiError("EMPTY", "The model returned an empty reply.", true);
        if (attempt === 0) continue;
        break;
      }

      try {
        const parsed = request.schema.safeParse(parseJsonReply(raw));
        if (!parsed.success) {
          lastError = new GeminiError(
            "BAD_JSON",
            `${request.label}: reply did not match the expected shape.`,
            true,
          );
          if (attempt === 0) continue;
          break;
        }
        return parsed.data;
      } catch (error) {
        lastError =
          error instanceof GeminiError
            ? error
            : new GeminiError("BAD_JSON", "The model returned malformed JSON.", true);
        if (attempt === 0) continue;
        break;
      }
    }
  }

  throw lastError ?? new GeminiError("UNKNOWN", "The model call failed.");
}
