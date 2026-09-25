import { deleteOption } from "@/lib/catalog-routes";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return deleteOption(request, "category", id);
}
