import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
let cachedAccessToken: string | null = null;
let cachedIbsClientId: string | null = null;
let tokenExpiryTimestamp: number = 0;

function getPrivateKey(): crypto.KeyObject {
    const configuredKey = process.env.SAFEHAVEN_PRIVATE_KEY?.trim();
    const configuredPath = process.env.SAFEHAVEN_PRIVATE_KEY_PATH?.trim();
    const pemPath = configuredPath || path.join(process.cwd(), 'test_private.pem');
    let rawKey = configuredKey || (fs.existsSync(pemPath) ? fs.readFileSync(pemPath, 'utf8').trim() : '');
    // Values copied into .env files commonly contain literal `\\n` sequences
    // and surrounding quotes. Node's crypto parser expects real line breaks.
    rawKey = rawKey.replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n').replace(/\\r/g, '\r').trim();
    // Also accept a base64-encoded PEM, which is convenient for hosted secret
    // managers that do not preserve multiline environment values.
    if (!rawKey.includes('-----BEGIN')) {
        try {
            const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
            if (decoded.includes('-----BEGIN')) rawKey = decoded.trim();
        } catch {
            // Let createPrivateKey return the useful configuration error below.
        }
    }
    if (!rawKey) throw new Error('Safe Haven private key is not configured');
    if (rawKey.includes('-----BEGIN CERTIFICATE-----')) {
        throw new Error('SAFEHAVEN_PRIVATE_KEY contains a public certificate. Configure the matching private key or set SAFEHAVEN_PRIVATE_KEY_PATH to safehaven_private.pem.');
    }
    return crypto.createPrivateKey({ key: rawKey, format: 'pem' });
}

function validateEnv(): void {
    if (!process.env.SAFEHAVEN_CLIENT_ID || !process.env.SAFEHAVEN_APP_ISSUER) {
        throw new Error('Missing SAFEHAVEN_CLIENT_ID or SAFEHAVEN_APP_ISSUER in environment variables.');
    }
}

export function generateClientAssertion(): string {
    validateEnv();
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;

    const payload = {
        iss: process.env.SAFEHAVEN_APP_ISSUER,
        sub: process.env.SAFEHAVEN_CLIENT_ID,
        aud: process.env.SAFEHAVEN_BASE_URL || 'https://api.sandbox.safehavenmfb.com',
        iat: now,
        exp: expiry,
    };

    const privateKey = getPrivateKey();
    return jwt.sign(payload, privateKey, {
        algorithm: 'RS256',
        header: { alg: 'RS256', typ: 'JWT' },
    });
}

/**
 * Returns active access_token AND the dynamically resolved IBS Client ID
 */
export async function getAuthCredentials(): Promise<{ accessToken: string; ibsClientId: string }> {
    validateEnv();

    const now = Date.now();
    if (cachedAccessToken && cachedIbsClientId && now < tokenExpiryTimestamp - 60000) {
        return { accessToken: cachedAccessToken, ibsClientId: cachedIbsClientId };
    }

    const clientAssertion = generateClientAssertion();
    const baseUrl = (process.env.SAFEHAVEN_BASE_URL || 'https://api.sandbox.safehavenmfb.com').replace(/\/+$/, '');
    const url = `${baseUrl}/oauth2/token`;
    const bodyData = JSON.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.SAFEHAVEN_CLIENT_ID,
        client_assertion: clientAssertion,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: bodyData,
        cache: 'no-store',
    });
    const responseText = await response.text();
    let responseData: any;
    try { responseData = responseText ? JSON.parse(responseText) : {}; }
    catch { throw new Error(`Failed to parse Safe Haven token response: ${responseText.slice(0, 500)}`); }
    if (!response.ok) throw new Error(`Auth Failed [${response.status}]: ${JSON.stringify(responseData)}`);

    const token: string | undefined =
        responseData.access_token ||
        responseData.data?.access_token ||
        responseData.token ||
        responseData.data?.token;

    // Resolve IBS Client ID returned by token response, guaranteeing a string fallback
    const ibsClientId: string =
        responseData.ibs_client_id ||
        responseData.data?.ibs_client_id ||
        responseData.ibs_client ||
        responseData.client_id ||
        responseData.data?.client ||
        process.env.SAFEHAVEN_CLIENT_ID;

    if (!token) {
        throw new Error(`Missing access_token in response: ${JSON.stringify(responseData)}`);
    }

    cachedAccessToken = token;
    cachedIbsClientId = ibsClientId;
    const expiresInSeconds = responseData.expires_in || responseData.data?.expires_in || 3600;
    tokenExpiryTimestamp = Date.now() + expiresInSeconds * 1000;

    return { accessToken: token, ibsClientId: ibsClientId };
}

export async function getAccessToken(): Promise<string> {
    const { accessToken } = await getAuthCredentials();
    return accessToken;
}
