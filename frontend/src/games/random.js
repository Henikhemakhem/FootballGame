export const randomUUID = () => globalThis.crypto.randomUUID();
export function randomInt(length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 0xffffffff) throw new RangeError('Choix aléatoire invalide.');
  const buffer = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % length);
  do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % length;
}
