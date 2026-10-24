import { describe, expect, it } from "vitest";
import { parkNeed } from "../src/core/calc";

// СП 59.13330.2020, п. 5.2.1: не менее 10 % мест для инвалидов; специализированных — по таблице, округление вверх.
describe("парковка: сколько мест нужно", () => {
  const table: [number, number, number][] = [
    [1, 1, 1],
    [10, 1, 1],
    [20, 2, 1],
    [100, 10, 5],
    [101, 11, 6],
    [120, 12, 6],
    [200, 20, 8],
    [201, 21, 9],
    [500, 50, 14],
    [501, 51, 15],
    [1000, 100, 19],
  ];
  it.each(table)("%i мест → всего %i, специализированных %i", (n, all, spec) => {
    expect(parkNeed(n)).toEqual({ all, spec });
  });
});
