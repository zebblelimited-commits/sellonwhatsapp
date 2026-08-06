import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  (await cookies()).delete("__session");
  return NextResponse.json({ status: "success" }, { status: 200 });
}