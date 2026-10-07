import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, catalogueTable, foodOrdersTable, gymPartnershipsTable, contactMessagesTable } from "@workspace/db";
import {
  GetStaffAccessResponse, GetStaffCatalogueResponse, CreateStaffListingBody,
  UpdateStaffListingBody, UpdateStaffListingParams, GetStaffEnquiriesResponse,
  UpdateStaffEnquiryBody, UpdateStaffEnquiryParams, UpdateStaffEnquiryResponse,
} from "@workspace/api-zod";
import { catalogueRows, staffListing } from "../lib/catalogue-store";
import { enquiryKey, unreadCounts, registerConversationRoutes } from "../lib/enquiry-conversations";

const router: IRouter = Router();
// Live server-side public metadata, not client claims or submitted roles.
// No first-user bootstrap or automatic promotion of ordinary members.
router.use("/admin", async (req, res, next): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in to access staff tools." }); return; }
  const user = await clerkClient.users.getUser(userId);
  const role = user.publicMetadata.role;
  if (role !== "admin" && role !== "staff") {
    res.status(403).json({ error: "This account does not have staff access." }); return;
  }
  res.locals.staffId = userId;
  res.locals.role = role;
  next();
});
router.get("/admin/access", (_req, res): void => {
  res.json(GetStaffAccessResponse.parse({ role: res.locals.role }));
});
router.get("/admin/catalogue", async (_req, res): Promise<void> => {
  res.json(GetStaffCatalogueResponse.parse((await catalogueRows()).map(staffListing)));
});

export function validateListing(input: unknown) {
  const parsed = CreateStaffListingBody.safeParse(input);
  if (!parsed.success) return { error: "Check all listing fields and numeric values." } as const;
  const value = parsed.data;
  const content = value[value.kind];
  if (!content || ["food", "recipe", "gym"].filter((kind) => value[kind as "food" | "recipe" | "gym"] !== undefined).length !== 1) {
    return { error: "Provide exactly one matching listing type." } as const;
  }
  if (("slug" in content ? content.slug : content.id) !== value.key) {
    return { error: "The listing identifier must match its key." } as const;
  }
  if (value.verified && (!value.operatorSupplied || value.verificationNote.trim().length < 10)) {
    return { error: "Verification needs operator-supplied details and a verification note of at least 10 characters." } as const;
  }
  if (value.kind === "gym" && value.available && value.operatorSupplied && !value.verified) {
    return { error: "Verify the operator-supplied gym before making it available." } as const;
  }
  for (const [key, field] of Object.entries(content)) {
    if (typeof field === "number" && (!Number.isFinite(field) || field < 0 || field > 1000000)) {
      return { error: `${key} must be a non-negative value no larger than 1000000.` } as const;
    }
    if (typeof field === "string" && key !== "imageUrl" && key !== "youtubeVideoId" && !field.trim()) {
      return { error: `${key} cannot be blank.` } as const;
    }
    if (typeof field === "string" && field.length > 5000) return { error: `${key} is too long.` } as const;
    if (Array.isArray(field) && (field.length > 100 || field.some((item) =>
      typeof item === "string"
        ? !item.trim() || item.length > 2000
        : !item.name?.trim() || !item.quantity?.trim(),
    ))) return { error: `${key} must contain at most 100 complete, non-blank entries.` } as const;
  }
  if ("imageUrl" in content && content.imageUrl && !/^https:\/\/|^\//.test(content.imageUrl)) {
    return { error: "Image URLs must use HTTPS or a local path." } as const;
  }
  const { demonstration: _demo, available: _available, ...data } = content as typeof content & { demonstration?: boolean; available?: boolean };
  return { value: {
    kind: value.kind, key: value.key, data,
    available: value.available, operatorSupplied: value.operatorSupplied,
    verified: value.verified, verificationNote: value.verificationNote.trim(),
  } } as const;
}

