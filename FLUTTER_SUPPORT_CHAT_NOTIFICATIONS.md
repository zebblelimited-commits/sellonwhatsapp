# Flutter Support Chat and Notifications Integration

This guide describes how to implement support chat and notifications in the Flutter application so the same feature works consistently for buyers, sellers, and administrators.

The implementation follows the existing SellOnWhatsApp backend model:

- Firebase Authentication identifies the signed-in user.
- Protected API calls send a Firebase ID token as a Bearer token.
- Firestore provides realtime chat and notification updates where the existing web client already uses realtime data.
- The server determines the actor and role from the authenticated token. Flutter must never treat a client-provided user ID as proof of authorization.

This document is designed to be used with FLUTTER_API_INTEGRATION.md and NAVIGATION DRAWER.md.

## 1. Feature goals

Support chat should allow:

- A buyer to start or continue a conversation with a seller.
- A seller to answer buyer conversations.
- An administrator to monitor and respond to support conversations.
- All participants to see message history in realtime.
- Messages to be marked read.
- Chat lists to show unread counts, latest message, timestamp, and status.

Notifications should allow:

- A buyer, seller, or admin to see notifications for their own account.
- Unread counts to appear in the app bar, drawer, and dashboard.
- A notification to be marked read.
- A notification tap to open the related order, dispute, payout, chat, or other destination.
- Expired authentication and failed API requests to be handled without crashing the app.

## 2. Suggested Flutter project structure

Create these files in the Flutter project:

```text
lib/
  core/
    api/api_client.dart
    auth/session_manager.dart
    notifications/notification_model.dart
    notifications/notification_repository.dart
    widgets/notification_bell.dart
    widgets/unread_badge.dart
  features/
    chat/
      data/chat_model.dart
      data/chat_message_model.dart
      data/chat_repository.dart
      presentation/chat_list_screen.dart
      presentation/chat_thread_screen.dart
      presentation/message_composer.dart
    buyer/
      buyer_shell.dart
    seller/
      seller_shell.dart
    admin/
      admin_shell.dart
    notifications/
      notifications_screen.dart
  app/
    app_routes.dart
```

The shared repositories should receive the same authenticated ApiClient used by the rest of the Flutter app.

## 3. Authentication and API client requirements

All protected requests must include:

```http
Authorization: Bearer FIREBASE_ID_TOKEN
Content-Type: application/json
Accept: application/json
```

The ID token must be obtained from the current Firebase user:

```dart
final user = FirebaseAuth.instance.currentUser;
if (user == null) {
  throw ApiException(401, 'Please sign in again');
}

final token = await user.getIdToken();
```

Do not place Firebase Admin credentials, Nomba secrets, or server environment variables in Flutter.

A 401 response means that the user is signed out or the token is no longer accepted. The app should:

1. Stop the current request.
2. Refresh or reload the Firebase session when appropriate.
3. Redirect to login if the user is no longer authenticated.
4. Clear private cached chat and notification data.

## 4. Support chat data model

The web application uses support_chats for chat rooms and a messages subcollection for message history.

Recommended chat room fields:

```text
support_chats/{chatId}
  buyerId
  sellerId
  adminId or assignedAdminId
  participantIds
  participantRoles
  subject
  orderId
  status
  lastMessage
  lastMessageAt
  lastMessageSenderId
  unreadBy
  createdAt
  updatedAt
```

Recommended message fields:

```text
support_chats/{chatId}/messages/{messageId}
  senderId
  senderRole
  content
  timestamp
  readBy
  attachments
```

The exact fields returned by the backend are authoritative. Flutter should use null-safe parsing and tolerate fields being absent.

Suggested Dart models:

