"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { updateAvatarAction } from "@/app/me/actions";
import { DEFAULT_LOOK, LOOK_PRESETS, normalizeLook, type PaperDollLook } from "@/lib/avatar-v2";
import { PaperDoll } from "@/features/avatar-v2/PaperDoll";
import { fetchSocialJson } from "@/lib/social/client";
import { clampPlazaPosition, clampRoomPosition } from "@/lib/social/movement";
import { createDefaultHome, createPreviewBootstrap, ROOM_THEMES, type HomeConfig, type SocialBootstrap, type SocialFriend, type SocialProfile, type SocialSpace, type SocialVisit } from "@/lib/social/model";
import { PlazaScenery, SceneBuilding, SocialIcon } from "./PlazaScene";
import { usePlazaPresence } from "./usePlazaPresence";
import styles from "./Plaza.module.css";

const Wardrobe=dynamic(()=>import("@/features/avatar-v2/Wardrobe").then(m=>m.Wardrobe),{ssr:false,loading:()=> <div className={styles.assetLoading} role="status">옷장을 열고 있어요…</div>});
const RoomScene=dynamic(()=>import("./RoomScene").then(m=>m.RoomScene),{loading:()=> <div className={styles.loading} role="status">집에 들어가는 중…</div>});
const PREVIEW_POSITIONS=[{x:32,y:57},{x:75,y:63},{x:24,y:75},{x:76,y:85},{x:55,y:73},{x:43,y:65}];

function previewData(count=6):SocialBootstrap {
  const data=createPreviewBootstrap();
  const friends=Array.from({length:count===24?23:6},(_,i)=>{
    const friend=data.friends[i%data.friends.length];
    return {...friend,id:`preview-friend-${i+1}`,name:i<6?friend.name:`${friend.name} ${Math.floor(i/6)+1}`,avatar:{...LOOK_PRESETS[(i+1)%LOOK_PRESETS.length].look}};
  });
  return {...data,self:{...data.self,avatar:{...DEFAULT_LOOK}},friends};
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const el=ref.current;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    if(el && !el.open) {if(typeof el.showModal==="function") el.showModal();else el.setAttribute("open","");}
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return <dialog ref={ref} className={styles.modal} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className={styles.modalHead}><div><span className={styles.eyebrow}>OUR LITTLE VILLAGE</span><h2>{title}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} aria-label="닫기"><SocialIcon name="close"/></button></div>
    {children}
  </dialog>;
}

