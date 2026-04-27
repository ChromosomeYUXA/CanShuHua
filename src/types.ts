export interface ProfilePoint {
  x: number;
  y: number;
}

export interface SculptureParams {
  slice_count: number;
  length: number;
  wave: number;
  thickness: number;
  twist_angle: number;
  incline: number;
  mirror_x: boolean;
  profile_points: ProfilePoint[];
}

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
}
