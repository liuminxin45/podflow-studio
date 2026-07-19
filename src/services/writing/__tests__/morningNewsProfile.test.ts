import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../../types/settings";
import { resolveMorningNewsProfile } from "../morningNewsProfile";

describe("morning news editorial profile", () => {
  it("uses the exemplar-derived standard density", () => {
    const profile = resolveMorningNewsProfile(DEFAULT_SETTINGS);

    expect(profile.targetDurationMinutes).toBe(22);
    expect(profile.quickNewsRecommendedCount).toBe(9);
    expect(profile.deepDiveRecommendedCount).toBe(1);
    expect(profile.quickNewsChars).toEqual({ min: 240, max: 360 });
    expect(profile.deepDiveChars).toEqual({ min: 2000, max: 2600 });
    expect(profile.episodeChars).toEqual({ min: 5200, max: 6200 });
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
