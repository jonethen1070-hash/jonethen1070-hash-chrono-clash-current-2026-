import { describe, expect, it } from "vitest";
import { neighborFromSwipe } from "../src/engine/input";

describe("directional swipe", () => {
  it("ignores tiny accidental movement", () => {
    expect(neighborFromSwipe({ r: 3, c: 3 }, 8, 2, 28)).toBeNull();
    expect(neighborFromSwipe({ r: 3, c: 3 }, 0, 12, 28)).toBeNull();
  });

  it("maps a real swipe to one adjacent neighbor", () => {
    expect(neighborFromSwipe({ r: 3, c: 3 }, 40, 4, 28)).toEqual({ r: 3, c: 4 });
    expect(neighborFromSwipe({ r: 3, c: 3 }, -36, 3, 28)).toEqual({ r: 3, c: 2 });
    expect(neighborFromSwipe({ r: 3, c: 3 }, 2, 44, 28)).toEqual({ r: 4, c: 3 });
    expect(neighborFromSwipe({ r: 3, c: 3 }, -1, -50, 28)).toEqual({ r: 2, c: 3 });
  });

  it("rejects diagonals and board edges", () => {
    expect(neighborFromSwipe({ r: 3, c: 3 }, 30, 30, 28)).toBeNull();
    expect(neighborFromSwipe({ r: 0, c: 0 }, 0, -40, 28)).toBeNull();
    expect(neighborFromSwipe({ r: 0, c: 7 }, 40, 0, 28)).toBeNull();
  });
});
