-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "shopCustomerId" TEXT NOT NULL,
    "heightCentimetres" REAL,
    "activeModelRunId" TEXT,
    "lastUpdatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "shopCustomerId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL,
    "modelVersion" INTEGER NOT NULL DEFAULT 1,
    "meshObjectKey" TEXT,
    "previewImageKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedByRunId" TEXT
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "browserSessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "objectKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sha256" TEXT,
    "bytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- CreateIndex
CREATE INDEX "CustomerProfile_shopDomain_shopCustomerId_idx" ON "CustomerProfile"("shopDomain", "shopCustomerId");

-- CreateIndex
CREATE INDEX "ModelRun_shopDomain_shopCustomerId_idx" ON "ModelRun"("shopDomain", "shopCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");
