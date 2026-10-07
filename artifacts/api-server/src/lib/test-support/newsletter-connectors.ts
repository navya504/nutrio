// Only selected by the newsletter integration-test esbuild alias. No real mail is sent.
export const sentMail: { id: string; raw: string }[] = [];
export class ReplitConnectors {
  createProxyFetch() {
    return async (path: string, init?: RequestInit) => {
      if (path.includes("/messages?")) {
        const query = new URLSearchParams(path.split("?")[1]).get("q") ?? "";
        const id = query.split("rfc822msgid:")[1] ?? query.match(/"([^"]+)"/)?.[1];
        const found = sentMail.find(m => {
          const mime = Buffer.from(m.raw, "base64url").toString("utf8");
          if (query.includes("rfc822msgid:")) return mime.includes(`Message-ID: <${id}>`);
          return Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString("utf8").includes(`Nutrio delivery reference: ${id}`);
        });
        return Response.json(found ? { messages: [{ id: found.id }] } : {});
      }
      if (path.endsWith("/profile")) return Response.json({ emailAddress: "sender@example.invalid" });
      if (path.endsWith("/messages/send")) {
        const record = { id: `fake-${sentMail.length + 1}`, raw: JSON.parse(String(init?.body)).raw };
        sentMail.push(record);
        return Response.json({ id: record.id });
      }
      throw new Error("Unexpected fake Gmail endpoint");
    };
  }
}
