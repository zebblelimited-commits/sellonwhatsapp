# Flutter Settings for Buyer, Seller, and Admin

This document maps the settings experience for the Flutter application across buyer, seller, and admin accounts.

The design follows the existing SellOnWhatsApp platform principles:

- Firebase Authentication owns sign-in identity and session state.
- Firestore stores user-owned profile and preference documents where the web application already uses Firestore.
- Protected API routes perform authorization, account deletion, payouts, payment configuration, and administrative changes.
- The server determines the current user and role from the Firebase ID token.
- Flutter must not rely on a client-supplied user ID or role for authorization.

Use this guide with FLUTTER_API_INTEGRATION.md, NAVIGATION DRAWER.md, and FLUTTER_SUPPORT_CHAT_NOTIFICATIONS.md.

## 1. Settings architecture

Use one reusable SettingsShell with role-specific sections.

```text
SettingsShell
  Account
  Profile
  Notifications
  Security
  Privacy
  Help and Support
  Sign out
  Delete account

Buyer settings
  Delivery location
  Buyer notification preferences
  Referral payout account
  Purchase and dispute preferences

Seller settings
  Store profile
  Store visibility
  Seller notification preferences
  Shipping and fulfillment
  Payout and settlement details
  Subscription or boost settings

Admin settings
  Admin profile
  Admin notification preferences
  Staff and roles
  Platform configuration
  Payment and payout configuration
  Audit and security
```

The Flutter UI should hide sections that the current role cannot use, but server authorization remains the final protection.

## 2. Recommended project structure

```text
lib/
  core/
    api/api_client.dart
    auth/session_manager.dart
    settings/settings_models.dart
    settings/settings_repository.dart
    widgets/settings_section.dart
  features/
    settings/
      settings_shell.dart
      account_settings_screen.dart
      notification_settings_screen.dart
      security_settings_screen.dart
      privacy_settings_screen.dart
      buyer/
        buyer_settings_screen.dart
        delivery_location_screen.dart
        referral_payout_settings_screen.dart
      seller/
        seller_settings_screen.dart
        store_settings_screen.dart
        seller_shipping_settings_screen.dart
        seller_payout_settings_screen.dart
      admin/
        admin_settings_screen.dart
        staff_settings_screen.dart
        platform_settings_screen.dart
        payment_settings_screen.dart
```

Use a state-management solution already used by the Flutter project. The repository layer below is independent of Provider, Riverpod, Bloc, or GetIt.

## 3. Shared authenticated client

Every protected API call must include:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
Accept: application/json
```

Example:

```dart
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  throw ApiException(401, 'Please sign in again');
}

final token = await user.getIdToken();
```

Never include:

- Firebase Admin credentials
- Nomba client secrets
- Server environment variables
- Admin claims created by the client
- A user ID as a replacement for authentication

If the API returns 401, refresh the Firebase session when possible and redirect to login if the user is no longer authenticated. If the API returns 403, show an access-denied state and do not retry repeatedly.

## 4. Shared account settings

These settings are common to all roles.

### Account screen

The Account screen should include:

- Display name
- Email address, displayed as read-only unless email-change support is implemented
- Phone number
- Profile photo, if supported
- Account role
- Account creation date, if available
- Save changes
- Sign out
- Delete account

The existing buyer behavior reads users/{uid} and buyers/{uid}. Use the same users/{uid} profile document for shared fields where the web app already does so.

Recommended shared fields:

```text
users/{uid}
  displayName
  phone
  address
  city
  state
  lga
  postalCode
  latitude
  longitude
  photoUrl
  role
  updatedAt
```

Save only fields that the current user is allowed to edit.

Example save operation:

```dart
await FirebaseFirestore.instance
    .collection('users')
    .doc(uid)
    .set({
      'displayName': name.trim(),
      'phone': phone.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));

