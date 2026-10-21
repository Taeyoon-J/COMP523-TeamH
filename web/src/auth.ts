import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Sign-in with Google (I-5). Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET from env.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
});

/** NFR-6: only emails listed in ADMIN_EMAILS may modify assignments or run syncs. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/**
 * Local development only: AUTH_DEV_ADMIN="you@unc.edu" acts as that admin without signing in,
 * until Google sign-in is set up. Ignored in production builds.
 */
export function devAdmin(): string | null {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_ADMIN ? process.env.AUTH_DEV_ADMIN : null;
}

/** Returns the signed-in admin's email, or null if the caller is not an admin. */
export async function requireAdmin(): Promise<string | null> {
  const dev = devAdmin();
  if (dev) return dev;
  const session = await auth();
  const email = session?.user?.email;
  return isAdmin(email) ? email! : null;
}
