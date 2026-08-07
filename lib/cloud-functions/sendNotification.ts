// lib/cloud-functions/sendNotification.ts
import { adminDb } from '@/lib/firebase-admin';
import admin from 'firebase-admin';

interface SendNotificationParams {
  vendorId: string;
  type: 'order' | 'payment' | 'product' | 'follower' | 'security' | 'system' | 'stats' | 'message';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  body: string;
  actionable?: boolean;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  novuTriggerId?: string; // ✅ The workflow ID from Novu dashboard
  novuPayload?: Record<string, any>;
}

export async function sendNotification(params: SendNotificationParams) {
  const { vendorId, novuTriggerId, novuPayload, ...inAppData } = params;

  // 1. Save to Firestore (for your custom dashboard UI)
  try {
    await adminDb.collection('notifications').add({
      vendorId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...inAppData
    });
    console.log(`✅ [In-App] Notification saved to Firestore for vendor: ${vendorId}`);
  } catch (error) {
    console.error(`❌ [In-App] Failed to save notification to Firestore:`, error);
  }

  // 2. Trigger Novu (for the Inbox bell icon)
  const novuWorkflowId = process.env.NOVU_WORKFLOW_ID?.trim();
  if (novuWorkflowId && process.env.NOVU_SECRET_KEY) {
    try {
      const novuResponse = await fetch('https://api.novu.co/v1/events/trigger', {
        method: 'POST',
        headers: {
          'Authorization': `ApiKey ${process.env.NOVU_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: novuWorkflowId,
          to: { subscriberId: vendorId },
          payload: { eventType: novuTriggerId || null, ...(novuPayload || {}) },
        }),
      });

      if (novuResponse.ok) {
        console.log(`✅ [Novu] Triggered workflow '${novuWorkflowId}' for vendor: ${vendorId}`);
      } else {
        const errText = await novuResponse.text();
        console.error(`❌ [Novu] API Error (${novuResponse.status}):`, errText);
      }
    } catch (error) {
      console.error(`❌ [Novu] Failed to trigger workflow:`, error);
    }
  } else if (novuTriggerId) {
    console.warn("⚠️ [Novu] Skipped: configure NOVU_WORKFLOW_ID with an existing Novu workflow trigger");
  }
}
