/** DH-08: opt-in recording replica and birth-anchored nearest typist; defaults stay in bot.ts. */
import type { RngStream } from "../../src/kit/platform";
import type { SimCommand, SimEvent } from "../../src/content/types";
import type { World } from "../../src/sim/world";
import { BOTS, TICK_MS, runBot, type BotSpec, type BotTypist, type RunOptions } from "./bot";
import { Hands } from "./hands";
import type { SeenWord, TypingView } from "./reader";
import { liveFoes, metresFromDais, readTyping } from "./reader";
import { Typist, type TargetMix, type TypistStats } from "./typist";

export const HUMAN_MIX: TargetMix = { danger: 0.2, nearest: 0.7, first: 0.1 };

// Source: typist.ts. Preserve its hands, slips, lock handling and crowd behavior;
// only target weights and the birth anchor differ for b35human.
const code = (text: string, at: number): number => text.charCodeAt(at) - 97;

export class HumanTypist {
  readonly stats: TypistStats = { keys: 0, slips: 0, backspaces: 0, releases: 0, finished: 0 };
  /** The hands may press again at this ms (an ideal clock, so ticks do not slow the typist). */
  private readyAt = 0;
  private target: { slot: number; text: string } | null = null;
  private gapMean = 0;
  private backspaceNext = false;
  /** The locked word the last key tried to switch away from (−1: none). */
  private switchFrom = -1;
  /** The word just finished, skipped until the world drops it. */
  private finished: { slot: number; text: string; untilMs: number } | null = null;

  constructor(
    readonly hands: Hands,
    readonly mix: TargetMix | null = HUMAN_MIX,
  ) {}

  /** The next word: special words by their priority first, then the mix (or the highest priority). */
  private choose(words: readonly SeenWord[]): SeenWord | null {
    if (this.mix === null) return pick(words);
    const awake = words.filter((word) => !word.asleep);
    if (awake.length === 0) return null;
    const special = awake.filter((word) => word.special);
    if (special.length > 0) return pick(special);
    const { danger, nearest, first } = this.mix;
    const roll = this.hands.uniform() * (danger + nearest + first);
    const by = roll < danger ? "danger" : roll < danger + nearest ? "nearest" : "first";
    let best = awake[0]!;
    for (const word of awake) {
      const better = by === "danger" ? word.priority > best.priority : by === "nearest" ? word.distance < best.distance : word.born < best.born;
      if (better) best = word;
    }
    return best;
  }

  /** True while the typist has a word in mind (the meter's busy time). */
  get busy(): boolean {
    return this.target !== null;
  }

  /** The hands press a command key (Alt + 1 …, a potion) for `ms`. */
  hold(nowMs: number, ms: number): void {
    this.readyAt = Math.max(this.readyAt, nowMs) + ms;
  }

