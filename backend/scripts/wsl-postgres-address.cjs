const LOOPBACK_IPV4 = '127.0.0.1';

function normalizeLoopbackAddress(address) {
  if (address === LOOPBACK_IPV4 || address === `${LOOPBACK_IPV4}/32`) return LOOPBACK_IPV4;
  return address;
}

function parseIdentityPayload(payload, source) {
  if (typeof payload !== 'string' || !payload.trim()) {
    throw new Error(`${source} returned an empty PostgreSQL identity response.`);
  }
  let identity;
  try { identity = JSON.parse(payload); }
  catch { throw new Error(`${source} returned invalid JSON for the PostgreSQL identity.`); }
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new Error(`${source} returned an invalid PostgreSQL identity object.`);
  }
  const fields = ['database', 'username', 'address', 'port', 'systemIdentifier', 'versionMajor'];
  for (const field of fields) {
    if (!Object.hasOwn(identity, field)) throw new Error(`${source} PostgreSQL identity is missing field '${field}'.`);
  }
  identity.address = normalizeLoopbackAddress(identity.address);
  return identity;
}

function parsePsqlIdentityOutput(output) {
  if (typeof output !== 'string' || !output.trim()) {
    throw new Error('WSL psql returned no PostgreSQL identity row.');
  }
  const lines = output.trim().split(/\r?\n/);
  if (lines.length !== 1) throw new Error('WSL psql returned an unexpected number of PostgreSQL identity rows.');
  return parseIdentityPayload(lines[0], 'WSL psql');
}

function parsePrismaIdentityRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || !Object.hasOwn(rows[0], 'identity')) {
    throw new Error('Windows Prisma returned no PostgreSQL identity row in the expected `identity` column.');
  }
  return parseIdentityPayload(rows[0].identity, 'Windows Prisma');
}

module.exports = { normalizeLoopbackAddress, parsePsqlIdentityOutput, parsePrismaIdentityRows };
