# Flutter Seller Payouts, Withdraw, and Settings

This guide implements the Flutter seller screens for:

- Payout history
- Withdrawal
- Seller payout bank account
- Seller profile and store settings
- Store hours
- Seller notifications
- Security
- Payment and verification status

It follows the current seller dashboard and API contracts. Use this guide with FLUTTER_ROLE_SETTINGS.md, FLUTTER_SELLER_DASHBOARD.md, and FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

## 1. Recommended structure

```text
lib/features/seller/
  finance/
    payouts_screen.dart
    withdraw_screen.dart
    payout_model.dart
    payout_repository.dart
    withdrawal_confirmation.dart
  settings/
    seller_settings_screen.dart
    store_profile_settings_screen.dart
    store_hours_settings_screen.dart
    seller_notification_settings_screen.dart
    seller_security_settings_screen.dart
    seller_payment_settings_screen.dart
    seller_settings_repository.dart
  widgets/
    balance_card.dart
    payout_status_chip.dart
    bank_account_card.dart
```

The seller shell should expose:

```text
Payouts
Withdraw
Settings
```

Use the shared authenticated ApiClient. Never place Nomba credentials in Flutter.

## 2. Financial data model

The canonical seller ledger is stored on:

```text
stores/{sellerUid}
  availableBalance
  escrowBalance
  totalSales
  payoutSettings
  payoutAccountVerificationStatus
  payoutStatus
  pendingPayoutDetails
  isPartner
  partnerExpiry
```

Payout history is stored in:

```text
payouts/{payoutId}
  id
  storeId
  vendorId
  orderId
  reference
  nombaReference
  paymentProvider
  grossAmount
  platformFee
  netAmount
  amount
  bankName
  accountNumber
  bankCode
  accountName
  status
  requestedAt
  providerReference
  providerStatus
  failureReason
  balanceReservedAt
  balanceRestoredAt
  updatedAt
```

A seller may have older records owned by vendorId and newer records owned by storeId. Merge both queries by payout ID.

Do not calculate available balance by summing payout records. Use stores/{sellerUid}.availableBalance as the canonical balance.

## 3. Payouts screen

### 3.1 UI

```text
AppBar
  Payouts
  Refresh

Balance summary
  Available balance
  Escrow balance
  Total sales

Payout account
  Bank
  Masked account number
  Account name
  Verification status
  Update account

Payout history
  Reference
  Date
  Gross amount
  Platform fee
  Net amount
  Status
  Provider reference
  Copy reference
```

Status chips:

```text
pending
  Waiting for processing

processing
  Submitted to payment provider

completed
  Transfer completed

failed
  Transfer failed

refunded
  Reserved balance restored
```

Normalize approved to processing if older records contain approved.

### 3.2 Payout model

```dart
class SellerPayout {
  final String id;
  final String status;
  final double grossAmount;
  final double platformFee;
  final double netAmount;
  final String? reference;
  final String? providerReference;
  final DateTime? requestedAt;
  final String? failureReason;

  const SellerPayout({
    required this.id,
    this.status = 'pending',
    this.grossAmount = 0,
    this.platformFee = 0,
    this.netAmount = 0,
    this.reference,
    this.providerReference,
    this.requestedAt,
    this.failureReason,
  });

  factory SellerPayout.fromFirestore(
    String id,
    Map<String, dynamic> data,
  ) {
    final rawDate = data['requestedAt'];
    final date = rawDate is Timestamp ? rawDate.toDate() : null;

    return SellerPayout(
      id: id,
      status: data['status']?.toString().toLowerCase() ?? 'pending',
      grossAmount: (data['grossAmount'] ??
              data['amount'] ??
              0 as num)
          .toDouble(),
      platformFee: (data['platformFee'] as num?)?.toDouble() ?? 0,
      netAmount: (data['netAmount'] ??
              data['grossAmount'] ??
              data['amount'] ??
              0 as num)
          .toDouble(),
      reference: data['reference']?.toString(),
      providerReference: data['providerReference']?.toString() ??
          data['nombaReference']?.toString(),
      requestedAt: date,
      failureReason: data['failureReason']?.toString(),
    );
  }
}
```

