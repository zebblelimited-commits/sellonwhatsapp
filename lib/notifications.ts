// lib/notifications.ts
import admin from "firebase-admin";
import { adminDb } from "./firebase-admin"; // Adjust import based on your setup
import { Novu } from "@novu/node"; // 🌟 Import the Novu Node Backend SDK

// 🌟 Initialize the Novu Backend Client instance using your secret API key
const novu = new Novu(process.env.NOVU_SECRET_KEY || "");

interface CreateNotificationParams {
  vendorId: string;
  type: 'order' | 'payment' | 'product' | 'follower' | 'security' | 'system' | 'stats' | 'message';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  body: string;
  actionable?: boolean;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    // 1. Existing Logic: Persist fallback history state inside local Firestore database
    await adminDb.collection("notifications").add({
      vendorId: params.vendorId,
      type: params.type,
      priority: params.priority,
      title: params.title,
      body: params.body,
      read: false,
      actionable: params.actionable || false,
      actionLabel: params.actionLabel || null,
      actionUrl: params.actionUrl || null,
      metadata: params.metadata || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Firestore notification log entry created for vendor ${params.vendorId}: ${params.title}`);

    // 2. 🌟 Novu Pipeline Integration: Broadcast event stream live to the client notification center
    if (process.env.NOVU_SECRET_KEY) {
      
      // Determine your Novu Workflow Trigger ID. 
      // You can create a master generic workflow in Novu called 'in-app-alerts',
      // or separate workflows mapped dynamically per type (e.g., 'payment-alert')
      const workflowTriggerId = process.env.NOVU_WORKFLOW_ID?.trim();
      if (!workflowTriggerId) {
        console.warn("⚠️ Novu trigger skipped: configure NOVU_WORKFLOW_ID with an existing workflow trigger.");
        return;
      }

      await novu.trigger(workflowTriggerId, {
        // maps directly to user.uid handled by ZebbleNotificationCenter.tsx
        to: params.vendorId, 
        payload: {
          title: params.title,
          body: params.body,
          type: params.type,
          priority: params.priority,
          actionLabel: params.actionLabel,
          // ⚠️ CRITICAL: ZebbleNotificationCenter.tsx explicitly reads payload.actionUrl to execute routers
          actionUrl: params.actionUrl || "/dashboard?tab=overview", 
          ...params.metadata
        }
      });
      console.log(`🚀 Novu real-time workspace trigger broadcasted successfully to subscriber ${params.vendorId}`);
    } else {
      console.warn("⚠️ Novu trigger skipped: NOVU_SECRET_KEY is missing from environment variables.");
    }

  } catch (error) {
    console.error("❌ Failed to create/broadcast notification pipeline:", error);
  }
}