  /** The command to send on this tick, or null. */
  act(view: TypingView, nowMs: number): SimCommand | null {
    if (nowMs < this.readyAt) return null;
    const locked = view.lock >= 0 ? view.words.find((word) => word.slot === view.lock) : undefined;
    if (locked && !this.isTarget(locked)) {
      if (locked.typed > 0 || this.switchFrom === locked.slot) {
        // A slip switched the lock, or a key meant to switch away from it did not (a slip first): type the locked word.
        this.aimAt(locked, view.words.length);
      } else if (this.target === null) {
        // A foe's next word came locked (01 §3.5): keep it unless a clearly higher word waits; its first key switches.
        const best = pick(view.words);
        const next = best !== null && best.priority > locked.priority * 1.25 ? best : locked;
        this.aimAt(next, view.words.length);
        this.readyAt = Math.max(this.readyAt, nowMs, next.born * TICK_MS + this.hands.reactionMs(next.group)) + this.hands.gapMs(this.gapMean);
        return null;
      }
    }
    let word = this.target === null ? undefined : view.words.find((seen) => this.isTarget(seen));
    if (this.target !== null && !word) {
      this.target = null;
      this.backspaceNext = false;
    }
    if (word?.asleep) {
      this.target = null;
      if (view.lock === word.slot) {
        this.stats.releases += 1;
        this.readyAt = nowMs + this.hands.gapMs(this.gapMean);
        return { type: "release" };
      }
      word = undefined;
    }
    if (!word) {
      const done = this.finished !== null && nowMs < this.finished.untilMs ? this.finished : null;
      const next = this.choose(done === null ? view.words : view.words.filter((seen) => seen.slot !== done.slot || seen.text !== done.text));
      if (!next) {
        this.readyAt = nowMs;
        return null;
      }
      this.aimAt(next, view.words.length);
      // Reaction (by familiarity for a human-like typist) plus the formula's extra key (00 §4.3: ℓ + 1).
      this.readyAt = Math.max(this.readyAt, nowMs, next.born * TICK_MS + this.hands.reactionMs(next.group)) + this.hands.gapMs(this.gapMean);
      return null;
    }
    this.readyAt += this.hands.gapMs(this.gapMean);
    if (this.readyAt < nowMs) this.readyAt = nowMs;
    if (this.backspaceNext) {
      this.backspaceNext = false;
      this.stats.backspaces += 1;
      return { type: "backspace" };
    }
    const typed = view.lock === word.slot ? word.typed : view.pair >= 0 && view.pair === code(word.text, 0) ? 1 : 0;
    if (typed >= word.text.length) {
      this.target = null;
      return null;
    }
    const aim = code(word.text, typed);
    // A first key while another word holds the lock is meant to switch to this one (01 §3.5).
    this.switchFrom = view.lock >= 0 && view.lock !== word.slot ? view.lock : -1;
    const press = this.hands.hit(aim);
    this.stats.keys += 1;
    if (press !== aim) {
      this.stats.slips += 1;
      if (typed > 0 && view.lock === word.slot && this.hands.abandonAfterSlip()) {
        // Lets go of the word (Esc) after this slip and looks again.
        this.target = null;
        this.stats.releases += 1;
        this.readyAt += this.hands.gapMs(this.gapMean);
        return { type: "release" };
      }
      // A Backspace takes back a right letter (the router never took the wrong one): only worth it with letters in.
      if (typed > 0 && this.hands.backspaceAfterSlip()) this.backspaceNext = true;
    } else if (typed + 1 === word.text.length) {
      this.stats.finished += 1;
      this.finished = { slot: word.slot, text: word.text, untilMs: nowMs + 500 };
      this.target = null;
    }
    return { type: "key", letter: press, ms: Math.round(nowMs) };
  }

  private isTarget(word: SeenWord): boolean {
    return this.target !== null && this.target.slot === word.slot && this.target.text === word.text;
  }

  private aimAt(word: SeenWord, liveWords: number): void {
    this.target = { slot: word.slot, text: word.text };
    this.switchFrom = -1;
    this.gapMean = this.hands.meanGapMs(word.text.length, word.group) * this.hands.wordFactor(liveWords);
    this.backspaceNext = false;
  }
}

/** The awake word with the highest priority (lowest slot on ties). */
export function pick(words: readonly SeenWord[]): SeenWord | null {
  let best: SeenWord | null = null;
  for (const word of words) if (!word.asleep && (best === null || word.priority > best.priority)) best = word;
  return best;
}

export const KEY_MS = 60000 / (35 * 5);
// Source: tmp/map1-audit/scen/feel.mjs, NEAR (verbatim).
export const CDP_NEAR: Readonly<Record<string, string>> = { a: "sq", b: "vn", c: "xv", d: "sf", e: "wr", f: "dg", g: "fh", h: "gj", i: "uo", j: "hk", k: "jl", l: "k", m: "n", n: "bm", o: "ip", p: "o", q: "w", r: "et", s: "ad", t: "ry", u: "yi", v: "cb", w: "qe", x: "zc", y: "tu", z: "x" };
export const CDP_TIMING = {
  startMs: [1511,1512,1535,1555,1517,1519,1548,1537,1535,1542],
  hurtMs: [0,0,0,0,0,0,1734,1711,1650,0],
  completeMs: [1112,0,0,0,0,0,0,0,0,1132],
  pollMs: [110,109,107,107,107,107,106,107,106],
  markMs: 100, generalMs: 1160, selectionMs: 100,
} as const;

