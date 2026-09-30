-- DropIndex
DROP INDEX "RoomReservation_externalId_key";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_googleCalendarId_key" ON "Room"("googleCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomReservation_roomId_externalId_key" ON "RoomReservation"("roomId", "externalId");

