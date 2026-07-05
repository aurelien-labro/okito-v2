import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement symétrique des secrets au repos (mots de passe IMAP).
 * AES-256-GCM : confidentialité + intégrité (tag). Format stocké :
 * base64(iv).base64(tag).base64(cipher). La clé vient de MAILBOX_ENC_KEY
 * (64 caractères hex = 32 octets) — la perdre rend les boîtes IMAP
 * inutilisables (re-saisie du mot de passe), jamais les emails.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(keyHex: string) {
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error("MAILBOX_ENC_KEY doit faire 64 caractères hexadécimaux (32 octets)");
    }
    this.key = Buffer.from(keyHex, "hex");
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
  }

  decrypt(boxed: string): string {
    const [ivB64, tagB64, dataB64] = boxed.split(".");
    if (!ivB64 || !tagB64 || !dataB64) throw new Error("secret chiffré mal formé");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
