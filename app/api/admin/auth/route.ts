import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Use /admin/login for administrator authentication." }, { status: 410 });
}