```dart
class ChatRoom {
  final String id;
  final String? subject;
  final String? orderId;
  final String? status;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;

  const ChatRoom({
    required this.id,
    this.subject,
    this.orderId,
    this.status,
    this.lastMessage,
    this.lastMessageAt,
    this.unreadCount = 0,
  });

  factory ChatRoom.fromFirestore(String id, Map<String, dynamic> data) {
    final rawDate = data['lastMessageAt'];
    return ChatRoom(
      id: id,
      subject: data['subject']?.toString(),
      orderId: data['orderId']?.toString(),
      status: data['status']?.toString(),
      lastMessage: data['lastMessage']?.toString(),
      lastMessageAt: rawDate is Timestamp ? rawDate.toDate() : null,
      unreadCount: data['unreadCount'] is int ? data['unreadCount'] as int : 0,
    );
  }
}

class ChatMessage {
  final String id;
  final String content;
  final String? senderId;
  final String? senderRole;
  final DateTime? timestamp;
  final List<String> readBy;

  const ChatMessage({
    required this.id,
    required this.content,
    this.senderId,
    this.senderRole,
    this.timestamp,
    this.readBy = const [],
  });

  factory ChatMessage.fromFirestore(String id, Map<String, dynamic> data) {
    final rawDate = data['timestamp'];
    return ChatMessage(
      id: id,
      content: data['content']?.toString() ?? '',
      senderId: data['senderId']?.toString(),
      senderRole: data['senderRole']?.toString(),
      timestamp: rawDate is Timestamp ? rawDate.toDate() : null,
      readBy: List<String>.from(data['readBy'] ?? const []),
    );
  }
}
```

Add cloud_firestore imports to the model file if Timestamp is used.

## 5. Chat API contract

The existing chat API supports these operations.

### Start a conversation

```http
POST /api/chats
```

Request body for a buyer starting a seller conversation:

```json
{
  "participantId": "SELLER_ID",
  "participantRole": "vendor"
}
```

The authenticated user is the buyer. Do not send a buyerId field as an authorization substitute.

For a seller starting or opening an admin conversation, use the participant role expected by the backend implementation. Keep this value in one role-aware repository method rather than scattering strings throughout the UI.

### Send a message

```http
POST /api/chats/{chatId}/messages
```

Request body:

```json
{
  "content": "Message text"
}
```

The API should derive senderId and senderRole from the Firebase token.

### Mark a chat as read

```http
POST /api/chats/{chatId}/read
```

Call this when:

- The thread opens.
- New messages are displayed while the thread is active.
- The app returns to the foreground while the thread is visible.

### Example repository

Create lib/features/chat/data/chat_repository.dart:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/api/api_client.dart';
import 'chat_message_model.dart';
import 'chat_model.dart';

class ChatRepository {
  final ApiClient apiClient;
  final FirebaseFirestore firestore;

  ChatRepository({
    required this.apiClient,
    FirebaseFirestore? firestore,
  }) : firestore = firestore ?? FirebaseFirestore.instance;

  Stream<List<ChatRoom>> watchBuyerChats(String buyerId) {
    return firestore
        .collection('support_chats')
        .where('buyerId', isEqualTo: buyerId)
        .orderBy('lastMessageAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ChatRoom.fromFirestore(doc.id, doc.data()))
            .toList());
  }

  Stream<List<ChatRoom>> watchSellerChats(String sellerId) {
    return firestore
        .collection('support_chats')
        .where('sellerId', isEqualTo: sellerId)
        .orderBy('lastMessageAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ChatRoom.fromFirestore(doc.id, doc.data()))
            .toList());
  }

  Stream<List<ChatRoom>> watchAdminChats() {
    return firestore
        .collection('support_chats')
        .orderBy('lastMessageAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ChatRoom.fromFirestore(doc.id, doc.data()))
            .toList());
  }

  Stream<List<ChatMessage>> watchMessages(String chatId) {
    return firestore
        .collection('support_chats')
        .doc(chatId)
        .collection('messages')
        .orderBy('timestamp')
        .snapshots()
        .map((snapshot) => snapshot.docs
            .map((doc) => ChatMessage.fromFirestore(doc.id, doc.data()))
            .toList());
  }

  Future<dynamic> startSellerChat(String sellerId) {
    return apiClient.request('POST', '/api/chats', body: {
      'participantId': sellerId,
      'participantRole': 'vendor',
    });
  }

