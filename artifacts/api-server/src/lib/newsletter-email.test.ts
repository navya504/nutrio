import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNewsletterRaw, deliverNewsletterEmail, welcomeContent } from "./newsletter-email";

const headers = {
  sender: "owner@example.com", recipient: "subscriber@example.com",
  messageId: "welcome.00000000-0000-0000-0000-000000000000@nutrio.local",
  subject: "Welcome to Nutrio - Eat Smart. Live Better.", text: welcomeContent(),
  date: new Date("2026-10-07T12:00:00Z"),
};
test("welcome is real useful content, not a placeholder or a delivery promise", () => {
  const content = welcomeContent();
  for (const expected of ["BUILD A SIMPLE LUNCH BOX", "MAKE BREAKFAST EASIER",
    "EAT AROUND YOUR WORKOUT", "Five protein-rich staples", "not medical advice", "one-time"]) {
    assert.ok(content.includes(expected));
  }
  assert.ok(!/lorem ipsum|dummy content|TODO|https?:\/\/localhost/i.test(content));
});
test("MIME preserves UTF-8 content and targets only the subscriber", () => {
  const mime = Buffer.from(buildNewsletterRaw(headers), "base64url").toString("utf8");
  assert.ok(mime.includes("To: subscriber@example.com\r\n"));
  const body = mime.split("\r\n\r\n")[1];
  assert.equal(Buffer.from(body, "base64").toString("utf8"),
    `${welcomeContent()}\r\n\r\nNutrio delivery reference: ${headers.messageId}`);
});
test("rejects unsafe header values before sending", () => {
  for (const recipient of ["evil@example.com\r\nBcc: someone@example.com", "a@example.com,b@example.com", "bad"]) {
    assert.throws(() => buildNewsletterRaw({ ...headers, recipient }));
  }
  assert.throws(() => buildNewsletterRaw({ ...headers, subject: "hello\r\nBcc: someone@example.com" }));
});

function fixture(options: { existing?: boolean; uncertain?: boolean; rejection?: number; lost?: boolean; ownLease?: boolean } = {}) {
  const paths: string[] = [];
  const started: boolean[] = [];
  const input = {
    ...headers, uncertain: Boolean(options.uncertain),
    beforeSend: async () => options.ownLease !== false,
    markSendStarted: (value: boolean) => { started.push(value); },
    gmailFetch: async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (path.includes("/messages?")) return Response.json(options.existing ? { messages: [{ id: "existing-id" }] } : {});
      if (path.endsWith("/profile")) return Response.json({ emailAddress: headers.sender });
      assert.equal(init?.method, "POST");
      const raw = JSON.parse(String(init?.body)).raw;
      assert.ok(Buffer.from(raw, "base64url").toString("utf8").includes(`To: ${headers.recipient}`));
      if (options.lost) throw new Error("Lost send acknowledgement");
      return Response.json(options.rejection ? {} : { id: "sent-id" }, { status: options.rejection ?? 200 });
    },
  };
  return { input, paths, started };
}
test("sends a new welcome and returns the acknowledged message ID", async () => {
  const f = fixture();
  assert.equal(await deliverNewsletterEmail(f.input), "sent-id");
  assert.equal(f.paths.filter(p => p.endsWith("/messages/send")).length, 1);
  assert.deepEqual(f.started, [true]);
});
test("a previously sent stable Message-ID is reconciled without another send", async () => {
  const f = fixture({ existing: true, uncertain: true });
  assert.equal(await deliverNewsletterEmail(f.input), "existing-id");
  assert.equal(f.paths.length, 1);
});
test("an uncertain send is never blindly retried", async () => {
  const f = fixture({ uncertain: true });
  await assert.rejects(() => deliverNewsletterEmail(f.input), /not resending/);
  assert.equal(f.paths.length, 2);
});
test("rewritten Gmail Message-ID can be reconciled by the body reference without sending", async () => {
  const f = fixture({ uncertain: true });
  f.input.gmailFetch = async (path: string) => {
    f.paths.push(path);
    return Response.json(path.includes("rfc822msgid") ? {} : { messages: [{ id: "gmail-rewritten-id" }] });
  };
  assert.equal(await deliverNewsletterEmail(f.input), "gmail-rewritten-id");
  assert.equal(f.paths.length, 2);
  assert.deepEqual(f.started, []);
});
test("lost acknowledgement remains ambiguous; explicit rejection may be safely retried", async () => {
  const lost = fixture({ lost: true });
  await assert.rejects(() => deliverNewsletterEmail(lost.input));
  assert.deepEqual(lost.started, [true]);
  const rejected = fixture({ rejection: 403 });
  await assert.rejects(() => deliverNewsletterEmail(rejected.input));
  assert.deepEqual(rejected.started, [true, false]);
  const server = fixture({ rejection: 502 });
  await assert.rejects(() => deliverNewsletterEmail(server.input));
  assert.deepEqual(server.started, [true]);
});
test("a lost database lease cannot send an email", async () => {
  const f = fixture({ ownLease: false });
  assert.equal(await deliverNewsletterEmail(f.input), null);
  assert.ok(!f.paths.some(p => p.endsWith("/messages/send")));
  assert.deepEqual(f.started, []);
});
