export const ACCESS_COOKIE = "proofholder_at";
export const REFRESH_COOKIE = "proofholder_rt";
export const CSRF_COOKIE = "proofholder_csrf";
export const CSRF_HEADER = "x-csrf-token";

export const ACCESS_TTL_MIN = Number(process.env.AUTH_ACCESS_TTL_MIN || 15);
export const REFRESH_TTL_DAYS = Number(process.env.AUTH_REFRESH_TTL_DAYS || 30);

export const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;
export const COOKIE_SECURE =
  (process.env.AUTH_COOKIE_SECURE || "false").toLowerCase() === "true";

export function cookieBase(
  overrides: Partial<import("express").CookieOptions> = {}
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: COOKIE_SECURE,
    domain: COOKIE_DOMAIN,
    path: "/",
    ...overrides,
  };
}
