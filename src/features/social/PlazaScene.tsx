import Image from "next/image";
import { memo } from "react";
import styles from "./Plaza.module.css";

export const PlazaScenery = memo(function PlazaScenery() {
  return <Image src="/tree/block-world/plaza-v1.png" alt="" fill priority
    sizes="(max-width: 700px) 100vw, 680px" quality={82}
    className={styles.scenery} draggable={false} />;
});

// The doors are part of one optimized world bitmap. Only the accessible hit areas
// and nameplates are live elements; the scenery never rerenders per movement.
export function SceneBuilding({kind,label,caption,onClick}:{kind:"home"|"friends"|"community";label:string;caption:string;onClick:()=>void}) {
  return <button type="button" className={`${styles.building} ${styles[kind]}`} onClick={onClick} aria-label={label}>
    <span className={styles.buildingLabel}>{label}<small>{caption}</small></span>
  </button>;
}

type IconName="home"|"friends"|"plaza"|"hanger"|"tree"|"close"|"arrow"|"check"|"settings"|"search";
const ICON_CELL:Partial<Record<IconName,number>>={plaza:0,home:1,hanger:2,friends:3,tree:4};
const ICON_SYMBOL:Partial<Record<IconName,string>>={close:"×",arrow:"←",check:"✓",settings:"⚒",search:"⌕"};

export function SocialIcon({name,size=22}:{name:IconName;size?:number}) {
  const cell=ICON_CELL[name];
  if(cell===undefined)return <span className={styles.textIcon} style={{width:size,height:size,fontSize:size}} aria-hidden="true">{ICON_SYMBOL[name]}</span>;
  return <span className={styles.rasterIcon} style={{width:size,height:size}} aria-hidden="true">
    <span style={{position:"absolute",width:"300%",height:"200%",left:`-${cell%3*100}%`,top:`-${Math.floor(cell/3)*100}%`}}>
      <Image src="/tree/block-world/navigation-v1.png" alt="" fill sizes="256px" quality={85} draggable={false}/>
    </span>
  </span>;
}
