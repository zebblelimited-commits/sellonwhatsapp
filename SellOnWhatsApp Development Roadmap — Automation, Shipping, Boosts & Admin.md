# SellOnWhatsApp Development Roadmap

## Priority 1: Automation & Revenue Continuity
**Status: Active Development**

### Step 1: Implement Cloud Function Cron Job for Subscriptions & Boosts
- [ ] Set up a Firebase Scheduled Cloud Function, running daily through Google Cloud Scheduler.
- [ ] Query the `subscriptions` and `storeBoosts` collections for documents expiring within the next 24 hours.
- [ ] Attempt recurring payment charges against saved payment methods or Nomba card tokens.
- [ ] If the recurring payment is successful:
  - Extend the `expiryDate` by the applicable plan duration.
  - Keep the subscription/boost active.
  - Record the successful renewal transaction.

### Step 2: Implement 7-Day Grace Period & Expiry Logic
- [ ] If recurring payment fails or no payment method exists, set the subscription status to `in_grace_period`.
- [ ] Apply a 7-day grace period.
- [ ] Send automated warning notifications through Novu and/or the Firestore `notifications` collection.
- [ ] Notify the seller before the grace period expires.
- [ ] If payment is not received before the grace period expires:
  - Set `isPartner: false`.
  - Set `subscriptionPlan: "free"`.
  - Deactivate the applicable boost.
  - Restore the standard 1.5% seller commission.
- [ ] Ensure the system prevents expired subscriptions from continuing to receive partner benefits.

---

# Priority 2: Shipping & Courier Aggregation
**Status: Phase 2**

### Step 3: Database Setup for Couriers
- [ ] Create a `couriers` collection in Firestore.
- [ ] Add the following core fields:
  - `name`
  - `logo`
  - `baseRate`
  - `ratePerKg`
  - `stateMultipliers`
  - `status`
- [ ] Seed standard local courier rate cards.
- [ ] Include a `self_arranged` delivery option.
- [ ] Structure the database so additional courier companies can be integrated later without restructuring the shipping system.

### Step 4: Build Shipping Calculation API
**Endpoint:** `/api/shipping/calculate`

- [ ] Accept the buyer's delivery location/state.
- [ ] Accept item weight and applicable package information.
- [ ] Accept the seller/store origin.
- [ ] Calculate courier rates using:

  **Shipping Rate = (Base Rate + Weight × Rate Per Kg) × State Multiplier**

- [ ] Return available courier options with:
  - Courier name
  - Logo
  - Estimated delivery time
  - Shipping cost
  - Service type
- [ ] Append the `self_arranged` option with zero courier cost.
- [ ] Ensure shipping rates can be updated from the admin dashboard without requiring code changes.

### Step 5: Post-Checkout Shipment Creation & Lifecycle API
- [ ] Separate shipment creation from the initial checkout/payment process.
- [ ] Create a shipment record after the order has been successfully created.
- [ ] For `self_arranged` orders, set the initial shipment status to `AWAITING_PICKUP`.
- [ ] Implement a shipment lifecycle such as:

  `PENDING_PICKUP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`

- [ ] Support cancellation and failed-delivery states.
- [ ] Build an endpoint for authorized shipment-status updates.
- [ ] Automatically record shipment status history.
- [ ] Automatically trigger escrow release when the order reaches the appropriate delivery state.
- [ ] Ensure shipment status changes cannot be manipulated by unauthorized users.

---

# Priority 3: Store Boosts & Frontend Integration
**Status: Phase 4**

### Step 6: Store Boosts Frontend UI Components

#### Micro Boost
- [ ] Add a **Trending Stores** carousel to `ExplorePage.tsx`.
- [ ] Prioritize stores with an active Micro Boost.
- [ ] Ensure boosted stores are clearly integrated into the existing Explore experience without making the interface feel like an advertisement.

#### Pro Boost
- [ ] Update the search-ranking algorithm in `SearchPage.tsx`.
- [ ] Apply a **1.15× search-score multiplier** to eligible boosted stores.
- [ ] Ensure the multiplier only applies while the Pro Boost is active.
- [ ] Prevent expired boosts from affecting search rankings.

#### Max Boost
- [ ] Add a **Hero Banner Carousel** to `app/page.tsx`.
- [ ] Display eligible stores with active Max Boost campaigns.
- [ ] Ensure banners are automatically removed when the boost expires.

---

# Priority 4: Edge Cases, Refunds & Admin Control
**Status: Phase 5**

### Step 7: Dispute & Automated Refund Engine
- [ ] Build automated refund logic for courier-based orders where the seller fails to ship within the allotted timeframe.
- [ ] Restore eligible buyer funds when an order qualifies for an automated refund.
- [ ] Refund or restore applicable shipping fees when appropriate.
- [ ] Ensure escrow funds are not released when the seller fails to fulfill the order.
- [ ] Allow buyers to initiate disputes for `self_arranged` deliveries.
- [ ] Create dispute statuses and lifecycle tracking.
- [ ] Record all refunds, disputes and escrow actions in an auditable transaction history.

### Step 8: Admin Dashboard UI
- [ ] Build an admin interface for managing courier configurations.
- [ ] Allow administrators to:
  - Add couriers.
  - Edit courier information.
  - Enable/disable couriers.
  - Update base rates.
  - Update per-kg rates.
  - Update state multipliers.
  - Manage delivery options.
- [ ] Build financial reporting for separate ledgers:
  - **Escrow Balance**
  - **Platform Revenue**
  - **Seller Payouts**
  - **Shipping Revenue/Fees**
  - **Refunds**
- [ ] Provide transaction-level visibility for payments, escrow movements, shipping charges and refunds.
- [ ] Restrict financial and courier-management actions to authorized administrators.

---

# Recommended Implementation Sequence

The development should proceed in the following order:

```text
Priority 1
Automation & Revenue Continuity
        ↓
Priority 2
Shipping & Courier Aggregation
        ↓
Cart + Checkout + Shipping Integration
        ↓
Priority 3
Store Boost Frontend Integration
        ↓
Priority 4
Disputes, Refunds & Admin Controls
```

## Core Objective

The restructuring should ensure that SellOnWhatsApp has a reliable automated revenue system, a scalable shipping layer, a flexible courier architecture, and proper financial controls.

The shipping architecture should be designed so that the platform can initially use internally configured courier rates and `self_arranged` delivery, while remaining ready for future direct API integrations with Nigerian courier companies.