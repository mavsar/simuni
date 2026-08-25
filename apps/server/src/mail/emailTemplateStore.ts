import { sqlite } from "../db/client.js";
import type { EmailTemplateDefinition, EmailTemplateType } from "./templates.js";

type EmailTemplateRow = {
  type: string;
  subject: string;
  body: string;
  recipient: string;
  bcc: string;
  updated_at: string;
};

const selectTemplate = sqlite.prepare(`SELECT * FROM email_templates WHERE type = ?`);
const upsertTemplate = sqlite.prepare(`
  INSERT INTO email_templates (type, subject, body, recipient, bcc, updated_at)
  VALUES (@type, @subject, @body, @recipient, @bcc, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT (type) DO UPDATE SET
    subject = excluded.subject,
    body = excluded.body,
    recipient = excluded.recipient,
    bcc = excluded.bcc,
    updated_at = excluded.updated_at
`);
const deleteTemplate = sqlite.prepare(`DELETE FROM email_templates WHERE type = ?`);

export type EffectiveTemplate = {
  subject: string;
  body: string;
  recipient: string;
  /** Extra admin-configured BCC addresses, comma-separated; '' if none. */
  bcc: string;
  isCustomized: boolean;
  updatedAt: string | null;
};

/** The template actually used to send: the admin's saved override, or the built-in default. */
export function getEffectiveTemplate(def: EmailTemplateDefinition): EffectiveTemplate {
  const row = selectTemplate.get(def.type) as EmailTemplateRow | undefined;
  if (row) {
    return {
      subject: row.subject,
      body: row.body,
      recipient: row.recipient,
      bcc: row.bcc,
      isCustomized: true,
      updatedAt: row.updated_at
    };
  }
  return {
    subject: def.defaultSubject,
    body: def.defaultBody,
    recipient: def.defaultRecipient ?? "",
    bcc: "",
    isCustomized: false,
    updatedAt: null
  };
}

export function saveTemplate(
  type: EmailTemplateType,
  subject: string,
  body: string,
  recipient: string,
  bcc: string
): void {
  upsertTemplate.run({ type, subject, body, recipient, bcc });
}

export function resetTemplate(type: EmailTemplateType): void {
  deleteTemplate.run(type);
}