In the actual Dart code, use explicit helper functions for numeric parsing instead of relying on mixed dynamic expressions.

### 3.3 Payout listener

```dart
Stream<List<SellerPayout>> watchPayouts(String sellerUid) {
  final storeStream = FirebaseFirestore.instance
      .collection('payouts')
      .where('storeId', isEqualTo: sellerUid)
      .snapshots();

  final vendorStream = FirebaseFirestore.instance
      .collection('payouts')
      .where('vendorId', isEqualTo: sellerUid)
      .snapshots();

  return mergePayoutStreamsAndDeduplicate(
    storeStream,
    vendorStream,
  );
}
```

Sort by requestedAt descending. Limit the initial result or add pagination for large payout histories.

## 4. Seller payout account

### 4.1 Read saved payout details

```http
GET /api/vendor/payout-settings?storeId=SELLER_UID
Authorization: Bearer FIREBASE_ID_TOKEN
```

The API returns:

```json
{
  "bankName": "Bank name",
  "accountNumber": "0123456789",
  "accountName": "Verified name",
  "bankCode": "000",
  "status": "UNCONFIGURED"
}
```

The server requires storeId to equal the authenticated UID.

Mask the account number in normal UI:

```text
**********6789
```

Only show the full value while the seller is actively editing and only when necessary.

### 4.2 Fetch banks

```http
GET /api/webhooks/nomba/banks
```

This route is used by the current web payment form. It may require server connectivity to Nomba. Flutter should show:

- Loading banks
- Search field
- No banks found
- Retry
- Network timeout

Do not call Nomba directly from Flutter.

### 4.3 Save and verify payout details

```http
POST /api/vendor/payout-settings
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "storeId": "SELLER_UID",
  "bankName": "Bank name",
  "bankCode": "000",
  "accountNumber": "0123456789",
  "accountName": ""
}
```

The server:

1. Verifies the Firebase token.
2. Confirms storeId equals the token UID.
3. Validates a 10-digit account number.
4. Looks up the account with Nomba.
5. Saves pending payout details.
6. Sets payout status to PENDING_REVIEW.
7. Returns the verified account name and account number.

Response example:

```json
{
  "success": true,
  "accountName": "Verified account name",
  "accountNumber": "0123456789"
}
```

Flutter flow:

```text
Select bank
  -> Enter 10-digit account number
  -> Submit
  -> Show verifying state
  -> Display verified account name
  -> Show submitted-for-review confirmation
  -> Refresh payout status
```

A seller cannot withdraw while the account is awaiting admin verification.

### 4.4 Payout account UI

```dart
class PayoutAccountForm extends StatefulWidget {
  final ApiClient apiClient;
  final String sellerUid;

  const PayoutAccountForm({
    super.key,
    required this.apiClient,
    required this.sellerUid,
  });

  @override
  State<PayoutAccountForm> createState() => _PayoutAccountFormState();
}

class _PayoutAccountFormState extends State<PayoutAccountForm> {
  final accountNumber = TextEditingController();
  String bankName = '';
  String bankCode = '';
  bool saving = false;
  String? error;

  Future<void> save() async {
    final digits = accountNumber.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (bankCode.isEmpty || digits.length != 10) {
      setState(() => error = 'Select a bank and enter 10 digits');
      return;
    }

    setState(() {
      saving = true;
      error = null;
    });

    try {
      final result = await widget.apiClient.request(
        'POST',
        '/api/vendor/payout-settings',
        body: {
          'storeId': widget.sellerUid,
          'bankName': bankName,
          'bankCode': bankCode,
          'accountNumber': digits,
          'accountName': '',
        },
      );

      if (!mounted) return;
      final accountName = result['accountName']?.toString() ?? '';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            accountName.isEmpty
                ? 'Payout details submitted'
                : 'Verified for ' + accountName,
          ),
        ),
      );
    } catch (exception) {
      if (mounted) setState(() => error = exception.toString());
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  void dispose() {
    accountNumber.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Bank searchable dropdown goes here.
        TextField(
          controller: accountNumber,
          keyboardType: TextInputType.number,
          maxLength: 10,
          decoration: const InputDecoration(
            labelText: 'Account number',
          ),
        ),
        if (error != null) Text(error!),
        FilledButton(
          onPressed: saving ? null : save,
          child: Text(saving ? 'Verifying...' : 'Submit for review'),
        ),
      ],
    );
  }
}
```

