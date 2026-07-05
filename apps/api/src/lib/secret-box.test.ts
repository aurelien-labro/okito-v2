import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box.js";

const KEY = "a".repeat(64);

describe("SecretBox", () => {
  it("chiffre et déchiffre (aller-retour)", () => {
    const box = new SecretBox(KEY);
    const boxed = box.encrypt("motdepasse-imap-très-secret");
    expect(boxed).not.toContain("motdepasse");
    expect(box.decrypt(boxed)).toBe("motdepasse-imap-très-secret");
  });

  it("deux chiffrements du même texte diffèrent (IV aléatoire)", () => {
    const box = new SecretBox(KEY);
    expect(box.encrypt("x")).not.toBe(box.encrypt("x"));
  });

  it("rejette une clé mal formée", () => {
    expect(() => new SecretBox("courte")).toThrow(/64 caractères/);
  });

  it("rejette un secret altéré (tag GCM)", () => {
    const box = new SecretBox(KEY);
    const [iv, tag, data] = box.encrypt("secret").split(".");
    const tampered = `${iv}.${tag}.${Buffer.from("autre").toString("base64")}${data}`;
    expect(() => box.decrypt(tampered)).toThrow();
  });
});
