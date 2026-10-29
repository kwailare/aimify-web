import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { type ApiOrgContext, guardApi } from "@/lib/api-context";
import { logAudit } from "@/lib/audit";
import { deleteOwnedBlob, isBlobConfigured } from "@/lib/blob";
import { getExpense } from "@/lib/expenses";
import { sniffImageKind } from "@/lib/images";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const TYPES = {
  png: { contentType: "image/png", extension: "png" },
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  webp: { contentType: "image/webp", extension: "webp" },
  pdf: { contentType: "application/pdf", extension: "pdf" },
} as const;

const notFound = () => NextResponse.json({ error: "Expense not found." }, { status: 404 });

// Who may change the receipt: anyone with expenses.edit, or whoever
// recorded the expense (they attach it right after recording).
async function load(context: ApiOrgContext, id: string) {
  if (!isUuid(id)) return { response: notFound() };
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, context.organizationId)))
    .limit(1);
  if (!row) return { response: notFound() };
  const mayEdit =
    context.permissions.has("expenses.edit") ||
    (context.permissions.has("expenses.create") && row.createdBy === context.userId);
  if (!mayEdit) {
    return {
      response: NextResponse.json(
        { error: "Your role can't change this expense.", code: "forbidden_role", permission: "expenses.edit" },
        { status: 403 },
      ),
    };
  }
  if (row.status === "voided") {
    return {
      response: NextResponse.json({ error: "A voided expense can't be changed.", code: "expense_voided" }, { status: 409 }),
    };
  }
  return { row };
}

// Attaches the receipt: a photo (PNG, JPEG, WebP) or a PDF, 5 MB at most,
// sent as multipart/form-data in a field named "file". Replaces any earlier
// one.
export async function POST(request: Request, { params }: Params) {
  const context = await guardApi(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const found = await load(context, id);
  if (found.response) return found.response;
  const row = found.row!;

  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Uploads aren't available right now.", code: "storage_unavailable" },
      { status: 503 },
    );
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The receipt must be 5 MB or smaller." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Send the receipt as multipart/form-data in a field named file." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "The receipt must be 5 MB or smaller." }, { status: 413 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = buffer.subarray(0, 5).toString("latin1") === "%PDF-" ? "pdf" : sniffImageKind(buffer);
  if (!kind) {
    return NextResponse.json({ error: "Use a photo (PNG, JPEG or WebP) or a PDF." }, { status: 400 });
  }
  const type = TYPES[kind];
  const folder = `expenses/${context.organizationId}/`;
  const blob = await put(`${folder}${row.reference}.${type.extension}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: type.contentType,
  });

  const name = (file.name || `${row.reference}.${type.extension}`).slice(0, 200);
  await db
    .update(expenses)
    .set({ attachmentUrl: blob.url, attachmentName: name, attachmentType: type.contentType, updatedBy: context.userId, updatedAt: new Date() })
    .where(eq(expenses.id, id));
  await deleteOwnedBlob(row.attachmentUrl, folder);

  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.attachment",
    recordId: id,
    newValue: { reference: row.reference, attachment: name },
  });
  return NextResponse.json({ expense: await getExpense(context.organizationId, id) });
}

export async function DELETE(request: Request, { params }: Params) {
  const context = await guardApi(request);
  if (context instanceof NextResponse) return context;
  const { id } = await params;
  const found = await load(context, id);
  if (found.response) return found.response;
  const row = found.row!;
  await db
    .update(expenses)
    .set({ attachmentUrl: null, attachmentName: null, attachmentType: null, updatedBy: context.userId, updatedAt: new Date() })
    .where(eq(expenses.id, id));
  await deleteOwnedBlob(row.attachmentUrl, `expenses/${context.organizationId}/`);
  await logAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    module: "expense",
    action: "expense.attachment",
    recordId: id,
    newValue: { reference: row.reference, attachment: null },
  });
  return NextResponse.json({ expense: await getExpense(context.organizationId, id) });
}
