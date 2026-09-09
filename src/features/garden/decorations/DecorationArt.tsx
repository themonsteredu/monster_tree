import { isBuiltinDecor } from "@/lib/decor-catalog";
import type { DecorationItem } from "@/lib/types";
import { DecorArt } from "@/features/social/DecorArt";

export function DecorationArt({ item, className }: { item: DecorationItem; className?: string }) {
  if (isBuiltinDecor(item.id)) return <DecorArt id={item.id} basePath="/tree" className={className} />;
  // Existing purchased/uploaded artwork stays unchanged.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.image_url} alt={item.name} draggable={false} className={className} />;
}
