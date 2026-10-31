CREATE TABLE "ProfilePhoto" (
    "userId" TEXT NOT NULL,
    "avatarId" TEXT,
    "image" BYTEA,
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "ProfilePhoto_content_check" CHECK (
      ("avatarId" IS NOT NULL AND "image" IS NULL AND "avatarId" IN ('scholar-1','scholar-2','scholar-3','scholar-4','scholar-5','scholar-6','books','justice'))
      OR ("avatarId" IS NULL AND "image" IS NOT NULL AND octet_length("image") BETWEEN 1 AND 262144)
    ),
    CONSTRAINT "ProfilePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- No browser/Supabase REST policies: this table is accessed only through the
-- authenticated backend. The migration owner (or a dedicated trusted backend
-- role with BYPASSRLS) retains access. Untrusted roles cannot read private bytes
-- even on hosts whose default privileges grant SELECT on new public tables.
ALTER TABLE "ProfilePhoto" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ProfilePhoto" FROM PUBLIC;