await FirebaseAuth.instance.currentUser?.updateDisplayName(name.trim());
```

Load the document before displaying the form, show a loading state, validate the fields, and dispose all TextEditingController instances.

### Sign out

Sign out should:

1. Stop active Firestore listeners.
2. Clear private in-memory settings, chat, and notification state.
3. Sign out from Firebase Auth.
4. Navigate to the login screen and remove protected routes from the navigation stack.

### Delete account

Account deletion is destructive and must use the existing API:

```http
POST /api/account/delete
```

Before calling it:

1. Display a confirmation dialog.
2. Explain that data may be permanently removed.
3. Require recent Firebase reauthentication.
4. Disable the button while the request is running.
5. Call the endpoint with the Firebase Bearer token.
6. Sign the user out after success.
7. Show a recoverable error if the request fails.

Do not implement deletion by deleting Firestore documents from Flutter one by one. The server must coordinate account deletion and related records.

## 5. Shared notification preferences

All roles should have a notification settings screen with toggles for the channels supported by the account:

```text
emailNotifs
whatsappNotifs
pushNotifs
```

For buyers, the existing web behavior stores these under:

```text
buyers/{uid}.preferences
```

For sellers, use the seller-owned preferences document used by the web application. If the current backend does not expose seller notification preferences, add a protected API or document the exact Firestore rule before releasing the Flutter screen.

For admins, notification preferences should be saved through an admin-protected API when the preference affects platform alerts, staff alerts, payout alerts, or security alerts.

Common UI behavior:

- Save changes immediately after a toggle or through a Save button.
- Display a small saving indicator.
- Restore the previous value if the write fails.
- Explain that device push permission is separate from the in-app preference.
- Request Android or iOS notification permission only when the user enables push notifications.

## 6. Buyer settings

### Buyer settings screen

The buyer Settings screen should contain:

- Notification preferences
- Delivery location
- Referral payout account
- Security
- Privacy
- Account deletion

The buyer drawer should link to this screen using the Settings item described in NAVIGATION DRAWER.md.

### Delivery location

The existing buyer fields are:

```text
address
city
state
lga
postalCode
latitude
longitude
```

Recommended flow:

1. Load values from users/{uid}.
2. Show address, city, state, LGA, and postal code fields.
3. Optionally obtain latitude and longitude from a map or device location.
4. Ask for location permission only when the user chooses map location.
5. Validate required location fields.
6. Save with SetOptions(merge: true).
7. Show the saved location on checkout and shipping forms.

Do not request device location in the background. A manually entered address must remain supported.

### Buyer referral payout account

The buyer referral payout account uses:

```http
GET  /api/referrals/payout-account
POST /api/referrals/payout-account
```

Save body:

```json
{
  "bankName": "Bank name",
  "bankCode": "000",
  "accountNumber": "0000000000"
}
```

The screen should include:

- Bank selector
- Account number input
- Account name or verification result
- Save or Update button
- Loading state during verification
- Clear error for invalid account
- Last updated time, if returned
- Masked account number after save

Do not store Nomba credentials in Flutter. Bank-list fetching and account verification should be performed through the protected web API. The app should call the same API contract used by the web referral page.

### Buyer security

The buyer security screen should support:

- Reauthentication before sensitive actions
- Change password through Firebase Auth if email/password is used
- Sign out of the current device
- Delete account
- Session-expiration handling

Do not display Firebase ID tokens or refresh tokens in the UI.

## 7. Seller settings

### Seller settings screen

The seller Settings screen should contain:

- Seller profile
- Store profile and branding
- Store visibility
- Notification preferences
- Shipping and fulfillment
- Payout and settlement account
- Subscription or Boost Store settings
- Security
- Help and Support

Seller settings must remain separate from buyer settings because seller data affects a public storefront and financial operations.

### Seller profile

Use the authenticated seller identity and seller-owned documents already used by the web dashboard.

Typical fields:

```text
users/{uid}
  displayName
  phone
  email

sellers/{uid}
  businessName
  businessPhone
  businessAddress
  verificationStatus
  updatedAt
