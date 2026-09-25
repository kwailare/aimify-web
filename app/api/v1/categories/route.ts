import { createOption, listOptions } from "@/lib/catalog-routes";

export async function GET(request: Request) {
  return listOptions(request, "category");
}

export async function POST(request: Request) {
  return createOption(request, "category");
}
