import { describe, expect, it } from "vitest";
import { parseNearby } from "../src/place";

// Ответ Photon (OpenStreetMap) для точки у стоматологии на ул. Кирова: рядом есть дома на двух улицах.
const feature = (street: string, housenumber: string, lat: number, lon: number, name?: string) => ({
  geometry: { coordinates: [lon, lat] },
  properties: { street, housenumber, name },
});
const here = { lat: 55.01859, lon: 82.94475 };

describe("адреса рядом с точкой", () => {
  const json = {
    features: [
      feature("улица Сакко и Ванцетти", "74", 55.0189, 82.9454), // дальше
      feature("улица Кирова", "27 ст1", 55.01861, 82.94476, "Дента"), // почти в этой точке
      feature("улица Кирова", "27 ст1", 55.01862, 82.94478), // повтор — не должен дублироваться
      { geometry: { coordinates: [82.9448, 55.0186] }, properties: { street: "улица Кирова" } }, // без номера дома — пропуск
    ],
  };

  it("ближайший дом идёт первым, повторы и записи без номера дома убираются", () => {
    const r = parseNearby(json, here);
    expect(r.map(x => x.address)).toEqual(["улица Кирова, 27 ст1", "улица Сакко и Ванцетти, 74"]);
    expect(r[0].d).toBeLessThan(r[1].d);
    expect(r[0].name).toBe("Дента");
  });

  it("пустой или неожиданный ответ не ломает", () => {
    expect(parseNearby(null, here)).toEqual([]);
    expect(parseNearby({}, here)).toEqual([]);
    expect(parseNearby({ features: [{}] }, here)).toEqual([]);
  });

  it("не больше заданного числа вариантов", () => {
    const many = {
      features: Array.from({ length: 10 }, (_, i) =>
        feature("улица А", String(i + 1), 55.0186 + i / 10000, 82.9447)
      ),
    };
    expect(parseNearby(many, here, 3)).toHaveLength(3);
  });
});
