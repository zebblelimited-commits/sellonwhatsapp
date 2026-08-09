import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const allowedTypes: Record<string, string> = {
  "image/avif": ".avif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function safeBaseName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const cleaned = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "sponsored-store";
}

export async function POST(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload" }, { status: 400 });

    const extension = allowedTypes[file.type];
    if (!extension) return NextResponse.json({ error: "Only JPG, PNG, WEBP, and AVIF images are supported" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Sponsored images must be smaller than 8 MB" }, { status: 400 });

    const fileName = `${safeBaseName(file.name)}-${randomUUID().slice(0, 8)}${extension}`;
    const relativePath = path.join("images", "sponsored", fileName);
    const uploadDirectory = path.join(process.cwd(), "public", "images", "sponsored");
    const absolutePath = path.join(uploadDirectory, fileName);
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()), { flag: "wx" });

    const publicUrl = `/${relativePath.split(path.sep).join("/")}`;
    await adminDb.collection("auditLogs").add({
      action: "sponsored_image_uploaded",
      targetType: "sponsored_image",
      targetId: publicUrl,
      performedBy: access.admin.uid,
      performedByEmail: access.admin.email || "",
      details: { fileName, mimeType: file.type, size: file.size },
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, url: publicUrl, fileName });
  } catch (error) {
    console.error("Admin sponsored image upload error:", error);
    return NextResponse.json({ error: "Sponsored image could not be uploaded" }, { status: 500 });
  }
}
