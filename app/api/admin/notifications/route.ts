import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Use the notifications tab in the admin dashboard." }, { status: 410 });
}
