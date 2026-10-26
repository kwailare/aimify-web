import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { getSale } from "@/lib/sales";
import { isUuid } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: "Sale not found." }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const context = await guardApi(request, "sales.view");

  if (context instanceof NextResponse) return context;

  const { id } = await params;

  if (!isUuid(id)) return NOT_FOUND();

  const sale = await getSale(context.organizationId, id);

  return sale ? NextResponse.json({ sale }) : NOT_FOUND();
}
