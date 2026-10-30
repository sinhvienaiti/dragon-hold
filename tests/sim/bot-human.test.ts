import { describe, expect, it } from "vitest";
import { BOTS, BOT_NAMES, M0_BOTS, TICK_MS, createBotWorld, runBot } from "../../scripts/balance/bot";
import { botDeck } from "../../scripts/balance/deck";
import { Hands } from "../../scripts/balance/hands";
import { CDP_NEAR, KEY_MS, CdpTypist, HumanTypist, WaveMeasure, findBot, pickCdp, measureRun } from "../../scripts/balance/human";
import type { SeenWord, TypingView } from "../../scripts/balance/reader";
import { STAGE_M0 } from "../../src/content/data/stages";
import { createRng } from "../../src/kit/platform";
import { createWorld } from "../../src/sim/world";

const names = ["b0","b25","b35","b60","typingOnly","noTyping","child","novice","steady","skilled","sloppy","fast","b35good","b35poor","b35off"];
const word = (slot: number, extra: Partial<SeenWord> = {}): SeenWord => ({slot,text:"apple",kind:"enemy",group:"known",typed:0,asleep:false,priority:1,special:false,distance:10,born:0,...extra});
const view = (words: SeenWord[], lock=-1): TypingView => ({words,lock,pair:-1});

