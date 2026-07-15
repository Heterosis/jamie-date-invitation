import { describe, expect, it } from "vitest";
import { githubPagesBase } from "./github-pages-base";

describe("githubPagesBase", () => {
  it("uses root locally", () => expect(githubPagesBase("owner/repo", false)).toBe("/"));

  it("uses repository subpath in Actions", () =>
    expect(githubPagesBase("owner/jamie-date-invitation", true)).toBe("/jamie-date-invitation/"));

  it("uses root when repository metadata is absent", () =>
    expect(githubPagesBase(undefined, true)).toBe("/"));
});
