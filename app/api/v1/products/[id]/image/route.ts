import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { deleteOwnedBlob, isBlobConfigured, uploadImage } from "@/lib/blob";
import { MAX_IMAGE_BYTES } from "@/lib/image-limits";
import { readImageFile } from "@/lib/images";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const NOT_FOUND = () =>
  NextResponse.json({ error: "Product not found." }, { status: 404 });

async function findProduct(organizationId: string, id: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.organizationId, organizationId)))
    .limit(1);

  return product ?? null;
}

export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request, "products.write");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const product = await findProduct(context.organizationId, id);

  if (!product) return NOT_FOUND();

  if (!isBlobConfigured()) {
    return NextResponse.json(
      {
        error: "Image uploads aren't available right now.",
        code: "storage_unavailable",
      },
      { status: 503 },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);

  if (declaredLength > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json(
      { error: "The image must be 2 MB or smaller." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);

  if (!form) {
    return NextResponse.json(
      { error: "Send the image as multipart/form-data in a field named image." },
      { status: 400 },
    );
  }

  const image = await readImageFile(form.get("image"));

  if (!image.ok) {
    return NextResponse.json({ error: image.error }, { status: 400 });
  }

  const folder = `products/${context.organizationId}/`;

  let imageUrl: string;

  try {
    imageUrl = await uploadImage(`${folder}${id}`, image);
  } catch (error) {
    console.error("Product image upload failed:", error);
    return NextResponse.json(
      { error: "The upload failed. Please try again." },
      { status: 502 },
    );
  }

  let updated;

  try {
    [updated] = await db
      .update(products)
      .set({ imageUrl, updatedAt: new Date() })
      .where(
        and(eq(products.id, id), eq(products.organizationId, context.organizationId)),
      )
      .returning();
  } catch (error) {
    await deleteOwnedBlob(imageUrl, folder);
    throw error;
  }

  if (!updated) {
    await deleteOwnedBlob(imageUrl, folder);
    return NOT_FOUND();
  }

  await deleteOwnedBlob(product.imageUrl, folder);

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "product",
    action: "product.image_updated",
    recordId: id,
    previousValue: { imageUrl: product.imageUrl },
    newValue: { imageUrl },
  });

  return NextResponse.json({ product: updated });
}

export async function DELETE(request: Request, { params }: Params) {
  const context = await guardApi(request, "products.write");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const product = await findProduct(context.organizationId, id);

  if (!product) return NOT_FOUND();

  if (!product.imageUrl) {
    return NextResponse.json({ product });
  }

  const [updated] = await db
    .update(products)
    .set({ imageUrl: null, updatedAt: new Date() })
    .where(
      and(eq(products.id, id), eq(products.organizationId, context.organizationId)),
    )
    .returning();

  await deleteOwnedBlob(product.imageUrl, `products/${context.organizationId}/`);

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "product",
    action: "product.image_removed",
    recordId: id,
    previousValue: { imageUrl: product.imageUrl },
    newValue: { imageUrl: null },
  });

  return NextResponse.json({ product: updated });
}
