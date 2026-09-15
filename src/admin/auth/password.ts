/**
 * Password hashing with Node's built-in scrypt (memory-hard, no native deps).
 * Stored format: `scrypt$N$r$p$saltB64$hashB64`, so parameters can be raised later
 * without invalidating existing hashes. No Astro imports — the CLI uses it too.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))),
  );

/** If you raise these, raise the accepted bounds in verifyPassword too. */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: 128 * PARAMS.N * PARAMS.r * 2 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Parameters are read back from the stored string, so they're validated before
 * use: a tampered or corrupted hash must not be able to request huge memory (DoS)
 * or a short key (a 1-byte comparison would accept almost any password).
 * Anything unexpected is simply "wrong password", never an exception.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltB64, hashB64, ...rest] = stored.split("$");
  if (algorithm !== "scrypt" || rest.length > 0 || !saltB64 || !hashB64) return false;

  const options = { N: Number(n), r: Number(r), p: Number(p) };
  const withinBounds =
    Number.isInteger(options.N) &&
    options.N >= 2 ** 14 &&
    options.N <= 2 ** 17 &&
    (options.N & (options.N - 1)) === 0 &&
    options.r >= 1 &&
    options.r <= 16 &&
    options.p >= 1 &&
    options.p <= 4;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (!withinBounds || salt.length < 16 || expected.length !== KEY_LENGTH) return false;

  try {
    const actual = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
      ...options,
      maxmem: 128 * options.N * options.r * 2,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Verifying against this when the user doesn't exist keeps response times uniform. */
export const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
