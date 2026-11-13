-- Additive application details. Existing institutions remain unchanged.
ALTER TABLE "User" ADD COLUMN "registrationIntent" TEXT;
ALTER TABLE "Institution"
  ADD COLUMN "tradeName" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "representativePosition" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "institutionType" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "addressComplement" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "representativePhone" TEXT,
  ADD COLUMN "representationDeclaration" BOOLEAN,
  ADD COLUMN "representationDeclaredAt" TIMESTAMP(3),
  ADD COLUMN "representationDeclarationVersion" TEXT,
  ADD COLUMN "representationEvidence" TEXT;
