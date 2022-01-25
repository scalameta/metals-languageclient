import * as V from "../checkServerVersion";

describe("snapshotVersionsDate", () => {
  it("parses-release", () => {
    const v = "0.11.1";
    const result = V.parseMetalsVersion(v);
    const expected = new V.MetalsVersion(v, 0, 11, 1, undefined, undefined);
    expect(result).toEqual(expected);
  });

  it("parses-old-snapshot", () => {
    const v = "0.11.1+266-e916554b-SNAPSHOT";
    const result = V.parseMetalsVersion(v);
    const expected = new V.MetalsVersion(v, 0, 11, 1, 266, undefined);
    expect(result).toEqual(expected);
  });

  it("parses-new-snapshot", () => {
    const v = "0.11.1+266-e916554b-20220125-SNAPSHOT";
    const result = V.parseMetalsVersion(v);
    const expected = new V.MetalsVersion(v, 0, 11, 1, 266, "20220125");
    expect(result).toEqual(expected);
  });

  it("sort correctly", () => {
    const versions = [
      "0.11.1",
      "0.11.0+999-e916554b-SNAPSHOT",
      "0.11.1+1-e916554b-SNAPSHOT",
      "0.11.2+10-e916554b-20200219-SNAPSHOT",
      "0.11.1+0-e916554b-SNAPSHOT",
    ]
      .map((v) => V.parseMetalsVersion(v))
      .filter((v): v is V.MetalsVersion => !!v);

    const sorted = versions.sort((a, b) => a.compareTo(b)).map((a) => a.value);

    expect(sorted).toEqual([
      "0.11.0+999-e916554b-SNAPSHOT",
      "0.11.1",
      "0.11.1+0-e916554b-SNAPSHOT",
      "0.11.1+1-e916554b-SNAPSHOT",
      "0.11.2+10-e916554b-20200219-SNAPSHOT",
    ]);
  });
});
