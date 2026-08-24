import { NextResponse } from "next/server";

const SHIPBUBBLE_BASE_URL = "https://api.shipbubble.com/v1";

interface ShipbubbleCategory {
  id: number | string;
  name: string;
  description?: string;
  is_active?: boolean;
}

interface ShipbubbleCategoriesResponse {
  status: string;
  message?: string;
  errors?: string[];
  data?: {
    categories?: ShipbubbleCategory[];
  };
}

export async function GET() {
  try {
    const apiKey = process.env.SHIPBUBBLE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Shipbubble API key is not configured." },
        { status: 500 }
      );
    }

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

    const data: ShipbubbleCategoriesResponse = await response.json();

    if (!response.ok || data.status !== "success") {
      console.error("Shipbubble categories request failed:", data);

      return NextResponse.json(
        {
          error:
            data.errors?.join(", ") ||
            data.message ||
            "Unable to fetch package categories.",
        },
        { status: response.status || 500 }
      );
    }

    const categories = data.data?.categories || [];

    return NextResponse.json({
      success: true,
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description || null,
        isActive: cat.is_active ?? true,
      })),
    });
  } catch (error: any) {
    console.error("SHIPBUBBLE CATEGORIES ERROR:", error);

    return NextResponse.json(
      {
        error: error.message || "Unable to fetch package categories.",
      },
      { status: 500 }
    );
  }
}
