import { archiveParty, getParty, updateParty } from "@/lib/party-routes";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  return getParty(request, "customer", (await params).id);
}

export async function PATCH(request: Request, { params }: Params) {
  return updateParty(request, "customer", (await params).id);
}

export async function DELETE(request: Request, { params }: Params) {
  return archiveParty(request, "customer", (await params).id);
}
