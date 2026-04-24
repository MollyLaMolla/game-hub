-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- AlterEnum
ALTER TYPE "LobbyStatus" ADD VALUE 'SEARCHING';

-- AlterTable
ALTER TABLE "Lobby" ADD COLUMN     "currentMatchId" TEXT;

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "gameKey" "GameKey" NOT NULL,
    "queueType" "LobbyQueueType" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalPlayers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_gameKey_queueType_status_idx" ON "Match"("gameKey", "queueType", "status");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_idx" ON "MatchParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_userId_key" ON "MatchParticipant"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_seatIndex_key" ON "MatchParticipant"("matchId", "seatIndex");

-- CreateIndex
CREATE INDEX "Lobby_currentMatchId_idx" ON "Lobby"("currentMatchId");

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_currentMatchId_fkey" FOREIGN KEY ("currentMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
