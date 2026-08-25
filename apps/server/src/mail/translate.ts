import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY must be set to translate email templates.");
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

export type TranslateInput = {
  subject: string;
  body: string;
};

const SUBJECT_MARKER = "SUBJECT:";
const BODY_MARKER = "BODY:";

// Cheaper model first, matching the fallback convention used elsewhere
// (shopping-list, mala-terasa) for the same Gemini SDK.
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

/**
 * Translates an email subject+body draft from Slovenian to Croatian, leaving
 * every `{word}` placeholder byte-for-byte untouched — the draft is later
 * rendered by substituting those placeholders, so altering them would break
 * the template. Asks for a fixed `SUBJECT: … / BODY: …` shape rather than
 * JSON, since that's trivial to split reliably for a two-field result.
 */
export async function translateToCroatian(input: TranslateInput): Promise<TranslateInput> {
  const prompt =
    "You translate Slovenian email templates into Croatian for a campsite reservation app.\n" +
    "Rules:\n" +
    "1. Translate all prose naturally into Croatian.\n" +
    "2. Every placeholder of the exact form {word} (curly braces, a single word, no spaces) " +
    "must be preserved byte-for-byte, in the same position relative to the surrounding text — " +
    "never translate, rename, or alter what's inside the braces.\n" +
    "3. Reply with EXACTLY this shape, nothing before or after:\n" +
    "SUBJECT: <translated subject on one line>\n" +
    "BODY:\n<translated body, may span multiple lines>\n\n" +
    `SUBJECT: ${input.subject}\nBODY:\n${input.body}`;

  const genai = getClient();
  let text = "";
  let lastError: unknown = null;

  for (const model of MODEL_CANDIDATES) {
    try {
      const response = await genai.models.generateContent({ model, contents: prompt });
      text = response.text?.trim() ?? "";
      if (text) break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!text) {
    throw lastError instanceof Error ? lastError : new Error("Prevod ni uspel.");
  }

  const bodyIndex = text.indexOf(BODY_MARKER);
  if (!text.startsWith(SUBJECT_MARKER) || bodyIndex === -1) {
    throw new Error("Prevod ni uspel — nepričakovan odgovor.");
  }

  const subject = text.slice(SUBJECT_MARKER.length, bodyIndex).trim();
  const body = text.slice(bodyIndex + BODY_MARKER.length).replace(/^\n/, "").trimEnd();

  return { subject, body };
}
