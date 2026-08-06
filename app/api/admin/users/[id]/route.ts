import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Use the users tab in the admin dashboard." }, { status: 410 });
}
