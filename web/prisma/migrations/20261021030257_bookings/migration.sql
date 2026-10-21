-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "ChangeLog" ADD COLUMN     "reservationId" TEXT,
ALTER COLUMN "meetingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RoomReservation" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE';

-- AddForeignKey
ALTER TABLE "ChangeLog" ADD CONSTRAINT "ChangeLog_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "RoomReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

