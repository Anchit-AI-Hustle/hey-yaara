import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHEMA } from "../../api/_lib/db";

describe("db/schema.sql", () => {
  it("is the same schema the server creates on first use", () => {
    expect(readFileSync("db/schema.sql", "utf8").endsWith(SCHEMA.trimStart().replace(/^\n/, ""))).toBe(true);
  });
});