export function PlazaClient({adminMode=false,previewCrowd=6}:{adminMode?:boolean;previewCrowd?:6|24}) {
  const [data,setData]=useState<SocialBootstrap|null>(()=>adminMode?previewData(previewCrowd):null);
  const [loadError,setLoadError]=useState("");
  const [notice,setNotice]=useState("");
  const [room,setRoom]=useState<SocialVisit|null>(null);
  const [position,setPosition]=useState({x:50,y:84});
  const [panel,setPanel]=useState<"friends"|"community"|null>(null);
  const [wardrobe,setWardrobe]=useState(false);
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<HomeConfig|null>(null);
  const [saving,setSaving]=useState(false);
  const previewHomes=useRef<Record<string,HomeConfig>>({});
  const pendingVisit=useRef<AbortController|null>(null);
  const space:SocialSpace=room?`home:${room.owner.id}`:"plaza";
  const presence=usePlazaPresence(space,!!data&&!adminMode,position);
  const ownRoom=!!room&&room.owner.id===data?.self.id;
  const dirty=editing&&JSON.stringify(draft)!==JSON.stringify(room?.home);

  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoadError("");
    try {
      const result=await fetchSocialJson<SocialBootstrap>("/tree/api/social",{signal});
      setData(result);
    }catch(error){if(!signal?.aborted)setLoadError(error instanceof Error?error.message:"연결을 확인한 뒤 다시 눌러 주세요.");}
  },[]);
  useEffect(()=>{if(adminMode)return;const abort=new AbortController();void load(abort.signal);return ()=>abort.abort();},[adminMode,load]);
  useEffect(()=>()=>pendingVisit.current?.abort(),[]);
  useEffect(()=>{
    if(presence.denied&&room){setRoom(null);setEditing(false);setDraft(null);setNotice("지금은 이 집에 방문할 수 없어요. 광장으로 돌아왔어요.");}
  },[presence.denied,room]);
  useEffect(()=>{
    if(!dirty)return;
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",prevent);return ()=>window.removeEventListener("beforeunload",prevent);
  },[dirty]);

  const canLeave=()=>!dirty||window.confirm("아직 저장하지 않은 집 꾸미기가 있어요. 취소하고 나갈까요?");
  function cancelVisit(){if(pendingVisit.current){pendingVisit.current.abort();pendingVisit.current=null;setBusy(false);}}
  function closeFriends(){cancelVisit();setPanel(null);}
  function goPlaza(){if(!canLeave())return;cancelVisit();setRoom(null);setPanel(null);setEditing(false);setDraft(null);setPosition({x:50,y:84});setNotice("");}
  async function visit(owner:SocialProfile) {
    if(!data||busy||!canLeave())return;
    const request=new AbortController();pendingVisit.current=request;
    setBusy(true);setNotice("");
    try {
      let next:SocialVisit;
      if(owner.id===data.self.id)next={ok:true,owner:data.self,home:data.self.home};
      else if(adminMode){
        const friend=data.friends.find(f=>f.id===owner.id);
        if(!friend?.allowVisits)throw new Error("이 친구의 집은 잠시 쉬고 있어요.");
        const i=data.friends.findIndex(f=>f.id===owner.id);
        const home=previewHomes.current[owner.id]??{...createDefaultHome(),theme:ROOM_THEMES[(i+1)%ROOM_THEMES.length].id};
        next={ok:true,owner,home};
      }else{
        next=await fetchSocialJson<SocialVisit>(`/tree/api/social?home=${encodeURIComponent(owner.id)}`,{signal:request.signal});
      }
      if(request.signal.aborted)return;
      setRoom(next);setEditing(false);setDraft(null);setPanel(null);setPosition({x:50,y:85});
    }catch(error){if(!request.signal.aborted)setNotice(error instanceof Error?error.message:"잠시 후 다시 방문해 주세요.");}
    finally{if(pendingVisit.current===request){pendingVisit.current=null;setBusy(false);}}
  }
  async function saveHome(){
    if(!draft||!data||!ownRoom||saving)return;
    setSaving(true);setNotice("");
    try{
      let home=draft;
      if(!adminMode){
        const result=await fetchSocialJson<{ok:true;home:HomeConfig}>("/tree/api/social",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});
        home=result.home;
      }
      setData(current=>current?{...current,self:{...current.self,home}}:current);
      setRoom(current=>current?{...current,home}:current);
      setEditing(false);setDraft(null);setNotice(adminMode?"미리보기에만 반영했어요. 실제 기록은 바뀌지 않아요.":"우리 집 꾸미기를 저장했어요!");
    }catch(error){setNotice(error instanceof Error?error.message:"저장하지 못했어요. 다시 눌러 주세요.");}
    finally{setSaving(false);}
  }
  async function saveLook(look:PaperDollLook){
    if(!adminMode){const result=await updateAvatarAction({avatar:look});if(!result.ok)throw new Error(result.message||"옷을 저장하지 못했어요.");}
    setData(current=>current?{...current,self:{...current.self,avatar:look}}:current);
    setRoom(current=>current&&current.owner.id===data?.self.id?{...current,owner:{...current.owner,avatar:look}}:current);
    setNotice(adminMode?"새 스타일을 입었어요. 미리보기에서만 바뀌어요.":"새 스타일을 입었어요!");
  }
  async function moreFriends(){
    if(!data?.nextCursor||busy)return;setBusy(true);
    try{
      const result=await fetchSocialJson<SocialBootstrap>(`/tree/api/social?cursor=${encodeURIComponent(data.nextCursor)}`);
      setData(current=>current?{...current,friends:Array.from(new Map([...current.friends,...result.friends].map(f=>[f.id,f])).values()),nextCursor:result.nextCursor}:current);
    }catch(error){setNotice(error instanceof Error?error.message:"친구를 불러오지 못했어요.");}finally{setBusy(false);}
  }
  const friends=useMemo(()=>data?.friends.filter(f=>f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))??[],[data?.friends,query]);
  const players=adminMode&&!room?data?.friends.map((f,i)=>({...f,...(previewCrowd===24?{x:15+i%5*17.5,y:54+Math.floor(i/5)*8}:PREVIEW_POSITIONS[i%PREVIEW_POSITIONS.length])}))??[]:presence.players.filter(p=>p.id!==data?.self.id);
  function player(profile:SocialProfile,x:number,y:number,self=false){
    const point=room?clampRoomPosition({x,y}):clampPlazaPosition({x,y});
    return <button key={profile.id} type="button" className={`${styles.player} ${self?styles.self:""}`} style={{left:`${point.x}%`,top:`${point.y}%`,zIndex:Math.round(point.y)+120}} onClick={()=>self?setWardrobe(true):void visit(profile)} aria-label={self?"내 아바타 꾸미기":`${profile.name}의 집 방문`} disabled={!self&&busy}>
      <PaperDoll look={normalizeLook(profile.avatar)} size={142} className={styles.playerFigure}/><span className={styles.nameTag}>{self&&<i/>}{profile.name}{self&&<small>나</small>}</span>
    </button>;
  }

  return <main className={styles.app}>
    {adminMode&&<div className={styles.preview}>🛠 테스트 모드 — 기록 저장 안 됨 <Link href="/admin/garden">관리 홈 ↗</Link></div>}
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandMark}><SocialIcon name="plaza" size={28}/></div><div className={styles.brand}><span>MONSTER · BLOCK WORLD</span><h1>몬스터 마을</h1></div>
        <span className={styles.connection}><i className={adminMode||presence.status==="online"?styles.live:""}/>{adminMode?"미리보기":presence.status==="online"?"연결됨":presence.status==="offline"?"연결 확인 중":"연결 중"}</span>
      </header>
      {!data?<section className={styles.loading} aria-live="polite"><SocialIcon name="home" size={48}/><h2>{loadError?"마을에 잠시 들어갈 수 없어요":"마을 문을 열고 있어요"}</h2><p>{loadError||"조금만 기다려 주세요."}</p>{loadError&&<><button type="button" className={styles.primary} onClick={()=>void load()}>다시 연결하기</button><Link href="/me">내 마당으로 가기</Link></>}</section>:<>
        <div className={styles.sceneHeading}>
          <div><p className={styles.eyebrow}>{room?ownRoom?"MY BLOCK HOME":"A FRIEND’S HOME":`${data.self.name}의 모험이 시작되는 곳`}</p><h2>{room?ownRoom?"나만의 블록 하우스":`${room.owner.name}의 집`:"우리 광장"}</h2><p>{room?ownRoom?"옷을 갈아입고, 내 취향으로 집을 꾸며 봐.":"친구의 공간을 구경해 봐. 가구는 바꿀 수 없어.":"바닥을 눌러 이동 · 친구를 눌러 집에 놀러 가기"}</p></div>
          {room?<button type="button" className={styles.secondary} onClick={goPlaza} disabled={saving}><SocialIcon name="arrow" size={18}/>광장으로</button>:<button type="button" className={styles.secondary} onClick={()=>setPanel("friends")}><SocialIcon name="friends" size={18}/><span>친구 {data.friends.length}{data.nextCursor?"+":""}</span></button>}
        </div>
        {notice&&<div className={styles.notice} role="status">{notice}<button type="button" aria-label="알림 닫기" onClick={()=>setNotice("")}><SocialIcon name="close" size={16}/></button></div>}
        {room?<section className={styles.roomWrap} aria-label={`${room.owner.name}의 집. 바닥을 누르거나 방향키로 이동하세요.`} tabIndex={editing||saving?-1:0} aria-busy={saving} onKeyDown={e=>{if(editing||saving||e.target!==e.currentTarget)return;const delta:Record<string,[number,number]>={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]};if(delta[e.key]){e.preventDefault();const [dx,dy]=delta[e.key];setPosition(p=>clampRoomPosition({x:p.x+dx,y:p.y+dy}));}}}>
          <div className={styles.roomToolbar}><span className={styles.roomPill}>{ownRoom?"나만의 공간":"구경하는 중 · 편집 불가"}</span>{ownRoom&&(editing?<div className={styles.editActions}><button type="button" className={styles.secondary} disabled={saving} onClick={()=>{setEditing(false);setDraft(null);}}>취소</button><button type="button" className={styles.primary} disabled={saving} onClick={()=>void saveHome()}>{saving?"저장 중…":"꾸미기 저장"}</button></div>:<button type="button" className={styles.secondary} onClick={()=>{setDraft({...room.home,furniture:room.home.furniture.map(item=>({...item}))});setEditing(true);}}><SocialIcon name="settings" size={18}/>집 꾸미기</button>)}</div>
          <RoomScene home={editing&&draft?draft:room.home} ownerName={room.owner.name} editing={editing&&!saving} onChange={setDraft} onMove={editing||saving?undefined:point=>setPosition(clampRoomPosition(point))}>
            {!editing&&<>{players.map(p=>player(p,p.x,p.y))}{player(data.self,position.x,position.y,true)}</>}
          </RoomScene>
        </section>:<section className={styles.stage} aria-label="광장. 바닥을 눌러 이동하거나 방향키를 사용하세요." tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const delta:Record<string,[number,number]>={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]};if(delta[e.key]){e.preventDefault();const [dx,dy]=delta[e.key];setPosition(p=>clampPlazaPosition({x:p.x+dx,y:p.y+dy}));}}} onClick={e=>{if((e.target as HTMLElement).closest("button"))return;const box=e.currentTarget.getBoundingClientRect();setPosition(clampPlazaPosition({x:(e.clientX-box.left)/box.width*100,y:(e.clientY-box.top)/box.height*100}));}}>
          <PlazaScenery/>
          <div className={styles.sceneNote}>우리들의 블록 월드</div>
          <SceneBuilding kind="home" label="내 집" caption="나만의 포근한 공간" onClick={()=>void visit(data.self)}/>
          <SceneBuilding kind="community" label="마을 회관" caption="즐거운 일들이 모이는 곳" onClick={()=>setPanel("community")}/>
          <SceneBuilding kind="friends" label="친구네 집" caption="오늘은 누구 집에 갈까?" onClick={()=>setPanel("friends")}/>
          {players.map(p=>player(p,p.x,p.y))}{player(data.self,position.x,position.y,true)}
          <div className={styles.stageHint}><span/>{adminMode?"친구 아바타는 미리보기예요":presence.status==="online"?`이 광장에 ${players.length+1}명 · 최대 24명 표시`:"연결을 다시 확인하고 있어요"}</div>
        </section>}
        <nav className={styles.dock} aria-label="마을 이동">
          <button type="button" className={!room?styles.activeDock:""} onClick={goPlaza} disabled={saving}><SocialIcon name="plaza"/><span>광장</span></button>
          <button type="button" className={ownRoom?styles.activeDock:""} onClick={()=>void visit(data.self)} disabled={busy||saving}><SocialIcon name="home"/><span>내 집</span></button>
          <button type="button" className={styles.wardrobeDock} onClick={()=>setWardrobe(true)} disabled={saving}><SocialIcon name="hanger"/><span>옷장</span></button>
          <button type="button" onClick={()=>setPanel("friends")} disabled={saving}><SocialIcon name="friends"/><span>친구</span></button>
          <Link href={adminMode?"/admin/garden":"/me"} onClick={e=>{if(!canLeave())e.preventDefault();}}><SocialIcon name="tree"/><span>내 마당</span></Link>
        </nav>
        <p className={styles.footer}>내 나무는 마당에서 그대로 자라고 있어요. <span>나무를 만나려면 ‘내 마당’</span></p>
      </>}
    </div>
    {panel==="friends"&&data&&<Modal title="친구네 놀러 갈까?" onClose={closeFriends}><p className={styles.modalIntro}>같은 학원 친구들의 공간이에요. 친구가 없어도 구경할 수 있어요.</p><label className={styles.search}><SocialIcon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="친구 이름 찾기" aria-label="친구 이름 찾기"/></label>{notice&&<p className={styles.inlineError} role="status">{notice}</p>}<div className={styles.friendGrid}>{friends.map((friend:SocialFriend)=><button type="button" className={styles.friendCard} key={friend.id} disabled={!friend.allowVisits||busy} onClick={()=>void visit(friend)}><div><PaperDoll look={normalizeLook(friend.avatar)} size={118}/></div><strong>{friend.name}</strong><span>{friend.allowVisits?"집에 놀러 가기 ↗":"지금은 쉬는 집"}</span></button>)}</div>{!friends.length&&<p className={styles.empty}>아직 찾을 수 있는 친구가 없어요.</p>}{data.nextCursor&&<button type="button" className={styles.more} disabled={busy} onClick={()=>void moreFriends()}>{busy?"불러오는 중…":"친구 더 보기"}</button>}<p className={styles.modalFoot}>친구의 집에서는 구경만 할 수 있어요.</p></Modal>}
    {panel==="community"&&<Modal title="오늘은 뭐 하고 놀까?" onClose={()=>setPanel(null)}><div className={styles.communityLinks}>{[
      {label:"게임 센터",text:"짧게 한 판, 신나게 놀자",href:adminMode?"/admin/game-center-preview":"/me/game-center",icon:"✦"},
      {label:"퀴즈 센터",text:"생각하는 즐거움을 찾아서",href:adminMode?"/admin/quiz-center-preview":"/quiz-center",icon:"?"},
      {label:"나의 도감",text:"내가 만난 몬스터 친구들",href:adminMode?"/admin/collection-preview":"/me/collection",icon:"◎"},
      {label:"건의함",text:"들려주고 싶은 이야기가 있어",href:adminMode?"/admin/suggest-preview":"/me/suggest",icon:"✉"},
      {label:"몬스터 상점",text:"차곡차곡 모은 포인트로",href:adminMode?"/admin/shop-preview":"/shop",icon:"◇"},
    ].map(item=><Link key={item.href} href={item.href}><i>{item.icon}</i><div><strong>{item.label}</strong><small>{item.text}</small></div><span>↗</span></Link>)}</div></Modal>}
    {wardrobe&&data&&<Wardrobe open initial={normalizeLook(data.self.avatar)} adminMode={adminMode} onClose={()=>setWardrobe(false)} onSave={saveLook}/>}
  </main>;
}