/** PICK's lock, urgent, unowned flag, nearest live foe, unowned word. */
export function pickCdp(view: TypingView): SeenWord | null {
  const locked = view.words.find(w => w.slot === view.lock);
  if (locked) return locked;
  const urgent = view.words.find(w => w.kind === "urgent");
  if (urgent) return urgent;
  return view.words.find(w => w.kind === "flag" && !Number.isFinite(w.distance)) ??
    view.words.reduce<SeenWord | null>((best, w) => best === null || w.distance < best.distance ? w : best, null);
}

interface CdpWord { slot: number; text: string; index: number; slipped: boolean; burstUntil: number; lastCapture: boolean }
export class CdpTypist {
  readonly stats: TypistStats = { keys: 0, slips: 0, backspaces: 0, releases: 0, finished: 0 };
  readonly timing: { kind: "key" | "word" | "poll"; ms: number }[] = [];
  readonly pauses: { wave: number; name: string; atMs: number; ms: number }[] = [];
  readonly sent: Record<string, number> = {};
  readonly planSent: Record<string, number> = {};
  readonly rejected: Record<string, number> = {};
  private readyAt = 0;
  private target: CdpWord | null = null;
  private lastCommand: SimCommand | null = null;
  private lastPlanAt = 0;
  private lastBreath = -Infinity;
  private lastSky = -Infinity;
  private phase = "";
  private waveAt = 0;
  private readonly marks = new Set<string>();
  private readonly pending = new Map<string, number>();
  private maxLive = 0;
  private lastPeak = -Infinity;
  private sawGeneral = false;
  private movedGeneral = false;
  private letterBurst = false;
  private completeWaves = new Set<number>();
  private lastHp = Infinity;
  private betweenStage = 0;

