import type { IRouter } from "express";
import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import {
  db, foodOrdersTable, gymPartnershipsTable, contactMessagesTable,
  enquiryMessagesTable, enquiryReadsTable, type FoodOrder, type EnquiryMessageRow,
} from "@workspace/db";
import {
  GetMemberEnquiryConversationParams, GetMemberEnquiryConversationResponse,
  SendMemberEnquiryMessageBody, SendMemberEnquiryMessageResponse,
  MarkMemberEnquiryReadBody, MarkMemberEnquiryReadResponse,
  GetStaffEnquiryConversationParams, GetStaffEnquiryConversationResponse,
  SendStaffEnquiryMessageBody, SendStaffEnquiryMessageResponse,
  MarkStaffEnquiryReadBody, MarkStaffEnquiryReadResponse,
} from "@workspace/api-zod";

type Kind = "order" | "partnership" | "contact";
type Audience = "member" | "staff";
type Pair = { kind: Kind; id: number };
type Origin = Pair & {
  ownerId: string | null; status: string; reference: string; subject: string;
  detail: string; submittedAt: string;
};
export const enquiryKey = (kind: string, id: number) => `${kind}:${id}`;

function orderOrigin(e: FoodOrder): Origin {
  return {
    kind: "order", id: e.id, ownerId: e.ownerId, status: e.status,
    reference: `NTR-${String(e.id).padStart(5, "0")}`,
    subject: `${e.pickupLocation} • ${e.pickupTime}`,
    detail: `${e.items.map(i => `${i.quantity} × ${i.foodSlug}`).join("\n")}${e.note ? `\n${e.note}` : ""}`,
    submittedAt: e.createdAt.toISOString(),
  };
}
function partnershipOrigin(e: typeof gymPartnershipsTable.$inferSelect): Origin {
  return {
    kind: "partnership", id: e.id, ownerId: e.ownerId, status: e.status,
    reference: `PARTNER-${String(e.id).padStart(5, "0")}`, subject: e.gymName,
    detail: `${e.location}\n${e.memberCount} members • Cafeteria: ${e.hasCafeteria ? "yes" : "no"}\nInterests: ${e.interests.join(", ")}`,
    submittedAt: e.createdAt.toISOString(),
  };
}
function contactOrigin(e: typeof contactMessagesTable.$inferSelect): Origin {
  return {
    kind: "contact", id: e.id, ownerId: e.ownerId, status: e.status,
    reference: `CONTACT-${String(e.id).padStart(5, "0")}`,
    subject: e.subject, detail: e.message, submittedAt: e.createdAt.toISOString(),
  };
}
function memberOverview(e: Origin) {
  // Explicit public fields: no owner IDs, contact details or internal staff notes.
  return { id: e.reference, kind: e.kind, enquiryId: e.id, subject: e.subject, detail: e.detail, status: e.status, submittedAt: e.submittedAt };
}

export async function unreadCounts(pairs: Pair[], readerId: string, audience: Audience) {
  const counts = new Map<string, number>();
  if (!pairs.length) return counts;
  const match = or(...pairs.map(p => and(eq(enquiryMessagesTable.kind, p.kind), eq(enquiryMessagesTable.enquiryId, p.id))));
  const rows = await db.select({
    kind: enquiryMessagesTable.kind, id: enquiryMessagesTable.enquiryId,
    unread: sql<number>`count(*)::integer`,
  }).from(enquiryMessagesTable).leftJoin(enquiryReadsTable, and(
    eq(enquiryReadsTable.kind, enquiryMessagesTable.kind),
    eq(enquiryReadsTable.enquiryId, enquiryMessagesTable.enquiryId),
    eq(enquiryReadsTable.readerId, readerId),
  )).where(and(
    match,
    eq(enquiryMessagesTable.authorRole, audience === "member" ? "staff" : "member"),
    gt(enquiryMessagesTable.id, sql<number>`coalesce(${enquiryReadsTable.lastReadMessageId}, 0)`),
  )).groupBy(enquiryMessagesTable.kind, enquiryMessagesTable.enquiryId);
  for (const row of rows) counts.set(enquiryKey(row.kind, row.id), Number(row.unread));
  return counts;
}

