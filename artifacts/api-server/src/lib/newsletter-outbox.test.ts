import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { db, newsletterSignupsTable as signups, pool } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import router from "../routes/newsletter";
import { sendWelcomeNewsletter } from "./newsletter-notifications";
import { sentMail } from "./test-support/newsletter-connectors";

test("real API and database: new, duplicate, invalid, bot and historical welcome behaviour", async () => {
  const app = express();
  app.use(express.json(), router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/newsletter/signups`;
  const email = `newsletter-qa-${randomUUID()}@example.invalid`;
  const historical = `newsletter-history-${randomUUID()}@example.invalid`;
  const post = (body: object) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const welcomeCount = () => sentMail.filter(m => Buffer.from(m.raw, "base64url").toString("utf8").includes("Message-ID: <welcome.")).length;
  try {
    assert.equal((await post({ email, consent: false })).status, 400);
    assert.equal((await post({ email: "bad", consent: true })).status, 400);
    assert.equal((await post({ email, consent: true, website: "bot" })).status, 200);
    assert.equal((await db.select().from(signups).where(eq(signups.email, email))).length, 0);
    const response = await post({ email: ` ${email.toUpperCase()} `, consent: true, website: "" });
    assert.equal(response.status, 200);
    const [saved] = await db.select().from(signups).where(eq(signups.email, email));
    assert.ok(saved);
    // A competing short row lock may defer the second channel; explicitly drain it here.
    await sendWelcomeNewsletter(saved.id);
    const [delivered] = await db.select().from(signups).where(eq(signups.id, saved.id));
    assert.equal(delivered.welcomeStatus, "sent");
    assert.ok(delivered.welcomeGmailMessageId?.startsWith("fake-"));
    assert.equal(welcomeCount(), 1);
    assert.equal((await post({ email, consent: true })).status, 200);
    await Promise.all([sendWelcomeNewsletter(saved.id), sendWelcomeNewsletter(saved.id)]);
    assert.equal(welcomeCount(), 1);
    const [old] = await db.insert(signups).values({ email: historical, notificationStatus: "sent" }).returning();
    await sendWelcomeNewsletter(old.id);
    const [unchanged] = await db.select().from(signups).where(eq(signups.id, old.id));
    assert.equal(unchanged.welcomeStatus, "inactive");
    assert.equal(welcomeCount(), 1);
  } finally {
    await db.delete(signups).where(inArray(signups.email, [email, historical]));
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await pool.end();
  }
});