```

The exact field names returned by the web application are authoritative. Flutter should not create a second incompatible seller profile schema.

UI:

- Business or seller name
- Contact phone
- Business email, read-only if managed by Auth
- Business address
- Verification status
- Save changes
- Link to verification requirements when unverified

### Store profile

The store settings screen should edit only the store owned by the authenticated seller.

Typical fields:

```text
stores/{storeId}
  name
  username
  description
  logoUrl
  coverUrl
  category
  phone
  address
  city
  state
  isPublished
  updatedAt
```

The seller should be able to:

- Edit store name and description
- Upload or replace logo and cover image
- Set store category
- Update contact and location
- Preview the public store
- Publish or unpublish the store where the backend permits it

Image upload should use the storage flow approved by the web application. Do not send local file paths to the API. Show upload progress and keep the old image if a replacement fails.

Publishing or unpublishing is a business action. Prefer a protected API endpoint rather than a direct client write if the current web app uses an API for it.

### Store visibility

Provide a clear switch or action:

```text
Published
Unpublished
Pending verification
Restricted
```

The UI must display the server-returned status. A client should not assume that changing a local switch successfully published the store.

After saving, refresh the seller's public store URL and show a Preview Store action.

### Seller shipping and fulfillment

The seller shipping screen should support the options available to the seller dashboard:

- Pickup address
- Delivery regions
- Courier or fulfillment preference
- Shipping fees
- Estimated delivery days
- Self-arranged delivery
- Order preparation status

Use the exact seller shipping API or Firestore fields used by the web dashboard. If no stable API exists, add a protected route before mobile release instead of granting broad Firestore writes.

Validate:

- Shipping cost is non-negative.
- Estimated days is a valid range.
- Pickup address is complete.
- Delivery region is not empty when shipping is enabled.

### Seller payout and settlement account

The seller payout screen is a financial screen and should use a protected API.

It should include:

- Bank list
- Bank code
- Account number
- Account name verification
- Masked saved account
- Save or replace account
- Verification status
- Settlement status
- Error and retry state

Never expose Nomba credentials in the Flutter app. Bank fetching, account validation, and payout account changes must be delegated to the server-side Nomba integration. If the web application has a seller payout endpoint, use that exact endpoint and response shape.

Require recent authentication for replacing a payout account and show a confirmation before saving.

### Seller subscription and Boost Store settings

If the seller account has subscription or Boost Store settings, show:

- Current plan
- Plan status
- Renewal or expiry date
- Available boost status
- Upgrade or renew action
- Payment history link

Payment and subscription changes must be initiated through the backend checkout/payment API. Flutter should not calculate final charges or mark a subscription as active locally.

## 8. Admin settings

Admin settings require stronger separation. The Flutter admin app should be a protected staff application, not merely a screen hidden behind a client-side role flag.

### Admin settings screen

The admin Settings screen should contain:

- Admin profile
- Staff management
- Roles and permissions
- Platform configuration
- Payment and payout configuration
- Notification and alert preferences
- Audit and security
- Sign out

Admin changes should be performed through admin-protected API routes. Do not allow a Flutter admin client to write arbitrary configuration documents directly.

### Admin profile

Admin profile fields may include:

```text
users/{uid}
  displayName
  phone
  email
  role
  updatedAt
