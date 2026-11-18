import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deleteBlobFolder } from "@/lib/blob";
import { seedDefaultUnits } from "@/lib/catalog";
import { seedDefaultCustomerTypes } from "@/lib/customer-types";
import { seedDefaultExpenseCategories } from "@/lib/expenses";

// The Aimify team's heavy actions on an account. Each runs as one database
// function (migration 0039), so it happens completely or not at all.

export class AccountRemovalError extends Error {}

const MESSAGES: Record<string, string> = {
  sole_owner:
    "This person is the only Owner of their organization. Delete the organization instead, or make someone else Owner first.",
  user_not_found: "User not found.",
  organization_not_found: "Organization not found.",
};

async function run<T>(query: ReturnType<typeof sql>): Promise<T> {
  try {
    const result = await db.execute(query);
    return (result.rows[0] as { result: T }).result;
  } catch (error) {
    // The database's message is on the error drizzle wraps it in.
    const message = [error, (error as { cause?: unknown })?.cause]
      .map((e) => (e instanceof Error ? e.message : ""))
      .join(" ");
    const code = Object.keys(MESSAGES).find((key) => message.includes(key));
    if (code) throw new AccountRemovalError(MESSAGES[code]);
    throw error;
  }
}

// Files a business uploaded, kept in Blob storage under its id.
const DATA_FOLDERS = ["products", "expenses"];

/** Wipes a business's data and gives it the starting lists a new one gets. */
export async function resetOrganizationData(organizationId: string) {
  const removed = await run<number>(
    sql`select aimify_reset_organization_data(${organizationId}::uuid) as result`,
  );
  await seedDefaultUnits(organizationId);
  await seedDefaultCustomerTypes(organizationId);
  await seedDefaultExpenseCategories(organizationId);
  return removed;
}

/** Removes the files a reset or deletion left behind (best effort). */
export async function deleteOrganizationFiles(organizationId: string, withLogo: boolean) {
  for (const folder of withLogo ? [...DATA_FOLDERS, "logos"] : DATA_FOLDERS) {
    await deleteBlobFolder(`${folder}/${organizationId}/`);
  }
}

/** Deletes an organization for good; returns how many people went with it. */
export async function deleteOrganization(organizationId: string) {
  return run<number>(sql`select aimify_delete_organization(${organizationId}::uuid) as result`);
}

/** Deletes a person for good (refused while they're a sole Owner). */
export async function deleteUser(userId: string) {
  await run<null>(sql`select aimify_delete_user(${userId}::uuid) as result`);
}
