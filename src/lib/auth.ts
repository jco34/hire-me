import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

/**
 * The auth seam.
 *
 * v1 is single-user and local, so this resolves to one seeded row. Every query and
 * every server action goes through `currentUser()` and scopes by the id it returns,
 * which means adding real auth later is replacing the body of this function rather
 * than touching the data layer.
 *
 * Do not read `users` directly anywhere else.
 */

/** Stable id for the single local user. Seeded by `npm run db:seed`. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function currentUser(): Promise<User> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, LOCAL_USER_ID))
    .limit(1);

  if (!user) {
    throw new Error(
      "No local user found. Run `npm run db:seed` to create it.",
    );
  }

  return user;
}

export async function currentUserId(): Promise<string> {
  return (await currentUser()).id;
}
