import { createParty, listParties } from "@/lib/party-routes";

export async function GET(request: Request) {
  return listParties(request, "customer");
}

export async function POST(request: Request) {
  return createParty(request, "customer");
}
