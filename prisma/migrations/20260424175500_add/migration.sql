-- CreateEnum
CREATE TYPE "GameKey" AS ENUM ('TICTACTOE');

-- CreateEnum
CREATE TYPE "LobbyQueueType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LobbyStatus" AS ENUM ('OPEN', 'IN_PROGRESS');

-- CreateTable
CREATE TABLE "Lobby" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "gameKey" "GameKey" NOT NULL,
    "queueType" "LobbyQueueType" NOT NULL,
    "status" "LobbyStatus" NOT NULL DEFAULT 'OPEN',
    "inviteCode" VARCHAR(12) NOT NULL,
    "partySize" INTEGER NOT NULL,
    "totalPlayers" INTEGER NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyMember" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lobby_inviteCode_key" ON "Lobby"("inviteCode");

-- CreateIndex
CREATE INDEX "Lobby_ownerId_status_idx" ON "Lobby"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Lobby_status_updatedAt_idx" ON "Lobby"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "LobbyMember_userId_idx" ON "LobbyMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyMember_lobbyId_userId_key" ON "LobbyMember"("lobbyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyMember_lobbyId_slotIndex_key" ON "LobbyMember"("lobbyId", "slotIndex");

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyMember" ADD CONSTRAINT "LobbyMember_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyMember" ADD CONSTRAINT "LobbyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