```

Allow an admin to edit only personal profile fields unless a separate staff-management permission is present.

### Staff and roles

The staff management screen should be visible only to an authorized administrator. It should support, when provided by the backend:

- List staff accounts
- Invite an administrator
- Assign a role
- Revoke access
- Disable a staff account
- View last sign-in
- View permission summary

Recommended role names:

```text
admin
support
finance
operations
moderator
```

Do not let an admin assign roles by directly writing a role field from the client. Use a server endpoint that verifies the current admin's permissions and records an audit event.

### Platform configuration

Platform configuration may include:

- Maintenance mode
- Referral program configuration
- Supported currencies
- Shipping defaults
- Support contact details
- Feature flags
- Public homepage settings
- Notification templates

These values affect all users and must be loaded and saved through protected admin APIs. The UI should show the last updated time and the staff member who made the change when the backend returns those fields.

Use explicit Save buttons for platform configuration. Avoid saving every keystroke.

### Payment and payout configuration

Payment settings may include Nomba connection status, payout review settings, bank configuration, webhook health, and payout controls.

The admin UI should display:

- Connection status
- Last successful health check
- Bank-list status
- Payout queue summary
- Failed transaction count
- Webhook status
- Retry or test action where permitted

Do not show:

- Client secrets
- Private access tokens
- Full credential values
- Unmasked customer bank accounts

Use server endpoints for all payment configuration and payout actions. Every privileged action should show a confirmation dialog and an audit result.

### Admin notifications and alerts

Admin alert settings may include:

- New user registration
- New seller verification
- New dispute
- Referral payout account saved
- Payout requested
- Failed payment
- Support escalation
- Security event

Use an admin API for platform-wide alert preferences. Admin users can still consume the shared GET /api/notifications and PATCH /api/notifications/{id}/read endpoints for their personal notifications.

## 9. Suggested API repository

Create lib/core/settings/settings_repository.dart and keep endpoint names in one place.

```dart
class SettingsRepository {
  final ApiClient apiClient;

  SettingsRepository(this.apiClient);

  Future<dynamic> deleteAccount() {
    return apiClient.request('POST', '/api/account/delete');
  }

  Future<dynamic> getReferralPayoutAccount() {
    return apiClient.request('GET', '/api/referrals/payout-account');
  }

  Future<dynamic> saveReferralPayoutAccount({
    required String bankName,
    required String bankCode,
    required String accountNumber,
  }) {
    return apiClient.request(
      'POST',
      '/api/referrals/payout-account',
      body: {
        'bankName': bankName,
        'bankCode': bankCode,
        'accountNumber': accountNumber,
      },
    );
  }

  Future<dynamic> getAdminNotifications() {
    return apiClient.request('GET', '/api/notifications');
  }

  Future<dynamic> markNotificationRead(String notificationId) {
    return apiClient.request(
      'PATCH',
      '/api/notifications/' + notificationId + '/read',
    );
  }

  Future<dynamic> getAdminSetting(String key) {
    return apiClient.request('GET', '/api/admin/settings/' + key);
  }

  Future<dynamic> saveAdminSetting(String key, dynamic value) {
    return apiClient.request(
      'PATCH',
      '/api/admin/settings/' + key,
      body: {'value': value},
    );
  }
}
```

The admin settings methods are an integration pattern. Use the exact admin route names available in the deployed backend. If those endpoints do not exist, the Flutter screen should remain disabled until protected endpoints are added.

## 10. Reusable settings UI

Use consistent controls:

```text
Text field        Profile and address values
Switch            Notification and visibility preferences
Dropdown          Bank, state, LGA, category, role
List tile         Navigation to a child settings screen
Masked field      Account number and sensitive values
Status chip       Verification, publishing, payout, and subscription status
Confirmation      Delete, revoke, publish, payout, and admin actions
SnackBar          Short save result
Inline error      Field-specific validation
Retry             Network or API failure
```

Recommended page layout:

1. App bar with role-specific title.
2. Scrollable settings sections.
3. Section headings with short explanations.
4. Save button fixed at the bottom only when the form is dirty.
5. Loading overlay or disabled controls during save.
6. Error messages close to the failed field.
7. Success message after the server confirms the save.

Avoid putting all role settings into one very long screen. Use child screens for payout, store, shipping, staff, and platform configuration.

## 11. Permission matrix

```text
Setting                         Buyer       Seller       Admin
Edit own profile                Yes         Yes          Yes
Edit delivery location         Yes         No           No
Edit store profile              No          Yes          Review
Set referral payout account     Yes         If enabled   Review
Set seller settlement account   No          Yes          Review
Manage own notifications       Yes         Yes          Yes
Manage staff                    No          No           Authorized admin
Platform configuration          No          No           Authorized admin
Payment configuration           No          No           Authorized admin
Delete own account              Yes         Yes          By policy
Delete another account          No          No           Server-only
```

The matrix describes UI availability, not authorization. The server must enforce each permission.

## 12. Save and validation flow

Use the same state flow for every settings form:

```text
idle
  -> loading existing values
  -> editing
  -> dirty
  -> saving
  -> saved
  -> error with retry
