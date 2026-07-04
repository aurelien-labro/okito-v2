import type { Database, JarvisAction } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import type { InvoiceService } from "../invoice.js";
import type { JarvisTool } from "../jarvis-executor.js";
import type { Notifier } from "../notifier.js";

const SYSTEM_PROMPT = `Tu écris un email de relance pour une facture impayée, de la part d'un commerce à son client.

Règles :
- Français, vouvoiement, ton courtois et professionnel. 70 mots maximum.
- Rappelle le numéro et le montant, demande le règlement sans agressivité.
- Reste factuel : pas de menace, pas de pénalité chiffrée inventée.
- Ne signe pas, n'ajoute pas d'objet — juste le corps de l'email.`;

/**
 * Tool Jarvis "invoice.remind" : rédige et envoie une relance d'impayé.
 *
 * Payload (posé par l'Observer) : { invoiceId }. Charge la facture, vérifie
 * qu'elle est bien overdue et que le client a un email, fait rédiger la
 * relance par le LLM, l'envoie, puis incrémente le compteur de relances.
 * Échec explicite (action failed) à chaque étape manquante.
 */
export class InvoiceRemindTool implements JarvisTool {
  readonly type = "invoice.remind";

  constructor(
    private readonly db: Database,
    private readonly llm: LLMClient,
    private readonly notifier: Notifier,
    private readonly invoices: InvoiceService,
  ) {}

  async execute(action: JarvisAction): Promise<Record<string, unknown>> {
    const { invoiceId } = action.payload as { invoiceId?: string };
    if (!invoiceId) throw new Error("payload.invoiceId manquant");

    const invoice = await this.invoices.get(action.tenantId, invoiceId);
    if (invoice.status !== "overdue") {
      throw new Error(`facture ${invoice.number} non overdue (${invoice.status})`);
    }
    if (!invoice.customerEmail) throw new Error("client sans email — relance manuelle requise");

    const tenant = await this.db.query.tenants.findFirst({
      where: (t, { eq }) => eq(t.id, action.tenantId),
    });
    if (!tenant) throw new Error("tenant introuvable");

    const amount = `${(invoice.amountCents / 100).toFixed(2)} ${invoice.currency}`;
    const response = await this.llm.complete({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Commerce : ${tenant.name}. Client : ${invoice.customerName}.
Facture ${invoice.number}, montant ${amount}${
            invoice.dueDate ? `, échéance ${invoice.dueDate.toISOString().slice(0, 10)}` : ""
          }. Relance n°${invoice.remindersSent + 1}.`,
        },
      ],
      temperature: 0.3,
      maxOutputTokens: 300,
    });
    const text = response.text?.trim();
    if (!text) throw new Error("le LLM n'a pas produit de relance");

    const sent = await this.notifier.send({
      tenantId: action.tenantId,
      channel: "email",
      to: invoice.customerEmail,
      subject: `Relance — facture ${invoice.number}`,
      body: `${text}\n\n— ${tenant.name}`,
      context: { type: "jarvis.invoice.remind", invoiceId, actionId: action.id },
    });
    if (!sent.delivered) throw new Error(`envoi échoué : ${sent.error ?? sent.provider}`);

    await this.invoices.recordReminder(action.tenantId, invoiceId);
    return { sentTo: invoice.customerEmail, invoice: invoice.number, amount };
  }
}
