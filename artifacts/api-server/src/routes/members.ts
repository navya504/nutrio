import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq } from "drizzle-orm";
import { db, memberProfilesTable, memberFavouritesTable, memberPlansTable, foodOrdersTable } from "@workspace/db";
import {
  GetMemberProfileResponse, SaveMemberProfileBody, SaveMemberProfileResponse,
  GetMemberFavouritesResponse, SetMemberFavouriteBody, SetMemberFavouriteResponse,
  GetMemberPlansResponse, CreateMemberPlanBody, CreateMemberPlanResponse,
  UpdateMemberPlanBody, UpdateMemberPlanParams, UpdateMemberPlanResponse,
  DeleteMemberPlanParams, GetMemberEnquiriesResponse,
  GetMemberCatalogueResponse,
} from "@workspace/api-zod";
import { catalogueItem, serializePlan } from "../lib/meal-plans";
import { nutritionCatalogue } from "../lib/catalogue-store";
import { memberEnquiries, registerConversationRoutes } from "../lib/enquiry-conversations";

const router: IRouter = Router();
router.use("/member", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in to access your Nutrio account." }); return; }
  res.locals.ownerId = userId;
  next();
});

router.get("/member/profile", async (_req, res): Promise<void> => {
  const [profile] = await db.insert(memberProfilesTable).values({ ownerId: res.locals.ownerId })
    .onConflictDoNothing().returning();
  const existing = profile ?? (await db.select().from(memberProfilesTable).where(eq(memberProfilesTable.ownerId, res.locals.ownerId)))[0];
  res.json(GetMemberProfileResponse.parse(existing));
});
router.get("/member/catalogue", async (_req, res): Promise<void> => {
  res.json(GetMemberCatalogueResponse.parse(await nutritionCatalogue()));
});
router.put("/member/profile", async (req, res): Promise<void> => {
  const parsed = SaveMemberProfileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please check your profile and goals." }); return; }
  const [profile] = await db.insert(memberProfilesTable).values({ ...parsed.data, ownerId: res.locals.ownerId })
    .onConflictDoUpdate({ target: memberProfilesTable.ownerId, set: parsed.data }).returning();
  res.json(SaveMemberProfileResponse.parse(profile));
});

async function favourites(ownerId: string) {
  return db.select({ kind: memberFavouritesTable.kind, slug: memberFavouritesTable.slug })
    .from(memberFavouritesTable).where(eq(memberFavouritesTable.ownerId, ownerId));
}
router.get("/member/favourites", async (_req, res): Promise<void> => {
  res.json(GetMemberFavouritesResponse.parse(await favourites(res.locals.ownerId)));
});
router.put("/member/favourites", async (req, res): Promise<void> => {
  const parsed = SetMemberFavouriteBody.safeParse(req.body);
  if (!parsed.success || !catalogueItem(parsed.data, await nutritionCatalogue())) { res.status(400).json({ error: "Please select an existing food or recipe." }); return; }
  const { kind, slug, saved } = parsed.data;
  const ownerId: string = res.locals.ownerId;
  if (saved) {
    await db.insert(memberFavouritesTable).values({ ownerId, kind, slug }).onConflictDoNothing();
  } else {
    await db.delete(memberFavouritesTable).where(and(eq(memberFavouritesTable.ownerId, ownerId), eq(memberFavouritesTable.kind, kind), eq(memberFavouritesTable.slug, slug)));
  }
  res.json(SetMemberFavouriteResponse.parse(await favourites(ownerId)));
});
router.get("/member/plans", async (_req, res): Promise<void> => {
  const plans = await db.select().from(memberPlansTable).where(eq(memberPlansTable.ownerId, res.locals.ownerId)).orderBy(desc(memberPlansTable.updatedAt));
  const catalogue = await nutritionCatalogue();
  res.json(GetMemberPlansResponse.parse(plans.map((plan) => serializePlan(plan, catalogue))));
});
router.post("/member/plans", async (req, res): Promise<void> => {
  const parsed = CreateMemberPlanBody.safeParse(req.body);
  const catalogue = await nutritionCatalogue();
  if (!parsed.success || parsed.data.entries.some((entry) => entry.day >= parsed.data.days || !catalogueItem(entry, catalogue))) {
    res.status(400).json({ error: "Check plan days, foods, recipes and serving sizes." }); return;
  }
  const [plan] = await db.insert(memberPlansTable).values({ ...parsed.data, ownerId: res.locals.ownerId }).returning();
  res.status(201).json(CreateMemberPlanResponse.parse(serializePlan(plan, catalogue)));
});
router.put("/member/plans/:id", async (req, res): Promise<void> => {
  const params = UpdateMemberPlanParams.safeParse(req.params);
  const parsed = UpdateMemberPlanBody.safeParse(req.body);
  const catalogue = await nutritionCatalogue();
  if (!params.success || !parsed.success || parsed.data.entries.some((entry) => entry.day >= parsed.data.days || !catalogueItem(entry, catalogue))) {
    res.status(400).json({ error: "Check plan days, foods, recipes and serving sizes." }); return;
  }
  const [plan] = await db.update(memberPlansTable).set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(memberPlansTable.id, params.data.id), eq(memberPlansTable.ownerId, res.locals.ownerId))).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
  res.json(UpdateMemberPlanResponse.parse(serializePlan(plan, catalogue)));
});
router.delete("/member/plans/:id", async (req, res): Promise<void> => {
  const params = DeleteMemberPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid plan identifier." }); return; }
  const [plan] = await db.delete(memberPlansTable).where(and(eq(memberPlansTable.id, params.data.id), eq(memberPlansTable.ownerId, res.locals.ownerId))).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
  res.status(204).end();
});
router.get("/member/enquiries", async (_req, res): Promise<void> => {
  res.json(GetMemberEnquiriesResponse.parse(await memberEnquiries(res.locals.ownerId)));
});
registerConversationRoutes(router, "member");
export default router;
