import { createParty, listParties } from "@/lib/party-routes";

export async function GET(request: Request) {
  return listParties(request, "supplier");
}

export async function POST(request: Request) {
  return createParty(request, "supplier");
}