describe("DH-08 opt-in human bots",()=>{
 it("keeps every default name and order; resolves opt-in names and unknown names",()=>{
  expect(BOT_NAMES).toEqual(names); expect(Object.keys(BOTS)).toEqual(names);
  expect(M0_BOTS).toEqual(names.slice(0,6));
  for(const name of ["b35cdp","b35human"]){expect(findBot(name)?.name).toBe(name);expect(BOT_NAMES).not.toContain(name);expect(findBot(name)).not.toHaveProperty("standard");}
  expect(findBot("missing")).toBeUndefined();expect(findBot("toString")).toBeUndefined();
 });
 it("picks lock > urgent > unowned flag > nearest foe > unowned word",()=>{
  const ws=[word(0,{distance:Infinity}),word(1,{distance:5}),word(2,{kind:"flag",special:true,distance:Infinity}),word(3,{kind:"urgent",special:true}),word(4,{distance:1})];
  expect(pickCdp(view(ws,0))?.slot).toBe(0);
  expect(pickCdp(view(ws))?.slot).toBe(3);
  expect(pickCdp(view(ws.filter(w=>w.slot!==3)))?.slot).toBe(2);
  expect(pickCdp(view(ws.filter(w=>w.slot<2||w.slot===4)))?.slot).toBe(4);
  expect(pickCdp(view([ws[0]!] ))?.slot).toBe(0);
  expect(pickCdp(view([word(0,{asleep:true})]))?.slot).toBe(0);
 });
 it("keeps CDP key gaps and post-word waits within their measured formulas",()=>{
  const typist=new CdpTypist(createRng(19).ai,{pauses:false});
  let typed=0,last=-1,first=-1; const gaps:number[]=[],posts:number[]=[];
  for(let tick=0;tick<20000&&posts.length<100;tick++){
   const cmd=typist.act(view([word(0,{text:"aaaa",typed})],typed?0:-1),tick*TICK_MS);
   if(cmd?.type!=="key")continue;
   if(typed===0){expect(cmd.letter).toBe(0);if(last>=0)posts.push(tick*TICK_MS-last);first=tick;}
   else if(last>=0)gaps.push(tick*TICK_MS-last);
   last=tick*TICK_MS;if(cmd.letter===0)typed++;if(typed===4)typed=0;
  }
  expect(first).toBeGreaterThanOrEqual(0);expect(posts).toHaveLength(100);
  for(const ms of gaps){expect(ms).toBeGreaterThanOrEqual(Math.max(5,.6*KEY_MS-6)-TICK_MS);expect(ms).toBeLessThanOrEqual(1.4*KEY_MS-6+TICK_MS);}
  // CDP awaits the last key's typeLetter sleep AND the word sleep.
  for(const ms of posts){expect(ms).toBeGreaterThanOrEqual((.6*KEY_MS-6)+.5*KEY_MS-TICK_MS);expect(ms).toBeLessThanOrEqual((1.4*KEY_MS-6)+1.5*KEY_MS+TICK_MS);}
  expect(typist.stats.slips).toBeGreaterThan(0);
 });
 it("never slips on a first letter; subsequent slips use the exact CDP NEAR table",()=>{
  const typist=new CdpTypist(createRng(55).ai,{pauses:false});let typed=0,slips=0;
  for(let tick=0;tick<40000;tick++){
   const cmd=typist.act(view([word(0,{text:"zzzz",typed})],typed?0:-1),tick*TICK_MS);
   if(cmd?.type!=="key")continue;
   if(typed===0)expect(cmd.letter).toBe(25);
   if(cmd.letter!==25){expect(CDP_NEAR.z).toContain(String.fromCharCode(97+cmd.letter));slips++;}else typed=(typed+1)%4;
  }
  expect(slips).toBeGreaterThan(10);expect(typist.stats.backspaces).toBe(0);expect(typist.stats.releases).toBe(0);
 });
 it.each(["known","learning","new"] as const)("anchors %s recognition to word birth, not selection",group=>{
  const hands=new Hands({...BOTS.b35.hands!,accuracy:1,cv:0,crowdDrop:0},createRng(4).ai);
  const typist=new HumanTypist(hands);const born=60;let first=-1;
  const minimum=group==="known"?350:group==="learning"?500:800;
  for(let tick=born;tick<400;tick++)if(typist.act(view([word(0,{born,group})]),tick*TICK_MS)?.type==="key"){first=tick*TICK_MS;break;}
  expect(first).toBeGreaterThanOrEqual(born*TICK_MS+minimum);
 });
 it("charges only one key gap for a word already recognized while busy",()=>{
  const hands=new Hands({...BOTS.b35.hands!,accuracy:1,cv:0},createRng(4).ai);const typist=new HumanTypist(hands);
  const ws=view([word(0,{born:0})]);let first=-1;
  for(let tick=600;tick<700;tick++)if(typist.act(ws,tick*TICK_MS)?.type==="key"){first=tick*TICK_MS;break;}
  expect(first-10000).toBeGreaterThan(0);expect(first-10000).toBeLessThanOrEqual(1.5*hands.meanGapMs(5,"known")+TICK_MS);
 });
 it.each(["b35cdp","b35human"])("uses the browser pace defaults for %s",name=>{
  const deck=botDeck(),seed=1;
  expect(createBotWorld(findBot(name)!,{seed,deck}).pace).toEqual(createWorld(STAGE_M0,seed,{typistWpm:35,deck}).pace);
 });
 it.each(["b35cdp","b35human"])("repeats the complete short log and hash for %s",name=>{
  const options={seed:1,maxTicks:7200,keepLog:true};const a=runBot(findBot(name)!,options),b=runBot(findBot(name)!,options);
  expect(a.finalHash).toBe(b.finalHash);expect(a.log).toEqual(b.log);expect(a.log.length).toBeGreaterThan(20);
 });
 it("measures wave drop, damage, completed words, birth reaction and nearest selection",()=>{
  const m=new WaveMeasure();
  m.observe({tick:0,wave:1,phase:"wave",hp:100,words:[],lock:-1,events:[]});
  m.observe({tick:1,wave:1,phase:"wave",hp:90,words:[word(0,{born:0})],lock:-1,events:[{type:"hit",target:{kind:"hero"},source:{kind:"hero"},amount:10} as never]});
  m.observe({tick:31,wave:1,phase:"wave",hp:95,words:[],lock:-1,events:[{type:"word-progress",tick:30,word:0,typed:5,key:"done",letter:4},{type:"word-complete",word:0} as never]});
  m.observe({tick:61,wave:1,phase:"break",hp:95,words:[],lock:-1,events:[]});
  const row=m.finish()[0]!;
  expect(row.hpDrop).toBe(10);expect(row.heroDamage).toBe(10);expect(row.wordsCompleted).toBe(1);expect(row.letters).toBe(1);
  expect(row.reaction.p50).toBeCloseTo(500);expect(row.nearestPct).toBe(100);
 });
 it("measures acquisition without changing old or opt-in logs or hashes",()=>{
  for(const name of ["b35","b35cdp","b35human"]){const spec=findBot(name)!,options={seed:1,maxTicks:7200,keepLog:true};const a=runBot(spec,options),b=measureRun(spec,options);expect(b.run.finalHash).toBe(a.finalHash);expect(b.run.log).toEqual(a.log);if(name==="b35cdp")expect(b.waves.filter(w=>w.freeChoices).every(w=>w.nearestPct===100)).toBe(true);}
 });

});
