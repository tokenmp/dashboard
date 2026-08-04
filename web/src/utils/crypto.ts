/**
 * RSA-OAEP(SHA-1) 公钥加密 —— 与后端 openssl OAEP(SHA-1) 互通。
 *
 * WebCrypto 要求 secure context（HTTPS 或 localhost）。
 * OAEP 哈希固定 SHA-1：因 PHP openssl_private_decrypt 的 OAEP 仅支持 SHA-1，
 * 两端必须一致才能加解密成功。
 */

/** ArrayBuffer → base64 */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 用公钥加密明文。
 *
 * @param spkiBase64 后端返回的 SPKI DER base64 公钥
 * @param plaintext  待加密明文（密码等）
 * @returns base64 密文
 */
export async function rsaOaepEncrypt(
  spkiBase64: string,
  plaintext: string,
): Promise<string> {
  // base64 → DER bytes
  const der = Uint8Array.from(atob(spkiBase64), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSA-OAEP', hash: 'SHA-1' },
    false,
    ['encrypt'],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(plaintext),
  );

  return bufferToBase64(ciphertext);
}
