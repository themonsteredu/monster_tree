"use client";

import type { AvatarConfig, BackgroundConfig } from "@/lib/types";
import { normalizeLook } from "@/lib/avatar-v2";
import { Wardrobe } from "@/features/avatar-v2/Wardrobe";
import { updateAvatarAction } from "@/app/me/actions";

type Props = {
  open: boolean;
  initial: AvatarConfig;
  onClose: () => void;
  onSaved: (next: AvatarConfig) => void;
  previewBackground?: BackgroundConfig | null;
  adminMode?: boolean;
};

/** Keep existing room callers working, while replacing crop/position editing entirely. */
export function AvatarEditSheet({ open, initial, onClose, onSaved, adminMode = false }: Props) {
  return <Wardrobe open={open} initial={normalizeLook(initial)} onClose={onClose} adminMode={adminMode}
    onSave={async look => {
      if (adminMode) { onSaved(look); return; }
      const result = await updateAvatarAction({ avatar: look });
      if (!result.ok) throw new Error(result.message);
      onSaved(result.avatar);
    }} />;
}
