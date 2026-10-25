import { describe, expect, it } from "vitest";
import { buildingAddressFrom } from "../src/place";

describe("адрес здания по ответу карты", () => {
  it("здание с номером дома даёт адрес «улица, дом»", () => {
    expect(
      buildingAddressFrom({ address: { road: "улица Кирова", house_number: "27 с1", city: "Новосибирск" } })
    ).toBe("улица Кирова, 27 с1");
  });

  it("без номера дома это просто ближайшая улица — не подходит", () => {
    expect(buildingAddressFrom({ address: { road: "улица Сакко и Ванцетти" } })).toBeNull();
  });

  it("пустой или неожиданный ответ не ломает", () => {
    expect(buildingAddressFrom(null)).toBeNull();
    expect(buildingAddressFrom({})).toBeNull();
    expect(buildingAddressFrom({ address: { house_number: "5" } })).toBeNull();
  });
});
