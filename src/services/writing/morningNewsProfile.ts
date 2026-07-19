import type {
  AppSettings,
  DurationPreference,
  EditorialVoice,
} from "../../types/settings";

export type CharacterRange = { min: number; max: number };

export type MorningNewsProfile = {
  targetDurationMinutes: number;
  recommendedNewsItemCount: number;
  quickNewsRecommendedCount: number;
  deepDiveRecommendedCount: number;
  quickNewsChars: CharacterRange;
  deepDiveChars: CharacterRange;
  episodeChars: CharacterRange;
  openingChars: CharacterRange;
  closingChars: CharacterRange;
  editorialVoice: EditorialVoice;
  editorialVoiceLabel: string;
  tone: string;
  contentGuidance: string;
  wordsPerMinute: number;
};
type DurationProfile = Pick<
  MorningNewsProfile,
  | "targetDurationMinutes"
  | "recommendedNewsItemCount"
  | "quickNewsRecommendedCount"
  | "deepDiveRecommendedCount"
  | "quickNewsChars"
  | "deepDiveChars"
  | "episodeChars"
>;

export const MORNING_NEWS_DURATION_PROFILES: Record<
  DurationPreference,
  DurationProfile
> = {
  short: {
    targetDurationMinutes: 10,
    recommendedNewsItemCount: 6,
    quickNewsRecommendedCount: 6,
    deepDiveRecommendedCount: 0,
    quickNewsChars: { min: 220, max: 320 },
    deepDiveChars: { min: 0, max: 0 },
    episodeChars: { min: 2000, max: 2800 },
  },
  medium: {
    targetDurationMinutes: 22,
    recommendedNewsItemCount: 10,
    quickNewsRecommendedCount: 9,
    deepDiveRecommendedCount: 1,
    quickNewsChars: { min: 240, max: 360 },
    deepDiveChars: { min: 2000, max: 2600 },
    episodeChars: { min: 5200, max: 6200 },
  },
};

const EDITORIAL_VOICE_PROFILE: Record<
  EditorialVoice,
  Pick<MorningNewsProfile, "editorialVoiceLabel">
> = {
  professional: {
    editorialVoiceLabel: "专业播报",
  },
  human: {
    editorialVoiceLabel: "自然人味",
  },
};

const CONTENT_GUIDANCE: Record<
  AppSettings["creatorPreferences"]["contentTendency"],
  string
> = {
  news: "以事实和最新进展为主，每条交代事件、关键事实与听众相关性。",
  analysis: "补充因果和影响的解释，但每个推断必须与已给事实保持清晰边界。",
};

const TONE_PROFILE: Record<EditorialVoice, string> = {
  professional: "理性、准确、克制；先事实，后解释，不制造情绪",
  human: "平静、自然、有节奏；保持清楚的事实与出处意识",
};

export function resolveMorningNewsProfile(
  settings: AppSettings,
): MorningNewsProfile {
  const duration =
    MORNING_NEWS_DURATION_PROFILES[
      settings.creatorPreferences.durationPreference
    ];
  const editorialVoice = settings.creatorPreferences.editorialVoice || "human";
  return {
    ...duration,
    tone: TONE_PROFILE[editorialVoice],
    ...EDITORIAL_VOICE_PROFILE[editorialVoice],
    editorialVoice,
    openingChars: { min: 320, max: 450 },
    closingChars: { min: 80, max: 160 },
    contentGuidance:
      CONTENT_GUIDANCE[settings.creatorPreferences.contentTendency],
    wordsPerMinute: 240,
  };
}
