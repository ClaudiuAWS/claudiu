from dataclasses import dataclass
from typing import Optional

@dataclass
class CreateRoomRequest:
    matchId: str
    userId: str
    displayName: str

@dataclass
class JoinRoomRequest:
    userId: str
    displayName: str

@dataclass
class Room:
    roomCode: str
    matchId: str
    hostUserId: str
    members: list
    status: str
    createdAt: str
    TTL: int