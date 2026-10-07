type GmailFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function welcomeContent() {
  return [
    "Welcome to Nutrio",
    "Eat Smart. Live Better.",
    "",
    "Thanks for joining. Here are a few practical ways to make your next meal easier.",
    "",
    "BUILD A SIMPLE LUNCH BOX",
    "Start with a protein food you enjoy, such as dal, chickpeas, eggs, tofu or paneer. Add a carbohydrate such as rice or roti, then vegetables or fruit. Choose portions that suit your routine instead of chasing a perfect meal.",
    "",
    "MAKE BREAKFAST EASIER",
    "For a low-prep option, combine oats, plain yogurt or a suitable alternative, and fruit. Prepare it in a clean covered container, refrigerate promptly and keep it chilled. Check labels and ingredients for your allergies.",
    "",
    "EAT AROUND YOUR WORKOUT",
    "For ordinary adult activity, a familiar meal with protein, carbohydrate and vegetables is often a practical choice. Avoid treating one snack or supplement as essential for results. Medical conditions and individualized targets need qualified advice.",
    "",
    "TRY A SMALL HABIT",
    "Pick one meal today and include a fruit or vegetable you enjoy. Nutrio's 'A colourful plate' challenge is an optional way to track that habit.",
    "",
    "READ MORE IN NUTRIO'S ARTICLES SECTION",
    "Build a lunch box that survives a busy day — practical meal components and storage habits.",
    "What to eat around an evening workout — flexible food choices before and after activity.",
    "Five protein-rich staples under ₹60 — illustrative budget ideas; compare actual portions, prices and labels.",
    "",
    "You can also explore the recipes, save favourites and build a meal plan in Nutrio.",
    "",
    "Nutrition information is general education, not medical advice. Food values and availability on the site may be demonstration estimates. Consult a qualified clinician or dietitian for condition-specific needs.",
    "",
    "WHY YOU RECEIVED THIS",
    "This is a one-time welcome email requested through Nutrio's signup form. No recurring newsletter campaign is enabled. If you did not sign up, you can ignore this message; entering this address again will not trigger another welcome email.",
  ].join("\r\n");
}

export function buildNewsletterRaw(input: {
  sender: string; recipient: string; messageId: string; subject: string; text: string; date: Date;
}) {
  // Addresses must be single, unambiguous header values, even for persisted data.
  const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  if (!address.test(input.sender) || !address.test(input.recipient) ||
      /[\r\n]/.test(input.subject) || !/^[a-zA-Z0-9.@-]+$/.test(input.messageId)) {
    throw new Error("Invalid newsletter email headers");
  }
  // Gmail may replace our RFC Message-ID. Keep a searchable reference in the body too.
  const body = Buffer.from(`${input.text}\r\n\r\nNutrio delivery reference: ${input.messageId}`, "utf8")
    .toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  return Buffer.from([
    `From: Nutrio <${input.sender}>`, `To: ${input.recipient}`,
    `Subject: ${input.subject}`, `Message-ID: <${input.messageId}>`,
    `Date: ${input.date.toUTCString()}`, "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64",
    "", body,
  ].join("\r\n"), "utf8").toString("base64url");
}

// Check Sent before sending. An ambiguous acknowledgement must never cause a blind resend.
export async function deliverNewsletterEmail(input: {
  gmailFetch: GmailFetch; messageId: string; recipient: string; subject: string; text: string;
  date: Date; uncertain: boolean; beforeSend: () => Promise<boolean>;
  markSendStarted: (started: boolean) => void;
}): Promise<string | null> {
  const query = new URLSearchParams({ q: `in:sent rfc822msgid:${input.messageId}`, maxResults: "1" });
  const found = await input.gmailFetch(`/gmail/v1/users/me/messages?${query}`, { signal: AbortSignal.timeout(10_000) });
  if (!found.ok) throw new Error(`Gmail lookup rejected (${found.status})`);
  const existing = await found.json() as { messages?: { id: string }[] };
  if (existing.messages?.[0]?.id) return existing.messages[0].id;
  const bodyQuery = new URLSearchParams({
    q: `in:sent "${input.messageId}"`, maxResults: "1",
  });
  const byReference = await input.gmailFetch(`/gmail/v1/users/me/messages?${bodyQuery}`, { signal: AbortSignal.timeout(10_000) });
  if (!byReference.ok) throw new Error(`Gmail delivery-reference lookup rejected (${byReference.status})`);
  const match = await byReference.json() as { messages?: { id: string }[] };
  if (match.messages?.[0]?.id) return match.messages[0].id;
  if (input.uncertain) throw new Error("Acknowledgement uncertain; checking Sent mail only, not resending");
  const profile = await input.gmailFetch("/gmail/v1/users/me/profile", { signal: AbortSignal.timeout(10_000) });
  if (!profile.ok) throw new Error(`Gmail sender lookup rejected (${profile.status})`);
  const sender = await profile.json() as { emailAddress?: string };
  const raw = buildNewsletterRaw({ ...input, sender: sender.emailAddress ?? "" });
  if (!await input.beforeSend()) return null;
  input.markSendStarted(true);
  const sent = await input.gmailFetch("/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!sent.ok) {
    if (sent.status >= 400 && sent.status < 500) input.markSendStarted(false);
    throw new Error(`Gmail send rejected (${sent.status})`);
  }
  const result = await sent.json() as { id?: string };
  if (!result.id) throw new Error("Gmail send returned no acknowledgement");
  return result.id;
}
