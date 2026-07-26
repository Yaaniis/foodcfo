-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "sourceFileUrl",
ADD COLUMN     "sourceFileData" BYTEA NOT NULL,
ADD COLUMN     "sourceFileMimeType" TEXT NOT NULL;
