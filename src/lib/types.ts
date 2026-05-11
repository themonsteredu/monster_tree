// Supabase garden_* 테이블의 행 타입 정의 (마이그레이션 SQL 과 1:1 대응)

export type AvatarHumanBody = "boy" | "girl";
export type AvatarKind = "human" | "animal" | "fantasy";

export type AvatarConfig =
  | {
      kind: "human";
      body: AvatarHumanBody;
      skin: string;
      hair: string;
      face: string;
      top: string;
      bottom: string;
      shoes: string;
    }
  | {
      kind: "animal" | "fantasy";
      variant: string;
    };

export const DEFAULT_AVATAR: AvatarConfig = {
  kind: "human",
  body: "boy",
  skin: "light",
  hair: "short_brown",
  face: "smile",
  top: "hoodie_white",
  bottom: "shorts_green",
  shoes: "sneakers_brown",
};

export type GardenStudent = {
  id: string;
  name: string;
  class_name: string | null;
  branch_id: string | null;
  total_points: number;
  current_stage: number; // 1~8
  apples_harvested: number;
  is_active: boolean;
  created_at: string;
  avatar?: AvatarConfig | null;
};

export type GardenPointLog = {
  id: string;
  student_id: string;
  points: number; // 음수도 가능
  reason: string | null;
  logged_at: string;
};

export type GardenHarvest = {
  id: string;
  student_id: string;
  apples_count: number;
  harvested_at: string;
};
