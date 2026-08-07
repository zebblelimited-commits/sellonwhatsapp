import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";

function serialize(value: unknown): unknown {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serialize(item)]));
  return value;
}

type SerializedAuditLog = Record<string, unknown> & { id: string };

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!("admin" in access)) return access;

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "";
    const targetType = searchParams.get("targetType") || "";
    let snapshot;
    try {
      // Fetch the newest records first. The previous unordered limit could
      // return an old arbitrary slice and make recent actions appear missing.
      snapshot = await adminDb.collection("auditLogs").orderBy("timestamp", "desc").limit(500).get();
    } catch (queryError) {
      // Keep the viewer usable for legacy records that do not have timestamp.
      console.warn("Audit log timestamp query failed; using legacy fallback:", queryError);
      snapshot = await adminDb.collection("auditLogs").limit(500).get();
    }
    const records: SerializedAuditLog[] = snapshot.docs.map((doc): SerializedAuditLog => {
        const serialized = serialize(doc.data());
        return {
          id: doc.id,
          ...(serialized && typeof serialized === "object" ? serialized as Record<string, unknown> : {}),
        };
      });
    const logs = records
      .filter((log) => (!action || log.action === action) && (!targetType || log.targetType === targetType))
      .sort((a, b) => String(b.timestamp || b.createdAt || "").localeCompare(String(a.timestamp || a.createdAt || "")))
      .slice(0, 100);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Admin audit log error:", error);
    return NextResponse.json({ error: "Unable to load audit logs" }, { status: 500 });
  }
}
