import { timingSafeEqual } from "node:crypto";

/** Returns true if the Authorization header carries the expected bearer token (constant-time compare). */
export function isAuthorized(authHeader: string | null, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
