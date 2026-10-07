import { Router } from "express";
import { CreateNewsletterSignupBody } from "@workspace/api-zod";
import { db, newsletterSignupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { articles } from "../lib/articles";
import { notifyNewsletterSignup } from "../lib/newsletter-notifications";

const router = Router();
const success = { message: "Thanks! Your interest in Nutrio updates has been recorded." };
const recent = new Map<string, { count: number; until: number }>();

router.get("/articles", (_req, res) => res.json(articles));
router.get("/articles/:slug", (req, res) => {
  const article = articles.find((item) => item.slug === req.params.slug);
  if (!article) return res.status(404).json({ error: "Article not found" });
  return res.json(article);
});
router.post("/newsletter/signups", async (req, res) => {
  const body = CreateNewsletterSignupBody.safeParse({
    ...req.body,
    email: typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : req.body?.email,
  });
  if (!body.success) return res.status(400).json({ error: "Enter a valid email and agree to receive Nutrio updates." });
  // A bot trap returns an indistinguishable response without persisting or sending.
  if (body.data.website) return res.json(success);
  const [existing] = await db.select({ id: newsletterSignupsTable.id }).from(newsletterSignupsTable)
    .where(eq(newsletterSignupsTable.email, body.data.email)).limit(1);
  if (existing) return res.json(success);

  const now = Date.now();
  for (const [key, value] of recent) if (value.until < now) recent.delete(key);
  // Use server-observed peer, not arbitrary forwarded headers. Behind a shared
  // proxy this is intentionally conservative, protecting the owner's mailbox.
  const key = req.ip ?? "unknown";
  const limit = recent.get(key) ?? { count: 0, until: now + 600_000 };
  if (limit.count >= 10) {
    res.set("Retry-After", String(Math.ceil((limit.until - now) / 1000)));
    return res.status(429).json({ error: "Too many signups. Please try again in a few minutes." });
  }
  limit.count += 1;
  recent.set(key, limit);
  try {
    const [created] = await db.insert(newsletterSignupsTable).values({ email: body.data.email })
      .onConflictDoNothing({ target: newsletterSignupsTable.email }).returning({ id: newsletterSignupsTable.id });
    if (created) {
      // Save first. Email failure never discards a signup or falsely reports delivery.
      try { await notifyNewsletterSignup(created.id); }
      catch { req.log.warn({ signupId: created.id }, "Newsletter notification will be reconciled by worker"); }
    }
    return res.json(success);
  } catch {
    return res.status(503).json({ error: "We could not save your signup. Please try again shortly." });
  }
});

export default router;
