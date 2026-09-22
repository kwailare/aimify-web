import { verifyApiToken } from "@/lib/api-auth";
import { getOrgContextForUser } from "@/lib/org";

export async function getApiOrgContext(request: Request) {
  const userId = await verifyApiToken(request);

  if (!userId) {
    return null;
  }

  const context = await getOrgContextForUser(userId);

  if (!context?.membership) {
    return null;
  }

  return {
    userId,
    organizationId: context.membership.organization.id,
    role: context.membership.role,
  };
}