```

Before saving:

- Trim strings.
- Validate required fields.
- Validate phone and email formats.
- Validate bank account number length.
- Validate numeric values such as shipping fees.
- Prevent duplicate submissions.
- Confirm destructive or financial actions.

After saving:

- Replace local state with the server response.
- Update related app-shell badges or profile headers.
- Do not assume a Firestore write succeeded until it completes.
- Refresh data when a server-side operation changes another screen.

## 13. Offline and error handling

Settings must work safely when the device is offline:

- Keep the current form values.
- Show an offline message.
- Do not discard unsaved edits.
- Enable Retry when connectivity returns.
- Do not show a false success state.
- Re-fetch sensitive values after reconnecting.

Handle these responses:

```text
401  Sign in again
403  You do not have permission
404  Setting or resource no longer exists
409  Conflict; reload and try again
422  Validation error; show field message
429  Too many requests; wait and retry
500  Server problem; retry later
```

For payout and payment settings, never retry automatically if the server may have accepted the request. Use an idempotency key when the endpoint supports it.

## 14. Security requirements

- Use Firebase Auth for identity.
- Use server authorization for role checks.
- Use Firestore security rules for user-owned documents.
- Do not trust a role sent in the request body.
- Do not trust a user ID sent in the request body.
- Do not permit admin settings through unrestricted Firestore writes.
- Mask account numbers and private financial information.
- Require recent authentication before sensitive changes.
- Log admin actions on the server.
- Validate redirect and action URLs against an allow-list.
- Use HTTPS in production.
- Clear private settings data on sign out.
- Do not write secrets to logs.

## 15. Testing plan

Test each role with separate Firebase accounts.

### Buyer tests

- Load and update profile.
- Save delivery location.
- Toggle notification preferences.
- Fetch and update referral payout account.
- Reauthenticate before account deletion.
- Confirm buyer cannot read seller or admin settings.

### Seller tests

- Update seller profile.
- Update store profile and visibility.
- Save shipping settings.
- Fetch and verify seller payout account.
- View subscription or boost status.
- Confirm seller cannot access admin settings.

### Admin tests

- Load admin profile.
- Confirm unauthorized staff cannot see staff management.
- Assign and revoke staff roles through the protected API.
- Update platform configuration.
- View payment and payout health without exposing secrets.
- Verify audit records are created for privileged changes.

### General tests

- Expired Firebase token.
- Network loss while saving.
- Duplicate taps on Save.
- Back navigation with unsaved changes.
- App restart after a successful save.
- Different permissions for admin, support, finance, and operations roles.
- Android and iOS notification permissions.

## 16. Recommended implementation order

1. Implement shared Account, Security, Sign out, and Delete Account behavior.
2. Implement shared notification preferences.
3. Add buyer delivery location and referral payout settings.
4. Add seller profile and store settings.
5. Add seller shipping and settlement settings.
6. Add admin profile and personal notifications.
7. Add protected staff management.
8. Add platform and payment configuration only after the admin API contract is confirmed.
9. Add validation, offline handling, audit feedback, and role-based tests.
10. Release only after Firestore rules and API authorization have been tested with separate accounts.

A shared Flutter settings UI is appropriate, but data ownership and permissions must remain role-specific. The buyer, seller, and admin screens should reuse components without sharing unrestricted write access.

