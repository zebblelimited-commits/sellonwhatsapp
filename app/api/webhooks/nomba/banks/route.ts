import { NextResponse } from "next/server";

async function getAccessToken() {
  const authUrl = process.env.NOMBA_AUTH_URL;
  const accountId = process.env.NOMBA_ACCOUNT_ID;
  const clientId = process.env.NOMBA_CLIENT_ID;
  const clientSecret = process.env.NOMBA_CLIENT_SECRET;

  // ✅ SAFETY CHECK: Ensure all required environment variables are loaded
  if (!authUrl || !accountId || !clientId || !clientSecret) {
    console.error("❌ Missing Nomba environment variables:", {
      NOMBA_AUTH_URL: !!authUrl,
      NOMBA_ACCOUNT_ID: !!accountId,
      NOMBA_CLIENT_ID: !!clientId,
      NOMBA_CLIENT_SECRET: !!clientSecret,
    });
    throw new Error("Missing required Nomba environment variables. Check your .env.local file and restart the server.");
  }

  const fullUrl = `${authUrl}/v1/auth/token/issue`;
  console.log("🔍 Attempting to fetch Nomba token from:", fullUrl);

  const response = await fetch(
    fullUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accountId: accountId,
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    }
  );

  const result = await response.json();
  console.log("AUTH RESPONSE:", result);

  if (!response.ok) {
    throw new Error(
      result?.description || `Failed to authenticate with Nomba (Status: ${response.status})`
    );
  }

  return result?.data?.access_token;
}

export async function GET() {
  try {
    const sandboxUrl = process.env.NOMBA_SANDBOX_URL;
    
    // ✅ SAFETY CHECK: Ensure Sandbox URL is loaded
    if (!sandboxUrl) {
      throw new Error("Missing NOMBA_SANDBOX_URL environment variable. Check your .env.local file.");
    }

    const token = await getAccessToken();

    const fullBanksUrl = `${sandboxUrl}/v1/transfers/banks`;
    console.log("🔍 Attempting to fetch banks from:", fullBanksUrl);

    const response = await fetch(
      fullBanksUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          accountId: process.env.NOMBA_ACCOUNT_ID,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const result = await response.json();
    console.log("BANKS RESPONSE:", result);

    if (!response.ok) {
      throw new Error(
        result?.description || `Failed to fetch banks (Status: ${response.status})`
      );
    }

    return NextResponse.json({
      banks: result?.data || [],
    });

  } catch (error: any) {
    console.error("🔥 NOMBA ERROR:", error);

    return NextResponse.json(
      {
        error: error.message || "Something went wrong",
      },
      {
        status: 500,
      }
    );
  }
}