  constructor(private readonly rng: RngStream, readonly options: { pauses?: boolean } = {}) {}
  get busy(): boolean { return this.target !== null; }
  hold(nowMs: number, ms: number): void { this.readyAt = Math.max(this.readyAt, nowMs) + ms; }
  private draw(kind: "key" | "word" | "poll"): number {
    const r = this.rng.float();
    const ms = kind === "key" ? Math.max(5, KEY_MS * (0.6 + 0.8 * r) - 6) : kind === "word" ? KEY_MS * (0.5 + r) : CDP_TIMING.pollMs[Math.floor(r * CDP_TIMING.pollMs.length)]!;
    this.timing.push({kind,ms}); return ms;
  }
  private once(world: World, name: string, ms: number = CDP_TIMING.markMs): void {
    const key = world.wave + ":" + name;
    if (!this.marks.has(key)) { this.marks.add(key); this.pending.set(name, ms); }
  }
  private send(command: SimCommand): SimCommand {
    this.sent[command.type] = (this.sent[command.type] ?? 0) + 1;
    this.lastCommand = command; return command;
  }
  observe(world: World, events: readonly SimEvent[], commands: readonly SimCommand[]): void {
    for (const command of commands) if (command !== this.lastCommand) {
      this.lastPlanAt = world.tick * TICK_MS;
      this.planSent[command.type] = (this.planSent[command.type] ?? 0) + 1;
    }
    this.lastCommand = null;
    for (const e of events) {
      if (e.type === "rejected") this.rejected[e.command] = (this.rejected[e.command] ?? 0) + 1;
      if (world.phase !== "wave" || this.options.pauses === false) continue;
      if (e.type === "trap-trigger") this.once(world,"first-trap");
      if (e.type === "house-pulse") this.once(world,"first-house");
      if (e.type === "banner" && e.stage === "plant") this.once(world,"banner");
    }
    if (world.phase === "wave" && this.options.pauses !== false && world.hero.hp < this.lastHp) this.once(world,"first-damage",CDP_TIMING.markMs + (CDP_TIMING.hurtMs[world.wave-1] || 1711));
    this.lastHp = world.hero.hp;
  }
  act(view: TypingView, nowMs: number, world?: World, commands: readonly SimCommand[] = []): SimCommand | null {
    if (world && world.phase !== this.phase) {
      this.phase = world.phase;
      if (world.phase === "wave") {
        this.waveAt = nowMs; this.target = null;
        if (this.options.pauses !== false) this.once(world,"start",(CDP_TIMING.startMs[world.wave-1] ?? 1540) + CDP_TIMING.markMs);
      }
      if (world.phase === "break") { this.target = null; this.lastPlanAt = nowMs; }
    }
    if (commands.length) this.lastPlanAt = nowMs;
    if (world?.phase === "break") {
      if (nowMs >= this.lastPlanAt + 1000) { this.lastPlanAt = Infinity; return this.send({type:"call-early"}); }
      return null;
    }
    if (world && world.phase !== "wave") return null;
    if (nowMs < this.readyAt) return null;
    if (!this.target) {
      if (world && this.options.pauses !== false) {
        if (nowMs-this.waveAt >= 20000) this.once(world,"mid20");
        if (nowMs-this.waveAt >= 45000) this.once(world,"mid45");
        if (view.words.length) this.once(world,"first-word");
        const foes=liveFoes(world), general=foes.find(f=>f.foe==="moss-banner");
        if (!view.words.length && foes.some(f=>metresFromDais(f)<=26)) this.once(world,"ff-try",350);
        this.maxLive=Math.max(this.maxLive,foes.length);
        if (foes.length>=Math.max(6,this.maxLive)&&nowMs-this.lastPeak>9000){this.lastPeak=nowMs;this.pending.set("peak",CDP_TIMING.markMs);}
        if (general && !this.sawGeneral){this.sawGeneral=true;this.once(world,"general");}
        if (general && !this.movedGeneral && metresFromDais(general)<20){this.movedGeneral=true;this.once(world,"general-move",CDP_TIMING.generalMs);}
        if (this.pending.size) {
          const ms=[...this.pending.values()].reduce((a,b)=>a+b,0);
          for (const [name,duration] of this.pending) this.pauses.push({wave:world.wave,name,atMs:nowMs,ms:duration});
          this.pending.clear(); this.readyAt=nowMs+ms; return null;
        }
      }
      if (world) {
        if (this.betweenStage<1 && world.enemies.live>=3 && nowMs-this.lastBreath>=8000){this.betweenStage=1;this.lastBreath=nowMs;return this.send({type:"skill",skill:"breath"});}
        this.betweenStage=Math.max(1,this.betweenStage);
        if (this.betweenStage<2 && world.enemies.live>=5 && nowMs-this.lastSky>=11000){this.betweenStage=2;this.lastSky=nowMs;return this.send({type:"skill",skill:"skyfire"});}
        this.betweenStage=Math.max(2,this.betweenStage);
        if (this.betweenStage<3 && world.combat.rage>=1000) {this.betweenStage=3;return this.send({type:"skill",skill:"inferno"});}
        this.betweenStage=Math.max(3,this.betweenStage);
        if (this.betweenStage<4 && world.hero.hp<world.hero.hpMax*.45) {this.betweenStage=4;return this.send({type:"consumable",item:"small-potion"});}
      }
      const next=pickCdp(view);
      if (!next){this.betweenStage=0;this.readyAt=nowMs+this.draw("poll");return null;}
      this.target={slot:next.slot,text:next.text,index:view.lock===next.slot?next.typed:0,slipped:false,burstUntil:0,lastCapture:false};
      if(world && !this.letterBurst && next.text.length-this.target.index>=6 && this.options.pauses!==false){this.letterBurst=true;this.target.burstUntil=nowMs+1626;}
      if(world && CDP_TIMING.selectionMs>0){this.readyAt=nowMs+CDP_TIMING.selectionMs;return null;}
    }
    const word=this.target;
    const retryCorrect=word.slipped;
    if(word.slipped){const again=pickCdp(view);if(!again||again.slot!==word.slot){this.target=null;return null;}word.slipped=false;}
    if(word.index>=word.text.length){this.target=null;return null;}
    const ch=word.text[word.index]!, aim=ch.charCodeAt(0)-97;
    const capture=world && this.options.pauses!==false && (CDP_TIMING.completeMs[world.wave-1]??0)>0 && !this.completeWaves.has(world.wave) && word.text.length>=2&&word.text.length<=5 && Number.isFinite(view.words.find(w=>w.slot===word.slot)?.distance);
    if(capture && word.index===word.text.length-1 && !word.lastCapture){word.lastCapture=true;this.readyAt=nowMs+120;return null;}
    let press=aim;
    if(!retryCorrect && !word.lastCapture && word.index>0 && this.rng.float()>.97){const near=CDP_NEAR[ch]??"q";press=near[Math.floor(this.rng.float()*near.length)]!.charCodeAt(0)-97;word.slipped=true;this.stats.slips++;}
    else word.index++;
    this.stats.keys++;
    let gap=word.lastCapture?200:this.draw("key");
    if(word.index===word.text.length){
      if(word.lastCapture&&world){this.completeWaves.add(world.wave);gap=Math.max(gap,(CDP_TIMING.completeMs[world.wave-1]??0)-120);}
      this.stats.finished++;this.target=null;this.betweenStage=0;
      this.readyAt=Math.max(nowMs+gap,word.burstUntil)+this.draw("word");
    } else this.readyAt=nowMs+gap;
    return this.send({type:"key",letter:press,ms:Math.round(nowMs)});
  }
}