  Future<dynamic> sendMessage(String chatId, String content) {
    return apiClient.request(
      'POST',
      '/api/chats/$chatId/messages',
      body: {'content': content.trim()},
    );
  }

  Future<dynamic> markRead(String chatId) {
    return apiClient.request('POST', '/api/chats/$chatId/read');
  }
}
```

Add the imports for FirebaseAuth, cloud_firestore, ChatRoom, and ChatMessage in the actual project. The repository above shows the contract and query pattern; adapt the role-specific query to the exact security rules deployed in Firebase.

## 6. Support chat UI

### Chat list screen

The chat list should include:

- App bar title: Support Chat.
- New conversation button where applicable.
- Search or filter by order, subject, or status.
- Latest message preview.
- Relative timestamp.
- Unread badge.
- Participant name or role.
- Empty state with a Start a conversation action.
- Error state with Retry.
- Pull-to-refresh for API-backed metadata, although Firestore listeners update chat data automatically.

Example screen pattern:

```dart
class ChatListScreen extends StatelessWidget {
  final ChatRepository repository;
  final String userId;
  final String role;

  const ChatListScreen({
    super.key,
    required this.repository,
    required this.userId,
    required this.role,
  });

  Stream<List<ChatRoom>> stream() {
    if (role == 'seller') return repository.watchSellerChats(userId);
    if (role == 'admin') return repository.watchAdminChats();
    return repository.watchBuyerChats(userId);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ChatRoom>>(
      stream: stream(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('Unable to load conversations'));
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        final chats = snapshot.data!;
        if (chats.isEmpty) {
          return const Center(
            child: Text('No support conversations yet'),
          );
        }

        return ListView.builder(
          itemCount: chats.length,
          itemBuilder: (context, index) {
            final chat = chats[index];
            return ListTile(
              title: Text(chat.subject ?? 'Support conversation'),
              subtitle: Text(chat.lastMessage ?? 'No messages yet'),
              trailing: chat.unreadCount == 0
                  ? null
                  : CircleAvatar(
                      radius: 12,
                      child: Text(chat.unreadCount.toString()),
                    ),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ChatThreadScreen(
                      repository: repository,
                      chatId: chat.id,
                      currentUserId: userId,
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}
```

### Chat thread screen

The thread should:

1. Subscribe to messages ordered by timestamp ascending.
2. Scroll to the newest message after the first load.
3. Show incoming messages on the left and current-user messages on the right.
4. Disable Send when the input is empty.
5. Show an optimistic sending indicator.
6. Retry failed messages without duplicating them.
7. Call markRead when opened.
8. Dispose the text controller and scroll controller.

Example thread pattern:

```dart
class ChatThreadScreen extends StatefulWidget {
  final ChatRepository repository;
  final String chatId;
  final String currentUserId;

  const ChatThreadScreen({
    super.key,
    required this.repository,
    required this.chatId,
    required this.currentUserId,
  });

  @override
  State<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends State<ChatThreadScreen> {
  final input = TextEditingController();
  final scroll = ScrollController();
  bool sending = false;

  @override
  void initState() {
    super.initState();
    widget.repository.markRead(widget.chatId);
  }

  @override
  void dispose() {
    input.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> send() async {
    final text = input.text.trim();
    if (text.isEmpty || sending) return;

    setState(() => sending = true);
    input.clear();
    try {
      await widget.repository.sendMessage(widget.chatId, text);
      await widget.repository.markRead(widget.chatId);
    } catch (_) {
      if (mounted) {
        input.text = text;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Message could not be sent')),
        );
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Support conversation')),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<List<ChatMessage>>(
              stream: widget.repository.watchMessages(widget.chatId),
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final messages = snapshot.data!;
                return ListView.builder(
                  controller: scroll,
                  padding: const EdgeInsets.all(16),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final message = messages[index];
                    final mine =
                        message.senderId == widget.currentUserId;
                    return Align(
                      alignment: mine
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Card(
                        color: mine
                            ? Theme.of(context).colorScheme.primaryContainer
                            : null,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(message.content),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: input,
                    minLines: 1,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      hintText: 'Write a message',
                    ),
                  ),
                ),
                IconButton(
                  onPressed: sending ? null : send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

For attachments, upload the file to the project-approved storage service first, then send a permitted attachment reference. Do not send arbitrary local file paths to the API.

## 7. Role-specific chat flow

### Buyer flow

1. Buyer opens a product, order, or the Chat Support drawer item.
2. Buyer selects Start chat or an existing conversation.
3. Flutter calls POST /api/chats with participantId sellerId and participantRole vendor when starting a seller conversation.
4. The app opens the chat thread.
5. Messages are streamed from the chat messages subcollection.
6. Buyer sends messages through POST /api/chats/{chatId}/messages.
7. Buyer opens a dispute from the order screen when the issue is order-related.
8. Buyer sees unread chat notifications in the drawer and app bar.

### Seller flow

1. Seller opens Chat Support from the seller dashboard.
2. The list is scoped to seller-owned chats.
3. Seller opens a conversation and sees the buyer, order reference, status, and history.
4. Seller responds through the same message API.
5. Seller marks the thread read when it is opened.
6. Seller can navigate to the related order, buyer, or dispute.
7. Seller cannot access unrelated buyer conversations.

### Admin flow

1. Admin opens the Support Chat area in the admin shell.
2. Admin sees conversations available to the admin role, with filters for open, waiting, resolved, buyer, seller, and order ID.
3. Admin opens a thread and can reply.
4. Admin can assign or change status only when a dedicated admin endpoint and permission exist.
5. Admin can link to the related order, dispute, payout, or account.
6. Every admin action should show a confirmation and an audit-friendly timestamp.

Do not expose admin-only controls merely because the Flutter user can see an admin screen. Enforce the permission on the server.

## 8. Notifications data contract

The existing notification API is:

```http
GET /api/notifications
PATCH /api/notifications/{id}/read
```

Both endpoints require a Firebase Bearer token.

The GET response has the shape:

```json
{
  "notifications": [],
  "unreadCount": 0
}
```

The returned notification fields may include:

```text
id
title
message
type
read
createdAt
orderId
disputeId
chatId
payoutId
actionUrl
metadata
```

Use null-safe parsing because optional related IDs may not exist for every notification.

Suggested model:

```dart
class AppNotification {
  final String id;
  final String title;
  final String message;
  final String? type;
  final bool read;
  final DateTime? createdAt;
  final String? orderId;
  final String? disputeId;
  final String? chatId;
  final String? actionUrl;

  const AppNotification({
    required this.id,
    required this.title,
    required this.message,
    this.type,
    this.read = false,
    this.createdAt,
    this.orderId,
    this.disputeId,
    this.chatId,
    this.actionUrl,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final rawDate = json['createdAt'];
    return AppNotification(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? '',
      type: json['type']?.toString(),
      read: json['read'] == true,
      createdAt: rawDate is String ? DateTime.tryParse(rawDate) : null,
      orderId: json['orderId']?.toString(),
      disputeId: json['disputeId']?.toString(),
      chatId: json['chatId']?.toString(),
      actionUrl: json['actionUrl']?.toString(),
    );
  }
}
```

## 9. Notification repository

Create lib/core/notifications/notification_repository.dart:

```dart
import '../../core/api/api_client.dart';
import 'notification_model.dart';

class NotificationPage {
  final List<AppNotification> notifications;
  final int unreadCount;

  const NotificationPage({
    required this.notifications,
    required this.unreadCount,
  });
}

class NotificationRepository {
  final ApiClient apiClient;

  NotificationRepository(this.apiClient);

  Future<NotificationPage> fetch() async {
    final result = await apiClient.request('GET', '/api/notifications');
    final map = Map<String, dynamic>.from(result as Map);
    final rawList = List<dynamic>.from(map['notifications'] ?? const []);

    return NotificationPage(
      notifications: rawList
          .map((item) => AppNotification.fromJson(
                Map<String, dynamic>.from(item as Map),
              ))
          .toList(),
      unreadCount: (map['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }

  Future<void> markRead(String notificationId) async {
    await apiClient.request(
      'PATCH',
      '/api/notifications/$notificationId/read',
    );
  }
}
```

Refresh notifications:

- On app startup after authentication.
- When the app returns to the foreground.
- After a chat message, purchase, dispute, referral, payout, or shipping action.
- When the user pulls to refresh.
- When the notification screen becomes visible.

Do not poll aggressively. A refresh interval of 30 to 60 seconds is reasonable if push notifications are not implemented.

## 10. Notifications user interface

### App bar bell

Create a reusable NotificationBell widget:

```dart
class NotificationBell extends StatelessWidget {
  final int unreadCount;
  final VoidCallback onPressed;

  const NotificationBell({
    super.key,
    required this.unreadCount,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          onPressed: onPressed,
          icon: const Icon(Icons.notifications_outlined),
        ),
        if (unreadCount > 0)
          Positioned(
            right: 5,
            top: 5,
            child: CircleAvatar(
              radius: 9,
              child: Text(
                unreadCount > 99 ? '99+' : unreadCount.toString(),
                style: const TextStyle(fontSize: 9),
              ),
            ),
          ),
      ],
    );
  }
}
```

Use this in all three shells:

- BuyerShell
- SellerShell
- AdminShell

The badge should be small and should not move the app bar layout when the count changes.

### Drawer item

Add Notifications below or near Chat Support:

```dart
ListTile(
  leading: const Icon(Icons.notifications_outlined),
  title: const Text('Notifications'),
  trailing: unreadCount == 0
      ? null
      : CircleAvatar(
          radius: 11,
          child: Text(unreadCount.toString()),
        ),
  onTap: openNotifications,
)
```

### Notification list screen

The screen should include:

- Pull-to-refresh.
- Unread and all filters.
- Clear read/unread visual distinction.
- Title, message, and time.
- Related entity label such as Order, Chat, Dispute, Payout, or Shipping.
- Empty state.
- Retry state.
- Read action.
- Navigation when a notification is tapped.

Recommended interaction:

1. User taps an unread notification.
2. Mark it read through PATCH /api/notifications/{id}/read.
3. Update the local list immediately.
4. Navigate using the related IDs or actionUrl.
5. If navigation data is missing, remain on the notification screen.

## 11. Notification routing logic

Do not navigate blindly to an arbitrary URL received from a notification. Prefer a typed route mapping:

```dart
void openNotification(
  BuildContext context,
  AppNotification notification,
) {
  if (notification.chatId != null) {
    Navigator.pushNamed(
      context,
      '/chat/thread',
      arguments: notification.chatId,
    );
    return;
  }

  if (notification.disputeId != null) {
    Navigator.pushNamed(
      context,
      '/buyer/disputes/detail',
      arguments: notification.disputeId,
    );
    return;
  }

  if (notification.orderId != null) {
    Navigator.pushNamed(
      context,
      '/orders/detail',
      arguments: notification.orderId,
    );
    return;
  }

  if (notification.actionUrl != null) {
    // Only allow actionUrl after validating it against an allow-list
    // of routes supported by the Flutter app.
  }
}
```

Map routes by role. For example, an order route may open a buyer order view for a buyer, seller order management for a seller, and an admin order view for an admin.

## 12. Unread state management

Use one shared state holder for chat and notifications so the drawer, app bar, and dashboard do not each make independent requests.

A minimal controller can expose:

```text
notificationState.notifications
notificationState.unreadCount
notificationState.loading
notificationState.error
notificationState.refresh()
notificationState.markRead(id)
```

When marking read:

1. Update local state optimistically.
2. Call the PATCH endpoint.
3. If the request fails, restore the previous read state and show Retry.
4. Refresh the server state after multiple read operations.

Chat unread counts may come from chat documents while general notification unreadCount comes from the notifications API. Display the values separately or combine them only when the product design explicitly calls for a combined badge.

## 13. Admin, seller, and buyer navigation layout

### Buyer shell

Drawer items:

- My Purchases
- Shipping
- Disputes
- Refer & Earn
- Chat Support
- Notifications
- Account
- Settings

The buyer chat list must be scoped to buyer-owned chats.

### Seller shell

Sidebar or drawer items:

- Store dashboard
- Orders
- Products
- Chat Support
- Notifications
- Referral or subscription tools
- Settings

The seller chat list must be scoped to seller-owned chats. A seller can reply to buyers and see related order information only when permitted by the server.

### Admin shell

Sidebar items:

- Dashboard
- Users
- Orders
- Disputes
- Support Chat
- Notifications
- Referral payouts
- Stores
- Settings

Admin chat and notification screens may have filters, assignment, and moderation controls, but those controls must be protected by server-side admin authorization.

## 14. Realtime versus API behavior

Use Firestore listeners for:

- Chat room list updates.
- Chat message updates.
- Typing or last-message updates if the backend stores them in Firestore.

Use API requests for:

- Starting a conversation.
- Sending a message.
- Marking chat read.
- Fetching notifications.
- Marking notifications read.
- Admin-only mutations.
- Any operation that performs validation, authorization, or a business transaction.

If Firestore listeners are unavailable or fail, show a retry state. Do not silently fall back to reading another user's records.

## 15. Firestore indexes

The following indexes may be required:

```text
support_chats:
  buyerId ascending
  lastMessageAt descending

support_chats:
  sellerId ascending
  lastMessageAt descending

support_chats/{chatId}/messages:
  timestamp ascending
```

Create the exact indexes suggested by Firebase for the deployed project. Security rules must ensure:

- Buyers read only chats in which they are participants.
- Sellers read only chats in which they are participants.
- Admins read only when their authenticated role is admin.
- Users cannot write arbitrary message senderId or role values.
- A client cannot change another user's unread or authorization fields.

## 16. Error and offline handling

Display friendly states for:

- No signed-in user.
- 401 Unauthorized.
- 403 Forbidden.
- 404 chat or notification no longer exists.
- 429 rate limit.
- 500 server error.
- Network timeout or offline mode.

For sending messages:

- Keep unsent text after failure.
- Do not duplicate a message when retrying.
- Disable the send button while the request is in flight.
- Show a retry action.

For notifications:

- Keep the last successful list in memory.
- Show stale data with a refresh action when offline.
- Do not mark an item read locally forever if the API call failed.

## 17. Testing plan

Test with separate buyer, seller, and admin accounts:

1. Buyer starts a seller chat.
2. Seller sees the new conversation.
3. Seller replies.
4. Buyer receives the reply in realtime.
5. Both sides see read state change.
6. Admin can see only the conversations allowed by the admin role.
7. Buyer cannot query a seller-only or admin-only chat.
8. User receives a notification and the unread badge increases.
9. Tapping it marks it read and opens the correct destination.
10. Expired authentication redirects to login.
11. Network failure leaves a recoverable UI state.
12. Multiple rapid taps do not send duplicate messages or mark-read requests incorrectly.

## 18. Implementation order

Implement in this order:

1. Reuse the existing Firebase Auth and ApiClient.
2. Add ChatRoom and ChatMessage models.
3. Add ChatRepository and Firestore listeners.
4. Build ChatListScreen and ChatThreadScreen.
5. Add buyer chat flow.
6. Add seller chat flow.
7. Add admin chat flow and only the server-approved admin actions.
8. Add AppNotification and NotificationRepository.
9. Add the shared notification state holder.
10. Add the notification bell and drawer item to all three shells.
11. Build NotificationsScreen and typed notification routing.
12. Add indexes, security-rule tests, offline states, and release testing.

The same UI components can be shared across roles, but the query scope, available actions, and server authorization must remain role-specific.

