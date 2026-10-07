import { Router } from "express";
import { getAuth } from "@clerk/express";
import { SendAssistantMessageBody, SetChallengeCheckinBody, SetChallengeMembershipBody } from "@workspace/api-zod";
import { assistantHistory, clearAssistantHistory, EngagementError, sendAssistantQuestion } from "../lib/assistant";
import { challengeDefinitions, changeCheckin, changeMembership, communityChallenges, ownChallengeProgress } from "../lib/challenges";

const router = Router();
router.get("/challenges", async (_req, res) => res.json(await communityChallenges()));
router.use(["/openai/assistant", "/member/challenges"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: "Sign in to use your assistant and track challenges." });
  res.locals.ownerId = userId;
  return next();
});
router.get("/openai/assistant", async (_req, res) => res.json(await assistantHistory(res.locals.ownerId)));
router.post("/openai/assistant/messages", async (req, res) => {
  const body = SendAssistantMessageBody.safeParse({
    ...req.body, text: typeof req.body?.text === "string" ? req.body.text.trim() : req.body?.text,
  });
  if (!body.success) return res.status(400).json({ error: "Enter a question of 1–2,000 characters and a valid retry identifier." });
  try { return res.json(await sendAssistantQuestion(res.locals.ownerId, body.data)); }
  catch (error) {
    if (error instanceof EngagementError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
router.delete("/openai/assistant", async (_req, res) => {
  try { await clearAssistantHistory(res.locals.ownerId); return res.sendStatus(204); }
  catch (error) {
    if (error instanceof EngagementError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});
router.get("/member/challenges", async (_req, res) => res.json(await ownChallengeProgress(res.locals.ownerId)));
router.put("/member/challenges/:slug/membership", async (req, res) => {
  if (!challengeDefinitions.some((item) => item.slug === req.params.slug)) return res.status(404).json({ error: "Challenge not found" });
  const body = SetChallengeMembershipBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Choose whether to join or leave." });
  const progress = await changeMembership(res.locals.ownerId, req.params.slug, body.data.joined);
  if (!progress) return res.status(404).json({ error: "You have not joined this challenge." });
  if ("expired" in progress) return res.status(409).json({ error: "Your original 21-day window has ended. Choose another challenge." });
  return res.json(progress);
});
router.put("/member/challenges/:slug/check-in", async (req, res) => {
  if (!challengeDefinitions.some((item) => item.slug === req.params.slug)) return res.status(404).json({ error: "Challenge not found" });
  const body = SetChallengeCheckinBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Choose whether today's action is completed." });
  const progress = await changeCheckin(res.locals.ownerId, req.params.slug, body.data.completed);
  if (!progress) return res.status(404).json({ error: "Join the challenge first." });
  if ("unavailable" in progress) return res.status(409).json({ error: "Daily check-ins require an active challenge within its original 21-day window." });
  return res.json(progress);
});
export default router;
