import { schema } from "@okito/db";
import type { LLMClient } from "@okito/shared/llm";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../../tests/_helpers/pg.js";
import { InvoiceService } from "../invoice.js";
import { JarvisActionService } from "../jarvis-action.js";
import { JarvisExecutor } from "../jarvis-executor.js";
import type { NotificationInput, Notifier } from "../notifier.js";
import { InvoiceRemindTool } from "./invoice-remind.js";

function fakeLLM(text: string | null): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({
      text,
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  };
}

function fakeNotifier(): Notifier & { sent: NotificationInput[] } {
  const sent: NotificationInput[] = [];
  return {
    sent,
    send: async (input) => {
      sent.push(input);
      return { delivered: true, provider: "fake" };
    },
    notifyReservationCreated: async () => {},
    notifyReservationCancelled: async () => {},
  };
}

describe("InvoiceRemindTool", () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let invoices: InvoiceService;
  let actions: JarvisActionService;

  beforeEach(async () => {
    ctx = await createTestDb();
    const [tenant] = await ctx.db
      .insert(schema.tenants)
      .values({ slug: "resto-remind", name: "Chez Marcel" })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");
    tenantId = tenant.id;
    invoices = new InvoiceService(ctx.db);
    actions = new JarvisActionService(ctx.db);
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await ctx.cleanup();
  });

  async function overdueInvoice(email: string | null) {
    const inv = await invoices.create(tenantId, {
      customerName: "Traiteur Lebon",
      customerEmail: email,
      lines: [{ label: "Buffet", quantity: 1, unitPriceCents: 89000 }],
    });
    await invoices.send(tenantId, inv.id, 30);
    await ctx.db
      .update(schema.invoices)
      .set({ status: "overdue", dueDate: new Date(Date.now() - 86_400_000) })
      .where(eq(schema.invoices.id, inv.id));
    return inv;
  }

  it("rédige et envoie la relance, incrémente le compteur, action executed", async () => {
    const inv = await overdueInvoice("compta@lebon.fr");
    const notifier = fakeNotifier();
    const tool = new InvoiceRemindTool(
      ctx.db,
      fakeLLM("Bonjour, nous revenons vers vous concernant la facture."),
      notifier,
      invoices,
    );
    await actions.propose(tenantId, "invoice.remind", `Relancer ${inv.number}`, {
      invoiceId: inv.id,
    });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));

    expect(result).toMatchObject({ executed: 1, failed: 0 });
    expect(notifier.sent[0]).toMatchObject({
      channel: "email",
      to: "compta@lebon.fr",
      subject: `Relance — facture ${inv.number}`,
    });
    const reloaded = await invoices.get(tenantId, inv.id);
    expect(reloaded.remindersSent).toBe(1);
  });

  it("facture non overdue : action failed, pas d'envoi", async () => {
    const inv = await invoices.create(tenantId, {
      customerName: "X",
      customerEmail: "x@x.fr",
      lines: [{ label: "L", quantity: 1, unitPriceCents: 1000 }],
    });
    await invoices.send(tenantId, inv.id);
    const notifier = fakeNotifier();
    const tool = new InvoiceRemindTool(ctx.db, fakeLLM("R"), notifier, invoices);
    await actions.propose(tenantId, "invoice.remind", "Relancer", { invoiceId: inv.id });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));
    expect(result).toMatchObject({ executed: 0, failed: 1 });
    expect(notifier.sent).toHaveLength(0);
  });

  it("client sans email : action failed", async () => {
    const inv = await overdueInvoice(null);
    const notifier = fakeNotifier();
    const tool = new InvoiceRemindTool(ctx.db, fakeLLM("R"), notifier, invoices);
    await actions.propose(tenantId, "invoice.remind", "Relancer", { invoiceId: inv.id });
    const executor = new JarvisExecutor(ctx.db, actions, [tool]);

    const result = await executor.runOnce(new Date(Date.now() + 25 * 3600_000));
    expect(result).toMatchObject({ executed: 0, failed: 1 });
    expect(notifier.sent).toHaveLength(0);
  });
});