export async function memberEnquiries(ownerId: string) {
  const [orders, partnerships, contacts] = await Promise.all([
    db.select().from(foodOrdersTable).where(eq(foodOrdersTable.ownerId, ownerId)),
    db.select().from(gymPartnershipsTable).where(eq(gymPartnershipsTable.ownerId, ownerId)),
    db.select().from(contactMessagesTable).where(eq(contactMessagesTable.ownerId, ownerId)),
  ]);
  const list = [
    ...orders.map(e => ({ ...memberOverview(orderOrigin(e)), totalInRupees: e.totalInRupees,
      itemCount: e.items.reduce((sum, item) => sum + item.quantity, 0),
      pickupLocation: e.pickupLocation, pickupTime: e.pickupTime, items: e.items })),
    ...partnerships.map(e => memberOverview(partnershipOrigin(e))),
    ...contacts.map(e => memberOverview(contactOrigin(e))),
  ];
  const counts = await unreadCounts(list.map(e => ({ kind: e.kind, id: e.enquiryId })), ownerId, "member");
  return list.map(e => ({ ...e, unreadCount: counts.get(enquiryKey(e.kind, e.enquiryId)) ?? 0 }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

async function findEnquiry(kind: Kind, id: number): Promise<Origin | undefined> {
  if (kind === "order") {
    const [e] = await db.select().from(foodOrdersTable).where(eq(foodOrdersTable.id, id));
    return e && orderOrigin(e);
  }
  if (kind === "partnership") {
    const [e] = await db.select().from(gymPartnershipsTable).where(eq(gymPartnershipsTable.id, id));
    return e && partnershipOrigin(e);
  }
  const [e] = await db.select().from(contactMessagesTable).where(eq(contactMessagesTable.id, id));
  return e && contactOrigin(e);
}
function serializeMessage(e: EnquiryMessageRow) {
  return { id: e.id, authorRole: e.authorRole, body: e.body, createdAt: e.createdAt.toISOString() };
}

// Registered after each router's existing authentication/role middleware.
export function registerConversationRoutes(router: IRouter, audience: Audience) {
  const prefix = audience === "member" ? "/member" : "/admin";
  const schemas = audience === "member" ? {
    params: GetMemberEnquiryConversationParams, conversation: GetMemberEnquiryConversationResponse,
    messageInput: SendMemberEnquiryMessageBody, message: SendMemberEnquiryMessageResponse,
    readInput: MarkMemberEnquiryReadBody, read: MarkMemberEnquiryReadResponse,
  } : {
    params: GetStaffEnquiryConversationParams, conversation: GetStaffEnquiryConversationResponse,
    messageInput: SendStaffEnquiryMessageBody, message: SendStaffEnquiryMessageResponse,
    readInput: MarkStaffEnquiryReadBody, read: MarkStaffEnquiryReadResponse,
  };
  router.use(`${prefix}/enquiries/:kind/:id/conversation`, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get(`${prefix}/enquiries/:kind/:id/conversation`, async (req, res): Promise<void> => {
    const params = schemas.params.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid enquiry identifier." }); return; }
    const actorId: string = audience === "member" ? res.locals.ownerId : res.locals.staffId;
    const origin = await findEnquiry(params.data.kind, params.data.id);
    if (!origin || (audience === "member" && origin.ownerId !== actorId)) {
      res.status(404).json({ error: "Enquiry not found." }); return;
    }
    const messages = await db.select().from(enquiryMessagesTable).where(and(
      eq(enquiryMessagesTable.kind, origin.kind), eq(enquiryMessagesTable.enquiryId, origin.id),
    )).orderBy(asc(enquiryMessagesTable.id));
    const counts = await unreadCounts([origin], actorId, audience);
    res.json(schemas.conversation.parse({
      kind: origin.kind, enquiryId: origin.id, reference: origin.reference, subject: origin.subject,
      detail: origin.detail, status: origin.status, memberCanReply: !!origin.ownerId,
      messages: messages.map(serializeMessage), latestMessageId: messages.at(-1)?.id ?? 0,
      unreadCount: counts.get(enquiryKey(origin.kind, origin.id)) ?? 0,
    }));
  });
  router.post(`${prefix}/enquiries/:kind/:id/conversation`, async (req, res): Promise<void> => {
    const params = schemas.params.safeParse(req.params);
    const body = schemas.messageInput.safeParse({
      ...req.body, body: typeof req.body?.body === "string" ? req.body.body.trim() : req.body?.body,
    });
    if (!params.success || !body.success) { res.status(400).json({ error: "Write a reply between 1 and 3,000 characters." }); return; }
    const actorId: string = audience === "member" ? res.locals.ownerId : res.locals.staffId;
    const origin = await findEnquiry(params.data.kind, params.data.id);
    if (!origin || (audience === "member" && origin.ownerId !== actorId)) {
      res.status(404).json({ error: "Enquiry not found." }); return;
    }
    if (!origin.ownerId) { res.status(409).json({ error: "This guest enquiry is not linked to a member. Use the supplied contact details instead." }); return; }
    const [saved] = await db.insert(enquiryMessagesTable).values({
      kind: origin.kind, enquiryId: origin.id, authorId: actorId, authorRole: audience,
      body: body.data.body, clientMessageId: body.data.clientMessageId,
    }).onConflictDoNothing().returning();
    const message = saved ?? (await db.select().from(enquiryMessagesTable).where(and(
      eq(enquiryMessagesTable.authorId, actorId), eq(enquiryMessagesTable.clientMessageId, body.data.clientMessageId),
    )))[0];
    if (!message || message.kind !== origin.kind || message.enquiryId !== origin.id || message.body !== body.data.body) {
      res.status(409).json({ error: "This reply retry identifier was used for another message. Please start a new reply." }); return;
    }
    res.status(201).json(schemas.message.parse(serializeMessage(message)));
  });
  router.post(`${prefix}/enquiries/:kind/:id/read`, async (req, res): Promise<void> => {
    const params = schemas.params.safeParse(req.params);
    const body = schemas.readInput.safeParse(req.body);
    if (!params.success || !body.success) { res.status(400).json({ error: "Invalid read marker." }); return; }
    const actorId: string = audience === "member" ? res.locals.ownerId : res.locals.staffId;
    const origin = await findEnquiry(params.data.kind, params.data.id);
    if (!origin || (audience === "member" && origin.ownerId !== actorId)) {
      res.status(404).json({ error: "Enquiry not found." }); return;
    }
    const lastSeen = body.data.lastSeenMessageId;
    if (lastSeen > 0) {
      const [message] = await db.select({ id: enquiryMessagesTable.id }).from(enquiryMessagesTable).where(and(
        eq(enquiryMessagesTable.id, lastSeen), eq(enquiryMessagesTable.kind, origin.kind),
        eq(enquiryMessagesTable.enquiryId, origin.id),
      ));
      if (!message) { res.status(400).json({ error: "That message is not in this conversation." }); return; }
    }
    const [read] = await db.insert(enquiryReadsTable).values({
      kind: origin.kind, enquiryId: origin.id, readerId: actorId, lastReadMessageId: lastSeen,
    }).onConflictDoUpdate({
      target: [enquiryReadsTable.kind, enquiryReadsTable.enquiryId, enquiryReadsTable.readerId],
      set: { lastReadMessageId: sql`greatest(${enquiryReadsTable.lastReadMessageId}, ${lastSeen})` },
    }).returning();
    res.json(schemas.read.parse({ lastReadMessageId: read.lastReadMessageId }));
  });
}
