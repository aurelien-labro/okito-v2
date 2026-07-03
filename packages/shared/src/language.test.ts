import { describe, expect, it } from "vitest";
import { type Language, detectLanguage, isLanguage } from "./language.js";

describe("detectLanguage", () => {
  const cases: [string, Language][] = [
    ["Bonjour, je voudrais réserver une table pour 4 demain soir", "fr"],
    ["Hi, I'd like to book a table for 4 tomorrow evening", "en"],
    ["Hola, quiero reservar una mesa para 4 personas mañana", "es"],
    ["hello can i book for tonight please", "en"],
    ["buenas, una reserva para esta noche por favor", "es"],
  ];

  for (const [msg, expected] of cases) {
    it(`détecte ${expected} sur "${msg.slice(0, 30)}…"`, () => {
      expect(detectLanguage(msg)).toBe(expected);
    });
  }

  it("message ambigu / sans marqueur → fr par défaut", () => {
    expect(detectLanguage("4 20h")).toBe("fr");
    expect(detectLanguage("")).toBe("fr");
  });

  it("ne bascule pas sur un mot isolé quand le FR domine", () => {
    // "table" existe en FR et EN ; le reste est clairement FR.
    expect(detectLanguage("je voudrais une table pour demain")).toBe("fr");
    expect(detectLanguage("Bonjour, une table pour 4 personnes ce soir")).toBe("fr");
  });
});

describe("isLanguage", () => {
  it("valide les langues supportées, rejette le reste", () => {
    expect(isLanguage("fr")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("es")).toBe(true);
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(isLanguage(42)).toBe(false);
  });
});
