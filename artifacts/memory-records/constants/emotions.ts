export interface Emotion {
  key: string;
  label: string;
  color: string;
  group: "basic" | "complex" | "neutral";
}

export const EMOTIONS: Emotion[] = [
  { key: "neutral",      label: "Neutral",       color: "#94A3B8", group: "neutral" },
  { key: "happiness",    label: "Happiness",     color: "#FBBF24", group: "basic" },
  { key: "sadness",      label: "Sadness",       color: "#60A5FA", group: "basic" },
  { key: "anger",        label: "Anger",         color: "#F87171", group: "basic" },
  { key: "fear",         label: "Fear",          color: "#A78BFA", group: "basic" },
  { key: "surprise",     label: "Surprise",      color: "#FB923C", group: "basic" },
  { key: "disgust",      label: "Disgust",       color: "#86EFAC", group: "basic" },
  { key: "love",         label: "Love",          color: "#F472B6", group: "complex" },
  { key: "guilt",        label: "Guilt",         color: "#6B7280", group: "complex" },
  { key: "shame",        label: "Shame",         color: "#FDA4AF", group: "complex" },
  { key: "pride",        label: "Pride",         color: "#FCD34D", group: "complex" },
  { key: "jealousy",     label: "Jealousy",      color: "#4ADE80", group: "complex" },
  { key: "envy",         label: "Envy",          color: "#34D399", group: "complex" },
  { key: "gratitude",    label: "Gratitude",     color: "#FDBA74", group: "complex" },
  { key: "hope",         label: "Hope",          color: "#7DD3FC", group: "complex" },
  { key: "anxiety",      label: "Anxiety",       color: "#C084FC", group: "complex" },
  { key: "embarrassment",label: "Embarrassment", color: "#FCA5A5", group: "complex" },
  { key: "loneliness",   label: "Loneliness",    color: "#7B92B2", group: "complex" },
  { key: "nostalgia",    label: "Nostalgia",     color: "#D6B88A", group: "complex" },
  { key: "excitement",   label: "Excitement",    color: "#FF8C42", group: "complex" },
  { key: "contempt",     label: "Contempt",      color: "#9CA3AF", group: "complex" },
  { key: "confusion",    label: "Confusion",     color: "#818CF8", group: "complex" },
];

export function getEmotion(key: string | undefined): Emotion {
  return EMOTIONS.find((e) => e.key === key) ?? EMOTIONS[0];
}
