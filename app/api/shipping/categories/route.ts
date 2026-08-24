import { NextResponse } from "next/server";

const SHIPBUBBLE_BASE_URL = "https://api.shipbubble.com/v1";

export async function GET() {
  try {
    const apiKey = process.env.SHIPBUBBLE_API_KEY;

    if (!apiKey) {
      console.error("❌ SHIPBUBBLE_API_KEY is missing in environment variables");
      return NextResponse.json(
        { error: "Shipbubble API key is not configured.", debug: "Missing Env Var" },
        { status: 500 }
      );
    }

    console.log("🚀 Fetching categories from Shipbubble...");

    const response = await fetch(
      `${SHIPBUBBLE_BASE_URL}/shipping/package_categories`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const rawData = await response.text(); // Read as text first to log raw response
    console.log("📦 Raw Shipbubble Response Status:", response.status);
    console.log("📦 Raw Shipbubble Response Body:", rawData);

    let data;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      console.error("Failed to parse JSON", e);
      return NextResponse.json({ error: "Invalid JSON from Shipbubble", raw: rawData }, { status: 500 });
    }

    if (!response.ok || data.status !== "success") {
      console.error("❌ Shipbubble API Error:", data);
      return NextResponse.json(
        {
          error: data.errors?.join(", ") || data.message || "Unable to fetch package categories.",
          debugData: data
        },
        { status: response.status || 500 }
      );
    }

    const categories = data.data?.categories || [];
    console.log("✅ Successfully parsed categories:", categories.length);

    return NextResponse.json({
      success: true,
      categories: categories.map((cat: any) => ({
        id: String(cat.id), // Ensure ID is always a string
        name: cat.name,
        description: cat.description || null,
        isActive: cat.is_active ?? true,
      })),
      debugCount: categories.length
    });
  } catch (error: any) {
    console.error("💥 CRITICAL ERROR fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Unable to fetch package categories." },
      { status: 500 }
    );
  }
}