import { describe, expect, it } from "vitest";
import { isSafePublicUrl } from "./ssrf.js";

describe("isSafePublicUrl", () => {
  it("accepte les URLs publiques http(s)", () => {
    expect(isSafePublicUrl("https://hooks.zapier.com/abc")).toBe(true);
    expect(isSafePublicUrl("http://example.com:8080/hook")).toBe(true);
    expect(isSafePublicUrl("https://8.8.8.8/hook")).toBe(true);
  });

  it("rejette les schémas non-http", () => {
    expect(isSafePublicUrl("ftp://example.com")).toBe(false);
    expect(isSafePublicUrl("file:///etc/passwd")).toBe(false);
    expect(isSafePublicUrl("pas-une-url")).toBe(false);
  });

  it("rejette loopback et localhost", () => {
    expect(isSafePublicUrl("http://localhost/hook")).toBe(false);
    expect(isSafePublicUrl("http://127.0.0.1:5432")).toBe(false);
    expect(isSafePublicUrl("http://[::1]/x")).toBe(false);
  });

  it("rejette les plages privées et la métadonnée cloud", () => {
    expect(isSafePublicUrl("http://10.0.0.5/x")).toBe(false);
    expect(isSafePublicUrl("http://192.168.1.1/x")).toBe(false);
    expect(isSafePublicUrl("http://172.16.0.1/x")).toBe(false);
    expect(isSafePublicUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafePublicUrl("http://metadata.google.internal/")).toBe(false);
  });
});
