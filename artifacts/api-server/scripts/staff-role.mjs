import { clerkClient } from "@clerk/express";

// Trusted workspace-only operation. No public HTTP role-management endpoint.
const [userId, role] = process.argv.slice(2);
if (!/^user_[A-Za-z0-9]+$/.test(userId ?? "") || !["admin", "staff", "member"].includes(role)) {
  throw new Error("Usage: node artifacts/api-server/scripts/staff-role.mjs user_ID admin|staff|member");
}
const user = await clerkClient.users.getUser(userId);
await clerkClient.users.updateUserMetadata(userId, {
  publicMetadata: { ...user.publicMetadata, role },
});
process.stdout.write(`Account role updated to ${role}. Applies only to the current Clerk environment.\n`);