const { standard: _standard, ...base } = BOTS.b35;
export const HUMAN_BOTS = {
  b35cdp: {...base,name:"b35cdp",label:"b35cdp",policy:{...base.policy,skills:false},typist:(rng:RngStream)=>new CdpTypist(rng)},
  b35human: {...base,name:"b35human",label:"b35human",mix:HUMAN_MIX,typist:(rng:RngStream)=>new HumanTypist(new Hands(base.hands!,rng))},
} satisfies Record<string,BotSpec>;
export type HumanBotName = keyof typeof HUMAN_BOTS;
export function findBot(name: string): BotSpec | undefined {
  return Object.hasOwn(BOTS,name) ? BOTS[name as keyof typeof BOTS] : Object.hasOwn(HUMAN_BOTS,name) ? HUMAN_BOTS[name as HumanBotName] : undefined;
}

export const percentile = (values: readonly number[], q: number): number | null => values.length ? [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.max(0,Math.ceil(q*values.length)-1))]! : null;
export interface WordChoice { readonly word: SeenWord; readonly view: TypingView }
export interface WaveFrame { choices?: readonly WordChoice[]; tick:number; wave:number; phase:string; hp:number; words:readonly SeenWord[]; lock:number; events:readonly SimEvent[] }
export interface HumanWave {
  wave:number; startTick:number; endTick:number; hpStart:number; hpMin:number; hpDrop:number; heroDamage:number;
  wordsCompleted:number; letters:number; lettersPerMinute:number; nearestCount:number; freeChoices:number; nearestPct:number|null;
  reaction:{p50:number|null;p90:number|null;n:number;samples:number[]};
  blightDamage:number; enemyDamage:number; healing:number; trapTriggers:number; trapKills:number;
}
/** One reusable pass over post-step frames. Keys are sent at tick-1; births use bornTick. */
export class WaveMeasure {
  private previous: WaveFrame | null = null;
  private readonly rows=new Map<number,HumanWave>();
  private readonly pending=new Map<string,number>();
  private readonly started=new Set<string>();
  observe(frame:WaveFrame):void {
    const prev=this.previous; this.previous=frame;
    let row=this.rows.get(frame.wave);
    if(frame.phase!=="wave" && !frame.events.some(e=>e.type==="wave-end")){
      if(row && row.endTick<0)row.endTick=frame.tick;
      return;
    }
    if(!row){row={wave:frame.wave,startTick:frame.tick,endTick:-1,hpStart:frame.hp,hpMin:frame.hp,hpDrop:0,heroDamage:0,wordsCompleted:0,letters:0,lettersPerMinute:0,nearestCount:0,freeChoices:0,nearestPct:null,reaction:{p50:null,p90:null,n:0,samples:[]},blightDamage:0,enemyDamage:0,healing:0,trapTriggers:0,trapKills:0};this.rows.set(frame.wave,row);}
    row.hpMin=Math.min(row.hpMin,frame.hp); row.hpDrop=Math.max(0,row.hpStart-row.hpMin);
    const oldWords=prev?.words??[];
    if(!oldWords.some(w=>!w.asleep)) for(const w of frame.words) if(!w.asleep)this.pending.set(frame.wave+":"+w.slot+":"+w.born,w.born);
    if(frame.choices) for(const {word,view} of frame.choices) {
      if(view.lock>=0||word.special||word.asleep)continue;
      const near=Math.min(...view.words.filter(w=>!w.asleep).map(w=>w.distance));
      row.freeChoices++;if(word.distance<=near)row.nearestCount++;
    }
    let tickDamage=0;
    for(const e of frame.events){
      if(e.type==="hit"&&e.target.kind==="hero"){row.heroDamage+=e.amount;tickDamage+=e.amount;if(e.source.kind==="enemy")row.enemyDamage+=e.amount;}
      if(e.type==="blight")row.blightDamage+=e.amount;
      if(e.type==="trap-trigger")row.trapTriggers++;
      if(e.type==="death"&&e.by==="trap")row.trapKills++;
      if(e.type==="word-complete")row.wordsCompleted++;
      if(e.type!=="word-progress"||e.letter<0)continue;
      // A switch and an advance can describe the same physical key.
      if(e.key==="switch")continue;
      row.letters++;
      const w=oldWords.find(w=>w.slot===e.word)??frame.words.find(w=>w.slot===e.word);
      if(!w)continue;
      const id=frame.wave+":"+w.slot+":"+w.born;
      if(!this.started.has(id)){
        this.started.add(id);
        const born=this.pending.get(id);
        if(born!==undefined){row.reaction.samples.push(Math.max(0,(frame.tick-1-born)*TICK_MS));this.pending.delete(id);}
        if(frame.choices===undefined&&(prev?.lock??-1)<0&&!w.special&&!w.asleep){const awake=oldWords.filter(w=>!w.asleep);const near=Math.min(...awake.map(w=>w.distance));row.freeChoices++;if(w.distance<=near)row.nearestCount++;}
      }
    }
    if(prev&&prev.wave===frame.wave)row.healing+=Math.max(0,frame.hp-prev.hp+tickDamage);
    if(frame.events.some(e=>e.type==="wave-end"))row.endTick=frame.tick;
  }
  finish():HumanWave[]{return [...this.rows.values()].map(r=>{const samples=r.reaction.samples;return {...r,endTick:r.endTick<0?(this.previous?.tick??r.startTick):r.endTick,lettersPerMinute:r.letters*3600/Math.max(1,(r.endTick<0?(this.previous?.tick??r.startTick):r.endTick)-r.startTick),nearestPct:r.freeChoices?r.nearestCount*100/r.freeChoices:null,reaction:{p50:percentile(samples,.5),p90:percentile(samples,.9),n:samples.length,samples:[...samples]}};});}
}
/** Decorate the same typist on the same dice, without extra draws or commands.
 * The old Typist's TS-private target is read only here for acquisition timing;
 * a first-key snapshot is too late when moving foes cross during recognition.
 */
