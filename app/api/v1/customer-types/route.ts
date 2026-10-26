import { createCustomerType, listCustomerTypes } from "@/lib/customer-types";

export async function GET(request: Request) {
  return listCustomerTypes(request);
}

export async function POST(request: Request) {
  return createCustomerType(request);
}
