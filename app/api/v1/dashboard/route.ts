import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-context";
import { type Bucket, businessSummary } from "@/lib/business-summary";

const MAX_DAYS = 732;

// The business at a glance for a period (from inclusive, to exclusive),
// compared with compareFrom..compareTo. Optional: bucket (day | month) for
// the trends, tz (minutes to add to UTC for local time; default 60, Lagos).
// Without dates: this month so far, against last month. Every role may ask;
// each section is only included when the role may see that module.
export async function GET(request: Request) {
  const context = await guardApi(request);
  if (context instanceof NextResponse) return context;

  const params = new URL(request.url).searchParams;
  const tz = params.get("tz") === null ? 60 : Number(params.get("tz"));
  if (!Number.isInteger(tz) || tz < -720 || tz > 840) {
    return NextResponse.json({ error: "tz must be whole minutes between -720 and 840." }, { status: 400 });
  }
  const read = (key: string) => {
    const value = params.get(key);
    if (value === null) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const values = ["from", "to", "compareFrom", "compareTo"].map(read);
  if (values.includes(null)) {
    return NextResponse.json({ error: "from, to, compareFrom and compareTo must be dates." }, { status: 400 });
  }
  let [from, to, compareFrom, compareTo] = values as (Date | undefined)[];

  if (!from || !to) {
    // This month (local), against last month.
    const local = new Date(Date.now() + tz * 60_000);
    const start = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - tz * 60_000);
    from = start(local.getUTCFullYear(), local.getUTCMonth());
    to = start(local.getUTCFullYear(), local.getUTCMonth() + 1);
    compareFrom ??= start(local.getUTCFullYear(), local.getUTCMonth() - 1);
    compareTo ??= from;
  }
  if (!compareFrom || !compareTo) {
    // The same length just before.
    compareTo = from;
    compareFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  }
  for (const [a, b] of [[from, to], [compareFrom, compareTo]] as const) {
    if (b <= a || b.getTime() - a.getTime() > MAX_DAYS * 86_400_000) {
      return NextResponse.json(
        { error: `Each period must end after it starts and be at most ${MAX_DAYS} days.` },
        { status: 400 },
      );
    }
  }
  const bucketParam = params.get("bucket");
  if (bucketParam !== null && bucketParam !== "day" && bucketParam !== "month") {
    return NextResponse.json({ error: "bucket must be day or month." }, { status: 400 });
  }
  const bucket: Bucket =
    (bucketParam as Bucket | null) ?? (to.getTime() - from.getTime() > 62 * 86_400_000 ? "month" : "day");

  return NextResponse.json(
    await businessSummary({
      organizationId: context.organizationId,
      permissions: context.permissions,
      range: { from, to },
      compare: { from: compareFrom, to: compareTo },
      bucket,
      tzMinutes: tz,
    }),
  );
}
