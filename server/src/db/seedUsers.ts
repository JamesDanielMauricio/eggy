import "dotenv/config";
import { db, client } from "./index.js";
import { users } from "./schema.js";
import { hashPassword } from "../lib/auth.js";

// Credentials never live in this file — they're read from SEED_USERS in
// .env (gitignored) so this script can be committed with zero secrets in it.
// Re-running is safe: existing usernames are skipped rather than erroring
// or overwriting an already-set password.

type SeedUser = { username: string; password: string };

function loadSeedUsers(): SeedUser[] {
  const raw = process.env.SEED_USERS;
  if (!raw) {
    throw new Error("SEED_USERS is not set in .env — expected a JSON array of {username, password}.");
  }
  return JSON.parse(raw);
}

async function main() {
  const seedUsers = loadSeedUsers();
  let created = 0;

  for (const { username, password } of seedUsers) {
    const passwordHash = await hashPassword(password);
    const [row] = await db
      .insert(users)
      .values({ username, passwordHash })
      .onConflictDoNothing({ target: users.username })
      .returning({ id: users.id });
    if (row) created++;
  }

  console.log(`Created ${created} of ${seedUsers.length} user(s) (existing usernames were skipped).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