## 5. Withdraw screen

### 5.1 Balance and fee rules

The current web Withdraw tab uses:

```text
available balance = stores/{uid}.availableBalance
escrow balance = stores/{uid}.escrowBalance
partner fee = 1.5% when partner is active
standard fee = 3% otherwise
net amount = requested amount - platform fee
```

The server is authoritative for fee calculation. Flutter may show an estimate but must display the final amount returned by the API.

The screen should show:

- Available balance
- Escrow balance
- Linked bank account
- Fee percentage
- Estimated net payout
- Quick amount buttons: 25%, 50%, 75%, 100%
- Amount field
- MAX button
- Withdraw button
- Payout history

Disable withdrawal when:

- The amount is zero or negative.
- The amount exceeds available balance.
- The available balance is zero.
- No verified payout account exists.
- A withdrawal is already being submitted.

### 5.2 Withdrawal API

```http
POST /api/withdraw
Authorization: Bearer FIREBASE_ID_TOKEN
Idempotency-Key: UNIQUE_KEY
Content-Type: application/json
```

Body:

```json
{
  "amount": 50000
}
```

The API:

1. Authenticates the seller.
2. Reads the seller store ledger.
3. Confirms payout bank details exist.
4. Confirms payout verification is approved.
5. Confirms sufficient available balance.
6. Calculates platform fee.
7. Reserves the gross amount atomically.
8. Creates a pending payout record.
9. Submits the transfer to Nomba.
10. Restores the balance if the transfer fails safely.
11. Returns the result.

The server accepts the idempotency key from the header and may also accept it in the body. Always send the header.

### 5.3 Flutter withdrawal method

```dart
Future<dynamic> requestWithdrawal({
  required ApiClient apiClient,
  required double amount,
}) async {
  final key = const Uuid().v4();

  return apiClient.request(
    'POST',
    '/api/withdraw',
    body: {'amount': amount},
    headers: {
      'Idempotency-Key': key,
    },
  );
}
```

If the shared ApiClient does not support custom headers, extend it with an optional headers argument. Do not create a second unauthenticated HTTP implementation.

Add uuid:

```yaml
dependencies:
  uuid: ^latest
```

Never generate a new idempotency key when retrying a request whose outcome is unknown. Reuse the same key for the retry so the server returns the existing payout state instead of reserving funds twice.

### 5.4 Withdrawal flow

```text
Enter amount
  -> Validate locally
  -> Confirm bank and net amount
  -> Show confirmation dialog
  -> Generate idempotency key
  -> Submit request
  -> Show processing
  -> Display pending/completed result
  -> Refresh store balance and payout history
```

If the request times out after it may have reached the server:

1. Keep the same idempotency key.
2. Query or refresh payout history.
3. Do not submit with a new key immediately.
4. Show the seller the current payout status.

Error meanings:

```text
401
  Session expired

403
  Payout account not approved

400
  Invalid amount or insufficient balance

404
  Store not found

409
  Idempotency key reused with a different amount or ledger conflict

500
  Provider or server problem
```

### 5.5 Withdrawal confirmation UI

Show:

```text
Amount requested
Platform fee
Estimated amount received
Bank name
Masked account number
Warning that funds will leave available balance
Confirm withdrawal
Cancel
```

After confirmation, disable all duplicate buttons until the first request resolves.

## 6. Seller Settings screen

### 6.1 Settings navigation

