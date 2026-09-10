import { NextResponse } from "next/server";
import { listNombaBanks } from "@/lib/payments/nomba/client";

export async function GET() {
  try {
    const result = await listNombaBanks();
    return NextResponse.json({
      banks: result,
    });

  } catch (error: unknown) {
    console.error("🔥 NOMBA BANK LIST ERROR:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}
