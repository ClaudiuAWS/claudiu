# Rooms Feature

## Overview

Users can create or join rooms to watch matches together. Each room has a unique 6-character code. One user is the host, others are members.

## Rules

- **One room per user**: You can't be in multiple rooms at once
- **Host destroys room**: When the host leaves, the room is deleted
- **Members leave room**: When a member leaves, they're removed but the room stays

## Data Model

### DynamoDB Table: `claudiu-rooms`

**Partition Key**: `roomCode` (String)

**Attributes**:
- `roomCode`: 6-character uppercase code (e.g., "XNJTYS")
- `matchId`: Match identifier (e.g., "DFL-MAT-111111")
- `hostUserId`: Cognito user ID of the host
- `members`: List of member objects
  - `userId`: Cognito user ID
  - `displayName`: User's display name
  - `joinedAt`: ISO timestamp
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

**Example**:
```json
{
  "roomCode": "XNJTYS",
  "matchId": "DFL-MAT-111111",
  "hostUserId": "d3746892-e081-7091-2435-75a8aa711a95",
  "members": [
    {
      "userId": "d3746892-e081-7091-2435-75a8aa711a95",
      "displayName": "Rodrygo",
      "joinedAt": "2026-04-03T08:14:32.123Z"
    }
  ],
  "createdAt": "2026-04-03T08:14:32.123Z",
  "updatedAt": "2026-04-03T08:14:32.123Z"
}
```

## API Endpoints

### POST /rooms
Create a new room.

**Request**:
```json
{
  "matchId": "DFL-MAT-111111"
}
```

**Response** (201):
```json
{
  "roomCode": "XNJTYS",
  "matchId": "DFL-MAT-111111",
  "hostUserId": "d3746892-e081-7091-2435-75a8aa711a95",
  "members": [...],
  "createdAt": "2026-04-03T08:14:32.123Z",
  "updatedAt": "2026-04-03T08:14:32.123Z"
}
```

**Errors**:
- 400: User already in another room

### GET /rooms/{code}
Get room details.

**Response** (200):
```json
{
  "roomCode": "XNJTYS",
  "matchId": "DFL-MAT-111111",
  "hostUserId": "d3746892-e081-7091-2435-75a8aa711a95",
  "members": [...],
  "createdAt": "2026-04-03T08:14:32.123Z",
  "updatedAt": "2026-04-03T08:14:32.123Z"
}
```

**Errors**:
- 404: Room not found

### POST /rooms/{code}/join
Join an existing room.

**Response** (200):
```json
{
  "roomCode": "XNJTYS",
  "matchId": "DFL-MAT-111111",
  "hostUserId": "d3746892-e081-7091-2435-75a8aa711a95",
  "members": [...],
  "createdAt": "2026-04-03T08:14:32.123Z",
  "updatedAt": "2026-04-03T08:14:32.123Z"
}
```

**Errors**:
- 400: User already in another room
- 404: Room not found

### DELETE /rooms/{code}/leave
Leave a room.

**Response** (200):
```json
{
  "deleted": true
}
```
or
```json
{
  "deleted": false
}
```

**Behavior**:
- If host leaves: `deleted: true` (room is destroyed)
- If member leaves: `deleted: false` (member removed from room)

**Errors**:
- 404: Room not found
- 400: User not in this room

## Backend Implementation

### Lambda: `claudiu-rooms`

**Handler**: `backend/rooms/handler.py`

**Service**: `backend/rooms/service.py`

**Key Functions**:
- `create_room(match_id, user_id, display_name)`: Creates room, checks if user already in another room
- `get_room(room_code)`: Fetches room by code
- `join_room(room_code, user_id, display_name)`: Adds user to room, checks if user already in another room
- `leave_room(room_code, user_id)`: Removes user or deletes room if host

**IAM Permissions**:
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:Scan` (to check if user is in another room)

## Frontend Implementation

### Hook: `useRoom.js`

**Functions**:
- `createRoom(matchId)`: Creates a new room
- `joinRoom(roomCode)`: Joins an existing room
- `leaveRoom()`: Leaves current room
- `fetchRoom(roomCode)`: Fetches room details

**Polling**: Fetches room every 3 seconds to detect new members or room deletion

**Local Storage**: Stores `roomCode` to persist across page reloads

### UI: `LobbyPage.jsx`

**States**:
- No room: Shows "Create Room" and "Join Room" buttons
- In room: Shows room code, members list, and "Destroy room" (host) or "Leave room" (member) button

**Components**:
- `RoomCodeDisplay`: Shows room code with copy button
- `MembersList`: Shows all members with host badge

## Authentication

All endpoints require Cognito ID token in `Authorization: Bearer <token>` header.

User info extracted from token claims:
- `sub`: User ID
- `name`: Display name

## Error Handling

Frontend catches errors and:
- Logs to CloudWatch via logger service
- Shows error message to user
- Clears local state if room no longer exists