```text
Seller Settings
  Store profile
  Store hours
  Notifications
  Payment and payout
  Security
  Subscription and Boost Store
  Help and Support
```

Keep seller dashboard settings in the Seller Settings screen. Do not place seller-only settings in buyer settings.

### 6.2 Store profile settings

Store profile uses stores/{sellerUid}. Fields include:

```text
storeName
username
description
mainCategory
subCategory
state
lga
latitude
longitude
phone
address
email
logoUrl
bannerUrl
socials
```

Use the My Store UI and save flow from FLUTTER_SELLER_STORE_PRODUCTS_ORDERS_ANALYTICS.md.

### 6.3 Store hours

The current web Store Hours settings update:

```text
stores/{sellerUid}
  storeHours
  whatsappAutoReply
  updatedAt
```

Suggested UI:

```text
Store hours
  Monday open/closed
  Tuesday open/closed
  Wednesday open/closed
  Thursday open/closed
  Friday open/closed
  Saturday open/closed
  Sunday open/closed

WhatsApp auto-reply
  Enabled or disabled
  Auto-reply message if supported

Save
```

Save only after validating that closing time follows opening time when the day is open.

Example:

```dart
Future<void> saveStoreHours({
  required String sellerUid,
  required Map<String, dynamic> hours,
  required bool whatsappAutoReply,
}) {
  return FirebaseFirestore.instance
      .collection('stores')
      .doc(sellerUid)
      .set(
        {
          'storeHours': hours,
          'whatsappAutoReply': whatsappAutoReply,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
}
```

Use a protected API instead if direct store writes are not allowed by the production rules.

### 6.4 Seller notifications

The current web settings save:

```text
stores/{sellerUid}
  notifications
    email
    whatsapp
    push
    orders
    payouts
    disputes
    messages
    marketing
    updatedAt
```

The exact keys returned by the deployed app are authoritative. Do not remove unknown keys when saving; use a merge update.

The web app also has a Telegram notification channel route:

```http
POST /api/notifications/channels/telegram
```

Before implementing Telegram setup in Flutter, confirm the request and response contract. The app should not store bot tokens.

General notification settings:

- Email notifications
- WhatsApp notifications
- Push notifications
- New order alerts
- Payout alerts
- Dispute alerts
- Chat alerts
- Marketing alerts

Request Android/iOS push permission separately from storing the preference.

### 6.5 Security settings

The current seller security settings use:

```text
stores/{sellerUid}
  twoFactorEnabled
  lastSessionRefresh
  updatedAt
```

The UI should include:

- Two-factor status
- Enable or disable two-factor flow
- Sign out other devices
- Reauthenticate
- Change password
- Delete account

The current web sign-out-others behavior updates lastSessionRefresh. Flutter should call a protected security endpoint if the backend provides one; otherwise use the same server-supported session refresh field and confirm it is protected by Firestore rules.

Do not implement two-factor authentication as a local toggle only. The server must enforce it.

### 6.6 Payment and payout settings

The payment settings screen should contain:

```text
Bank selector
Account number
Verified account name
Account verification status
Payout review status
Save for review
Payout history
Withdraw
```

Use:

```http
GET  /api/webhooks/nomba/banks
GET  /api/vendor/payout-settings?storeId=SELLER_UID
POST /api/vendor/payout-settings
POST /api/withdraw
```

All Nomba operations run server-side.

### 6.7 Subscription and Boost Store

The seller dashboard uses subscriptions and Boost Store features.

Read subscription state from:

```text
subscriptions
  where userId == sellerUid
```

The store boost flow uses a checkout API and a boost status record. The current web implementation references:

```http
POST /api/premium/boost-checkout
GET  /api/boost-store/{reference}
```

Confirm the exact checkout body before wiring Flutter payment. Flutter must open the server-created checkout and wait for server confirmation. Do not mark a boost or subscription active based only on a client callback.

## 7. Shared settings repository