export function measureRun(spec:BotSpec,options:RunOptions){
  const meter=new WaveMeasure();
  let choices:WordChoice[]=[];
  const measuredSpec:BotSpec=spec.hands===null&&!spec.typist?spec:{...spec,typist:rng=>{
    const typist:BotTypist=spec.typist?spec.typist(rng):new Typist(new Hands(spec.hands!,rng),spec.mix??null);
    return {
      get busy(){return typist.busy;},stats:typist.stats,hold:(now,ms)=>typist.hold(now,ms),
      observe:(world,events,commands)=>typist.observe?.(world,events,commands),
      act:(view,now,world,commands)=>{
        const before=Reflect.get(typist,"target");
        const command=typist.act(view,now,world,commands);
        const after=Reflect.get(typist,"target") as {slot:number;text:string}|null;
        if(after&&after!==before){const word=view.words.find(w=>w.slot===after.slot&&w.text===after.text);if(word)choices.push({word,view});}
        return command;
      },
    };
  }};
  const run=runBot(measuredSpec,{...options,onTick:(world,events,busy)=>{
    meter.observe({tick:world.tick,wave:world.wave,phase:world.phase,hp:world.hero.hp,words:readTyping(world,spec.aim,-1).words,lock:world.words.lock,events,choices});
    choices=[];
    options.onTick?.(world,events,busy);
  }});
  return {run,waves:meter.finish()};
}
