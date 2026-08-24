import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../types/settings";
import { resolveMorningNewsProfile } from "../morningNewsProfile";

describe("morning news editorial profile", () => {
  it("uses the standard editorial density", () => {
    const profile = resolveMorningNewsProfile(DEFAULT_SETTINGS);

    expect(profile.targetDurationMinutes).toBe(14);
    expect(profile.quickNewsRecommendedCount).toBe(6);
    expect(profile.deepDiveRecommendedCount).toBe(1);
    expect(profile.quickNewsChars).toEqual({ min: 220, max: 300 });
    expect(profile.deepDiveChars).toEqual({ min: 1200, max: 1600 });
    expect(profile.episodeChars).toEqual({ min: 3000, max: 3800 });
  });

  it("keeps professional and human voice systems explicit", () => {
    const professional = resolveMorningNewsProfile({
      ...DEFAULT_SETTINGS,
      creatorPreferences: {
        ...DEFAULT_SETTINGS.creatorPreferences,
        editorialVoice: "professional",
      },
    });

    expect(professional.editorialVoice).toBe("professional");
    expect(professional.editorialVoiceLabel).toBe("专业播报");
    expect(professional.tone).toContain("理性");
    expect(resolveMorningNewsProfile(DEFAULT_SETTINGS).tone).toContain("自然");
  });
});
