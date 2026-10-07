import { db, challengeMembersTable as members, challengeCheckinsTable as checkins } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { GetChallengesResponse, GetMemberChallengesResponse } from "@workspace/api-zod";

export const challengeDefinitions = [
  { slug: "colourful-plate", title: "A colourful plate", durationDays: 21,
    description: "Build a small daily habit of including a vegetable or fruit you enjoy.",
    dailyAction: "Include a vegetable or fruit in one of your meals today.",
    safetyNote: "Choose foods suitable for your dietary needs and allergies. This is not a prescribed diet." },
  { slug: "mindful-meal", title: "One mindful meal", durationDays: 21,
    description: "Make room for an unhurried meal without food rules or guilt.",
    dailyAction: "Eat one meal or snack without scrolling, paying attention to comfort and enjoyment.",
    safetyNote: "Do not skip meals or restrict food to complete this challenge. Adapt it to your routine." },
  { slug: "move-your-way", title: "Move your way", durationDays: 21,
    description: "Choose a little movement that suits your ability, rather than competing on intensity.",
    dailyAction: "If appropriate for you, spend a few minutes on comfortable movement such as a walk or gentle seated mobility.",
    safetyNote: "Follow your clinician's restrictions. Stop if you feel pain or unwell. Rest is valid; this is not a fitness prescription." },
];
export function indiaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function challengeProgress(member: typeof members.$inferSelect, checkedDates: string[], today = indiaDate()) {
  const definition = challengeDefinitions.find((item) => item.slug === member.challengeSlug)!;
  const endDate = addDays(member.startDate, definition.durationDays - 1);
  const dates = [...new Set(checkedDates)].filter((day) => day >= member.startDate && day <= endDate).sort();
  const todayDone = dates.includes(today);
  let cursor = todayDone ? today : addDays(today, -1);
  let streak = 0;
  const checked = new Set(dates);
  while (checked.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const elapsed = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${member.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  const progress = {
    challengeSlug: member.challengeSlug, isActive: member.isActive,
    startDate: member.startDate, endDate, checkedDates: dates, completedDays: dates.length, streak,
    todayDone, canCheckIn: member.isActive && today >= member.startDate && today <= endDate,
    dayNumber: Math.max(1, Math.min(definition.durationDays, elapsed)),
    isFinished: today > endDate || dates.length === definition.durationDays,
  };
  // Generated Zod coerces OpenAPI date fields into Date objects. Validate without
  // returning the transformed value: this wire contract requires YYYY-MM-DD.
  GetMemberChallengesResponse.element.parse(progress);
  return progress;
}
export async function communityChallenges() {
  // Only aggregates leave the server. Never expose identities or individual calendars.
  const counts = await db.select({
    slug: members.challengeSlug,
    participants: sql<number>`count(distinct ${members.id})::int`,
    checks: sql<number>`count(${checkins.memberId})::int`,
  }).from(members).leftJoin(checkins, eq(checkins.memberId, members.id)).groupBy(members.challengeSlug);
  return GetChallengesResponse.parse(challengeDefinitions.map((challenge) => {
    const count = counts.find((row) => row.slug === challenge.slug);
    return { ...challenge, participantCount: count?.participants ?? 0, checkinCount: count?.checks ?? 0 };
  }));
}
export async function ownChallengeProgress(ownerId: string) {
  const rows = await db.select({ member: members, day: checkins.day }).from(members)
    .leftJoin(checkins, eq(checkins.memberId, members.id)).where(eq(members.ownerId, ownerId));
  const grouped = new Map<number, { member: typeof members.$inferSelect; days: string[] }>();
  for (const row of rows) {
    const item = grouped.get(row.member.id) ?? { member: row.member, days: [] };
    if (row.day) item.days.push(row.day);
    grouped.set(row.member.id, item);
  }
  return [...grouped.values()].map(({ member, days }) => challengeProgress(member, days));
}
export async function changeMembership(ownerId: string, slug: string, joined: boolean) {
  const [existing] = await db.select().from(members).where(and(eq(members.ownerId, ownerId), eq(members.challengeSlug, slug)));
  if (!existing && !joined) return null;
  if (joined && existing && indiaDate() > addDays(existing.startDate, 20)) {
    return { expired: true as const };
  }
  await db.insert(members).values({ ownerId, challengeSlug: slug, startDate: indiaDate(), isActive: joined })
    .onConflictDoUpdate({ target: [members.ownerId, members.challengeSlug], set: { isActive: joined } });
  return (await ownChallengeProgress(ownerId)).find((row) => row.challengeSlug === slug)!;
}
export async function changeCheckin(ownerId: string, slug: string, completed: boolean) {
  return db.transaction(async (tx) => {
    const [member] = await tx.select().from(members).where(and(eq(members.ownerId, ownerId), eq(members.challengeSlug, slug))).for("update");
    if (!member) return null;
    const today = indiaDate();
    if (!member.isActive || today < member.startDate || today > addDays(member.startDate, 20)) {
      return { unavailable: true as const };
    }
    if (completed) await tx.insert(checkins).values({ memberId: member.id, day: today }).onConflictDoNothing();
    else await tx.delete(checkins).where(and(eq(checkins.memberId, member.id), eq(checkins.day, today)));
    const days = await tx.select({ day: checkins.day }).from(checkins).where(eq(checkins.memberId, member.id));
    return challengeProgress(member, days.map((row) => row.day), today);
  });
}
