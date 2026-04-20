export interface SculptureParams {
  // [TYPES: PARAMS_DEF] 如果增加了新参数，请在这里定义新字段
  slice_count: number;
  length: number;
  thickness: number;
  twist_angle: number;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}
