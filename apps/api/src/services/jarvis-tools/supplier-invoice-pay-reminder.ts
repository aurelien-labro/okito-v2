import type { Database, JarvisAction } from "@okito/db";
import type { JarvisTool } from "../jarvis-executor.js";
import type { Notifier } from "../notifier.js";
import type { SupplierInvoiceService } from "../supplier-invoice.js";

/**
 * Tool Jarvis "supplier_invoice.pay_reminder" : rappelle AU PATRON qu'une
 * facture fournisseur arrive à échéance (proposé par l'Observer à J-3).
 *
 * Contrairement aux relances clients, le destinataire est interne
 * (tenant.contactEmail) et le texte est déterministe — pas de LLM pour un
 * rappel factuel. Échec explicite si la facture est déjà payée/annulée ou
 * si le tenant n'a pas d'email de contact.
 */
export class SupplierInvoicePayReminderTool implements JarvisTool {
  readonly type = "supplier_invoice.pay_reminder";

  constructor(
    private readonly db: Database,
    private readonly notifier: Notifier,
    private readonly supplierInvoices: SupplierInvoiceService,
  ) {}

  async execute(action: JarvisAction): Promise<Record<string, unknown>> {
    const { supplierInvoiceId } = action.payload as { supplierInvoiceId?: string };
    if (!supplierInvoiceId) throw new Error("payload.supplierInvoiceId manquant");

    const invoice = await this.supplierInvoices.get(action.tenantId, supplierInvoiceId);
    if (invoice.status !== "received" && invoice.status !== "approved") {
      throw new Error(
        `facture ${invoice.supplierName} déjà traitée (${invoice.status}) — rappel inutile`,
      );
    }

    const tenant = await this.db.query.tenants.findFirst({
      where: (t, { eq }) => eq(t.id, action.tenantId),
    });
    if (!tenant) throw new Error("tenant introuvable");
    if (!tenant.contactEmail) throw new Error("tenant sans email de contact — rappel impossible");

    const amount = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: invoice.currency,
    }).format(invoice.amountCents / 100);
    const due = invoice.dueDate
      ? invoice.dueDate.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
      : "bientôt";
    const numberPart = invoice.invoiceNumber ? ` (n° ${invoice.invoiceNumber})` : "";

    const body = `La facture de ${invoice.supplierName}${numberPart} arrive à échéance le ${due}.

Montant : ${amount}${invoice.category ? `\nCatégorie : ${invoice.category}` : ""}

Pense à la régler, ou marque-la payée/contestée dans le dashboard (Admin → Fournisseurs).

— Jarvis`;

    const sent = await this.notifier.send({
      tenantId: action.tenantId,
      channel: "email",
      to: tenant.contactEmail,
      subject: `Échéance fournisseur — ${invoice.supplierName} ${amount}`,
      body,
      context: {
        type: "jarvis.supplier_invoice.pay_reminder",
        supplierInvoiceId,
        actionId: action.id,
      },
    });
    if (!sent.delivered) throw new Error(`envoi échoué : ${sent.error ?? sent.provider}`);

    return { sentTo: tenant.contactEmail, supplier: invoice.supplierName, amount, due };
  }
}
