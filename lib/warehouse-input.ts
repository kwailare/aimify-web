export type WarehouseFields = {
  name?: string;
  address?: string | null;
  managerName?: string | null;
  phone?: string | null;
  status?: string;
};

export function parseWarehouseFields(
  body: unknown,
): { data: WarehouseFields } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "A JSON body is required." };
  }

  const input = body as Record<string, unknown>;
  const data: WarehouseFields = {};

  if ("name" in input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return { error: "name must be a non-empty string." };
    }
    if (input.name.trim().length > 120) {
      return { error: "name must be at most 120 characters." };
    }
    data.name = input.name.trim();
  }

  for (const key of ["address", "managerName", "phone"] as const) {
    if (!(key in input)) continue;

    const value = input[key];

    if (value === null) {
      data[key] = null;
    } else if (typeof value === "string" && value.length <= 300) {
      data[key] = value.trim() || null;
    } else {
      return {
        error: `${key} must be a string of at most 300 characters or null.`,
      };
    }
  }

  if ("status" in input) {
    if (input.status !== "active" && input.status !== "inactive") {
      return { error: "status must be active or inactive." };
    }
    data.status = input.status;
  }

  return { data };
}
