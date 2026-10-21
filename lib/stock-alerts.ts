import { and, asc, eq, gt, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { memberships, productStock, products, users, warehouses } from "@/db/schema";
import { sendEmail } from "@/lib/email";

export type StockAlert = "low_stock" | "out_of_stock";

export function detectStockAlert(
  previousStock: number,
  newStock: number,
  minStock: number,
): StockAlert | null {
  if (newStock <= 0 && previousStock > 0) {
    return "out_of_stock";
  }

  if (
    newStock > 0 &&
    minStock > 0 &&
    newStock <= minStock &&
    previousStock > minStock
  ) {
    return "low_stock";
  }

  return null;
}

export async function getStockAlerts(organizationId: string) {
  const active = and(
    eq(products.organizationId, organizationId),
    eq(products.status, "active"),
  );

  const [lowStock, outOfStock] = await Promise.all([
    db
      .select()
      .from(products)
      .where(
        and(
          active,
          gt(products.minStock, 0),
          gt(products.currentStock, 0),
          lte(products.currentStock, products.minStock),
        ),
      )
      .orderBy(asc(products.name)),
    db
      .select()
      .from(products)
      .where(and(active, lte(products.currentStock, 0)))
      .orderBy(asc(products.name)),
  ]);

  return { lowStock, outOfStock };
}

export async function notifyStockAlert(
  organizationId: string,
  alert: StockAlert,
  product: { productId: string; name: string; sku: string; currentStock: number; minStock: number },
) {
  const recipients = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(eq(memberships.organizationId, organizationId), ne(users.email, "")),
    );

  if (recipients.length === 0) return;

  const subject =
    alert === "out_of_stock"
      ? `Out of stock: ${product.name}`
      : `Low stock: ${product.name}`;

  const text =
    alert === "out_of_stock"
      ? `${product.name} (${product.sku}) is now out of stock.`
      : `${product.name} (${product.sku}) is down to ${product.currentStock}, at or below its minimum of ${product.minStock}.`;

  const held = await db
    .select({ warehouse: warehouses.name, quantity: productStock.quantity })
    .from(productStock)
    .innerJoin(warehouses, eq(productStock.warehouseId, warehouses.id))
    .where(and(eq(productStock.productId, product.productId), ne(productStock.quantity, 0)))
    .orderBy(asc(warehouses.name));

  const breakdown =
    held.length > 1
      ? `\n\nBy warehouse:\n${held.map((row) => `- ${row.warehouse}: ${row.quantity}`).join("\n")}`
      : "";

  await sendEmail({
    to: recipients.map((recipient) => recipient.email),
    subject,
    text: `${text}${breakdown}\n\nOpen the Aimify desktop app to restock or review the movement history.`,
  });
}
