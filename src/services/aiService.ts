import { SculptureParams } from "../types";

const DEFAULT_PROFILE_POINTS = [
  { x: 0.0, y: 0.7 },
  { x: 1 / 3, y: 1.2 },
  { x: 2 / 3, y: 1.2 },
  { x: 1.0, y: 0.7 },
];

const DEFAULT_AI_PARAMS: SculptureParams = {
  slice_count: 10,
  length: 5.0,
  wave: 1.0,
  thickness: 0.5,
  twist_angle: 90,
  incline: 0.0,
  mirror_x: true,
  profile_points: DEFAULT_PROFILE_POINTS,
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function backendUrl(path: string) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function parseParamsFromText(text: string, currentParams: SculptureParams): Promise<SculptureParams> {
  try {
    const response = await fetch(backendUrl("/api/parse-params"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, currentParams }),
    });

    if (!response.ok) {
      throw new Error(`Param parse failed with ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.params) {
      throw new Error(data.error || "Param parse failed");
    }

    return { ...DEFAULT_AI_PARAMS, ...data.params } as SculptureParams;
  } catch (error) {
    console.error("AI Parsing Error:", error);
    return currentParams;
  }
}
