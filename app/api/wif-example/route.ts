import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { checkWifReceipt } from "@/lib/wif-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A real, publicly visible WIF transfer used to demonstrate the receipt check.
const EXAMPLE_HASH = "0xe2177419832e17477cd686e5b5ec57654def3c0bb29bd82ed4abb8259fbca0fd";
const readExample = unstable_cache(
  async () => {
    const { transactionHash, blockNumber, blockTime, confirmations } = await checkWifReceipt(EXAMPLE_HASH);
    return { transactionHash, blockNumber, blockTime, confirmations };
  },
  ["flatquest-wif-receipt-example", EXAMPLE_HASH],
  { revalidate: 300 }
);

export async function GET() {
  try {
    return NextResponse.json(await readExample());
  } catch {
    return NextResponse.json({ error: "The example receipt is temporarily unavailable. Try again." }, { status: 503 });
  }
}