```dart
class SellerSettingsRepository {
  final ApiClient apiClient;
  final FirebaseFirestore firestore;

  SellerSettingsRepository({
    required this.apiClient,
    FirebaseFirestore? firestore,
  }) : firestore = firestore ?? FirebaseFirestore.instance;

  Stream<DocumentSnapshot<Map<String, dynamic>>> watchStore(
    String sellerUid,
  ) {
    return firestore
        .collection('stores')
        .doc(sellerUid)
        .snapshots();
  }

  Future<dynamic> getPayoutSettings(String sellerUid) {
    return apiClient.request(
      'GET',
      '/api/vendor/payout-settings?storeId=' + sellerUid,
    );
  }

  Future<dynamic> savePayoutSettings({
    required String sellerUid,
    required String bankName,
    required String bankCode,
    required String accountNumber,
  }) {
    return apiClient.request(
      'POST',
      '/api/vendor/payout-settings',
      body: {
        'storeId': sellerUid,
        'bankName': bankName,
        'bankCode': bankCode,
        'accountNumber': accountNumber,
        'accountName': '',
      },
    );
  }

  Future<dynamic> withdraw({
    required double amount,
    required String idempotencyKey,
  }) {
    return apiClient.request(
      'POST',
      '/api/withdraw',
      body: {'amount': amount},
      extraHeaders: {'Idempotency-Key': idempotencyKey},
    );
  }

  Future<dynamic> deleteAccount() {
    return apiClient.request('POST', '/api/account/delete');
  }
}
```

Match extraHeaders to the actual method name in the shared ApiClient. The important requirement is that Idempotency-Key is sent as an HTTP header.

## 8. Financial security rules

The seller client must not directly write:

```text
stores.availableBalance
stores.escrowBalance
stores.totalSales
payouts.status
payouts.providerReference
payouts.netAmount
payouts.platformFee
orders.sellerPayoutStatus
orders.fundsState
verification approval fields
```

These values must come from protected server transactions.

Seller-readable financial data should be masked where appropriate. Do not log full account numbers, bank codes, tokens, or provider responses.

Require recent Firebase authentication before:

- Replacing a payout account
- Enabling two-factor authentication
- Disabling two-factor authentication
- Deleting the account
- Changing sensitive seller identity data

## 9. Error and state handling

Payout account:

```text
Loading banks
Bank service unavailable
Invalid account number
Account verification failed
Pending admin review
Approved
Rejected
```

Withdraw:

```text
No available balance
Account not approved
Invalid amount
Insufficient balance
Request pending
Processing
Completed
Failed and balance restored
Unknown result; refresh history
```

Settings:

```text
Loading
Editing
Saving
Saved
Permission denied
Offline with unsaved changes
```

Do not clear a withdrawal form after a timeout unless the payout status is known. Preserve the idempotency key until the result is reconciled.

## 10. Testing checklist

### Payout account

- Bank list loads.
- Bank search works.
- Invalid account numbers are rejected locally.
- Nomba verification failure is shown.
- Pending review status is displayed.
- A seller cannot submit another seller's storeId.

### Withdraw

- Zero amount is rejected.
- Amount above available balance is rejected.
- Unverified bank account is rejected.
- Partner fee estimate is displayed.
- Double taps create only one payout.
- Timeout retry uses the same idempotency key.
- Failed transfer restores the balance.
- Payout history refreshes after submission.

### Settings

- Store profile saves without dropping unknown fields.
- Hours validate correctly.
- Notification toggles persist.
- Security actions require authentication.
- Payment account changes refresh payout status.
- Sign out clears private state.
- Admin and buyer settings are not visible in the seller shell.

## 11. Implementation order

1. Create SellerSettingsRepository and shared API client support for custom headers.
2. Implement store balance and payout history listeners.
3. Build Payouts screen.
4. Build payout account verification form.
5. Build Withdraw confirmation and idempotent request flow.
6. Implement My Store profile settings.
7. Implement Store Hours and Notifications.
8. Implement Security.
9. Add Subscription and Boost Store status.
10. Test server authorization, ledger reservation, provider failures, and retry behavior.