router.post("/admin/catalogue", async (req, res): Promise<void> => {
  const result = validateListing(req.body);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  // New entries are always operator supplied; demonstration provenance cannot be fabricated.
  if (!result.value.operatorSupplied) { res.status(400).json({ error: "New listings must contain operator-supplied details." }); return; }
  const [row] = await db.insert(catalogueTable).values({ ...result.value, updatedBy: res.locals.staffId })
    .onConflictDoNothing().returning();
  if (!row) { res.status(409).json({ error: "That identifier already exists. Edit the existing listing." }); return; }
  res.status(201).json(staffListing(row));
});
router.put("/admin/catalogue/:kind/:key", async (req, res): Promise<void> => {
  const params = UpdateStaffListingParams.safeParse(req.params);
  const body = UpdateStaffListingBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid listing details." }); return; }
  const result = validateListing(body.data);
  if ("error" in result) { res.status(400).json({ error: result.error }); return; }
  if (params.data.kind !== result.value.kind || params.data.key !== result.value.key) {
    res.status(400).json({ error: "Identifiers cannot be changed. Create a replacement and disable the old listing." }); return;
  }
  const [row] = await db.update(catalogueTable).set({ ...result.value, updatedBy: res.locals.staffId, updatedAt: new Date() })
    .where(and(eq(catalogueTable.kind, params.data.kind), eq(catalogueTable.key, params.data.key))).returning();
  if (!row) { res.status(404).json({ error: "Listing not found." }); return; }
  res.json(staffListing(row));
});

async function enquiries(readerId: string) {
  const [orders, partnerships, messages] = await Promise.all([
    db.select().from(foodOrdersTable).orderBy(desc(foodOrdersTable.createdAt)),
    db.select().from(gymPartnershipsTable).orderBy(desc(gymPartnershipsTable.createdAt)),
    db.select().from(contactMessagesTable).orderBy(desc(contactMessagesTable.createdAt)),
  ]);
  const counts = await unreadCounts([
    ...orders.map(e => ({ kind: "order" as const, id: e.id })),
    ...partnerships.map(e => ({ kind: "partnership" as const, id: e.id })),
    ...messages.map(e => ({ kind: "contact" as const, id: e.id })),
  ], readerId, "staff");
  return GetStaffEnquiriesResponse.parse([
    ...orders.map((e) => ({
      ...e, kind: "order", reference: `NTR-${String(e.id).padStart(5, "0")}`,
      name: e.customerName, email: e.email ?? "", subject: `${e.pickupLocation} • ${e.pickupTime}`,
      detail: `Estimated ₹${e.totalInRupees}\n${e.items.map((i) => `${i.quantity} × ${i.foodSlug}`).join("\n")}\n${e.note ?? ""}`,
      createdAt: e.createdAt.toISOString(),
      memberCanReply: !!e.ownerId, unreadCount: counts.get(enquiryKey("order", e.id)) ?? 0,
    })),
    ...partnerships.map((e) => ({
      ...e, kind: "partnership", reference: `PARTNER-${String(e.id).padStart(5, "0")}`,
      name: e.managerName, subject: e.gymName,
      detail: `${e.location}\n${e.memberCount} members • Cafeteria: ${e.hasCafeteria ? "yes" : "no"}\nInterests: ${e.interests.join(", ")}`,
      createdAt: e.createdAt.toISOString(),
      memberCanReply: !!e.ownerId, unreadCount: counts.get(enquiryKey("partnership", e.id)) ?? 0,
    })),
    ...messages.map((e) => ({
      ...e, kind: "contact", reference: `CONTACT-${String(e.id).padStart(5, "0")}`,
      phone: e.phone ?? "", detail: e.message, createdAt: e.createdAt.toISOString(),
      memberCanReply: !!e.ownerId, unreadCount: counts.get(enquiryKey("contact", e.id)) ?? 0,
    })),
  ]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
router.get("/admin/enquiries", async (_req, res): Promise<void> => {
  res.json(await enquiries(res.locals.staffId));
});
router.patch("/admin/enquiries/:kind/:id", async (req, res): Promise<void> => {
  const params = UpdateStaffEnquiryParams.safeParse(req.params);
  const body = UpdateStaffEnquiryBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid enquiry status or note." }); return; }
  const { kind, id } = params.data;
  if (kind !== "order" && ["confirmed", "fulfilled"].includes(body.data.status)) {
    res.status(400).json({ error: "Confirmation and fulfilment apply only to order enquiries." }); return;
  }
  const table = kind === "order" ? foodOrdersTable : kind === "partnership" ? gymPartnershipsTable : contactMessagesTable;
  const [row] = await db.update(table).set(body.data).where(eq(table.id, id)).returning({ id: table.id });
  if (!row) { res.status(404).json({ error: "Enquiry not found." }); return; }
  res.json(UpdateStaffEnquiryResponse.parse((await enquiries(res.locals.staffId)).find((e) => e.kind === kind && e.id === id)));
});
registerConversationRoutes(router, "staff");
export default router;
