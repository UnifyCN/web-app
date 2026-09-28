import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJobPosting as fetchCoverLetterPosting, CoverLetterLimitError } from "./coverLetter";
import { fetchJobPosting as fetchResumePosting } from "./resume";

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function ok() {
  return new Response(
    JSON.stringify({ url: "", title: "Cashier", company: "", location: "", text: "x".repeat(50) }),
    { status: 200 },
  );
}

describe("job-posting import endpoint per feature", () => {
  it("cover letter imports go to the cover-letter route", async () => {
    vi.stubGlobal("fetch", fetchMock.mockResolvedValue(ok()));
    await fetchCoverLetterPosting({ text: "pasted" });
    expect(fetchMock).toHaveBeenCalledWith("/api/cover-letter/job-posting", expect.anything());
  });

  it("resume imports go to the resume route", async () => {
    vi.stubGlobal("fetch", fetchMock.mockResolvedValue(ok()));
    await fetchResumePosting({ text: "pasted" });
    expect(fetchMock).toHaveBeenCalledWith("/api/resume/job-posting", expect.anything());
  });

  it("a cover-letter daily-limit 429 raises CoverLetterLimitError", async () => {
    vi.stubGlobal(
      "fetch",
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ code: "daily_limit_reached" }), { status: 429 }),
      ),
    );
    await expect(fetchCoverLetterPosting({ text: "pasted" })).rejects.toBeInstanceOf(
      CoverLetterLimitError,
    );
  });
});
