export const PRODUCT_STATUSES = ["active", "inactive", "archived"] as const;

export type ProductFields = {
  sku?: string;
  name?: string;
  barcode?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  unit?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  minStock?: number;
  maxStock?: number | null;
  status?: string;
};

type ParseResult = { data: ProductFields } | { error: string };

const OPTIONAL_TEXT = ["barcode", "description", "brand", "category"] as const;

export function parseProductFields(body: unknown): ParseResult {
  if (!body || typeof body !== "object") {
    return { error: "A JSON body is required." };
  }

  const input = body as Record<string, unknown>;
  const data: ProductFields = {};

  if ("sku" in input) {
    if (typeof input.sku !== "string" || !input.sku.trim()) {
      return { error: "sku must be a non-empty string." };
    }
    if (input.sku.trim().length > 64) {
      return { error: "sku must be at most 64 characters." };
    }
    data.sku = input.sku.trim();
  }

  if ("name" in input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return { error: "name must be a non-empty string." };
    }
    if (input.name.trim().length > 200) {
      return { error: "name must be at most 200 characters." };
    }
    data.name = input.name.trim();
  }

  for (const key of OPTIONAL_TEXT) {
    if (!(key in input)) continue;

    const value = input[key];

    if (value === null) {
      data[key] = null;
    } else if (typeof value === "string") {
      if (value.length > 500) {
        return { error: `${key} must be at most 500 characters.` };
      }
      data[key] = value.trim() || null;
    } else {
      return { error: `${key} must be a string or null.` };
    }
  }

  if ("unit" in input) {
    if (typeof input.unit !== "string" || !input.unit.trim()) {
      return { error: "unit must be a non-empty string." };
    }
    if (input.unit.trim().length > 60) {
      return { error: "unit must be at most 60 characters." };
    }
    data.unit = input.unit.trim();
  }

  for (const key of ["purchasePrice", "sellingPrice"] as const) {
    if (!(key in input)) continue;

    const value = input[key];

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return { error: `${key} must be a non-negative number.` };
    }
    data[key] = value;
  }

  if ("minStock" in input) {
    if (!Number.isInteger(input.minStock) || (input.minStock as number) < 0) {
      return { error: "minStock must be a non-negative whole number." };
    }
    data.minStock = input.minStock as number;
  }

  if ("maxStock" in input) {
    if (input.maxStock === null) {
      data.maxStock = null;
    } else if (
      !Number.isInteger(input.maxStock) ||
      (input.maxStock as number) < 0
    ) {
      return { error: "maxStock must be a non-negative whole number or null." };
    } else {
      data.maxStock = input.maxStock as number;
    }
  }

  if ("status" in input) {
    if (
      typeof input.status !== "string" ||
      !(PRODUCT_STATUSES as readonly string[]).includes(input.status)
    ) {
      return {
        error: `status must be one of: ${PRODUCT_STATUSES.join(", ")}.`,
      };
    }
    data.status = input.status;
  }

  return { data };
}

export function checkStockBounds(minStock: number, maxStock: number | null) {
  if (maxStock !== null && maxStock < minStock) {
    return "maxStock can't be lower than minStock.";
  }
  return null;
}
