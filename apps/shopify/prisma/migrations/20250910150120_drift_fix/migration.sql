/*
  Warnings:

  - A unique constraint covering the columns `[shopDomain,shopCustomerId]` on the table `CustomerProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CustomerProfile_shopDomain_shopCustomerId_idx";

-- CreateTable
CREATE TABLE "SizingRules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "smallMaxCm" INTEGER NOT NULL DEFAULT 165,
    "mediumMaxCm" INTEGER NOT NULL DEFAULT 180,
    "labelsCsv" TEXT NOT NULL DEFAULT 'S,M,L',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SizingRules_shopDomain_key" ON "SizingRules"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_shopDomain_shopCustomerId_key" ON "CustomerProfile"("shopDomain", "shopCustomerId");
