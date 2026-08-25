import { useCallback, useEffect, useRef, useState } from "react";
import { HexEngine, toRoman, SPELLS, type SpellId, type HudData, type GameEvent } from "./game/engine";

/* ============================ inline icons ============================ */

const Skull = ({ size = 14, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M12 2C7 2 4 5.6 4 10c0 2.6 1.2 4.6 3 6v4h2v-2h2v2h2v-2h2v2h2v-4c1.8-1.4 3-3.4 3-6 0-4.4-3-8-8-8Z" fill="currentColor" />
    <circle cx="9" cy="10.5" r="2" fill="#0a0a0a" />
    <circle cx="15" cy="10.5" r="2" fill="#0a0a0a" />
    <path d="M11 14h2l-1 2-1-2Z" fill="#0a0a0a" />
  </svg>
);

const SoulFlame = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-1.8-.8-3-1.5-4C13.6 9.6 15 11 15 11c2-1.5 1-5-3-9Z" fill="currentColor" />
    <path d="M7 19h10v2H7z" fill="currentColor" opacity="0.7" />
  </svg>
);

const Cartridge = ({ filled }: { filled: boolean }) => (
  <svg width="10" height="26" viewBox="0 0 10 26">
    <path d="M2 6h6l1 3v13H1V9l1-3Z" fill={filled ? "#e8e2d2" : "none"} stroke="#8a867a" strokeWidth="1.4" />
    <rect x="3" y="1" width="4" height="4" fill={filled ? "#e8e2d2" : "none"} stroke="#8a867a" strokeWidth="1.4" />
  </svg>
);

const SoulfireIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2c.6 3.4-3.6 5-3.6 9a3.6 3.6 0 0 0 7.2 0c0-1.5-.6-2.6-1.3-3.5-.6 1.2.4 2 .4 2C16.4 8 15.6 5 12 2Z" fill="currentColor" />
    <circle cx="10.6" cy="11.4" r="0.9" fill="#0a0a0a" />
    <circle cx="13.4" cy="11.4" r="0.9" fill="#0a0a0a" />
    <path d="M10.8 14c.8.6 1.6.6 2.4 0" stroke="#0a0a0a" strokeWidth="1.1" />
    <path d="M6 18h12M8 21h8" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const BonestormIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M20 12a8 8 0 1 1-2.3-5.6" stroke="currentColor" strokeWidth="1.8" />
    <path d="M20 3v4h-4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8.5 10.5h7M9.5 8.5v4M14.5 8.5v4M10 13.5l-1 2.5M14 13.5l1 2.5" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="14.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="9" cy="16.3" r="1" fill="currentColor" />
    <circle cx="15" cy="16.3" r="1" fill="currentColor" />
  </svg>
);

const StormcallIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M7 9a4 4 0 0 1 3.8-5A4.5 4.5 0 0 1 15 6.5 3.5 3.5 0 0 1 17.5 9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M4 12h16" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2.4" />
    <path d="M13 13l-3.4 4.5H12L10 22l5-6h-2.6L14 13h-1Z" fill="currentColor" />
  </svg>
);

const BloodCometIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="16" cy="8" r="4.4" fill="currentColor" />
    <circle cx="14.6" cy="6.6" r="1.2" fill="#0a0a0a" opacity="0.4" />
    <path d="M12.6 11.4 3 21l3.4-.6L4.6 22l6-4.4-.8 2.2L15 13" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

const RevolverIcon = ({ size = 90 }: { size?: number }) => (
  <svg width={size} height={size * 0.42} viewBox="0 0 120 50" fill="none" className="text-bone">
    <path d="M6 18h78l6 3v7l-8 3H56l-4 9c-2 5-6 8-12 8h-8l3-8c1-3 3-5 6-7l4-3H6v-12Z" fill="currentColor" />
    <circle cx="52" cy="24" r="8" fill="#0a0a0a" stroke="currentColor" strokeWidth="2" />
    <circle cx="52" cy="24" r="2.6" fill="currentColor" />
    <path d="M84 20h30v4H84z" fill="currentColor" />
    <path d="M40 31h12l-2 8H32l8-8Z" fill="#0a0a0a" />
    <path d="M96 15v3M104 15v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const GoblinGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 6c-3 0-5 2.4-5 5.5 0 3.6 2.2 6.5 5 6.5s5-2.9 5-6.5C17 8.4 15 6 12 6Z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M7.4 8 2 6l4 5M16.6 8 22 6l-4 5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="10" cy="11.5" r="1.1" fill="currentColor" />
    <circle cx="14" cy="11.5" r="1.1" fill="currentColor" />
  </svg>
);

const WraithGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 3c-4 0-6 3-6 7v10l2-2 2 2 2-2 2 2 2-2 2 2V10c0-4-2-7-6-7Z" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="10" cy="10" r="1.1" fill="currentColor" />
    <circle cx="14" cy="10" r="1.1" fill="currentColor" />
  </svg>
);

const BruteGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="7" width="14" height="12" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5 10 2 7m17 3 3-3M9 19v2m6-2v2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9.5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="14.5" cy="12" r="1.1" fill="currentColor" />
    <path d="M9 16l1.2-1.5L12 16l1.8-1.5L15 16" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

function spellIcon(id: SpellId, size = 26) {
  if (id === "bonestorm") return <BonestormIcon size={size} />;
  if (id === "stormcall") return <StormcallIcon size={size} />;
  if (id === "bloodcomet") return <BloodCometIcon size={size} />;
  return <SoulfireIcon size={size} />;
}

/* ============================ HUD pieces ============================ */

const DEFAULT_HUD: HudData = {
  hp: 100, maxHp: 100, souls: 100, maxSouls: 100, ammo: 6, maxAmmo: 6,
  reloading: false, reloadProgress: 0, score: 0, kills: 0, wave: 0, enemiesLeft: 0,
  slotReady: 1, equippedSpell: "soulfire", spellCharges: -1, spellMax: 0,
  slots: [{ id: "soulfire", charges: -1, max: 0 }, null, null, null],
  state: "menu", paused: false, muted: false, fps: 60,
};

interface FeedItem { id: number; text: string; dying: boolean; color?: string }

function GrimoireBar({ hud }: { hud: HudData }) {
  return (
    <div className="flex items-stretch gap-1.5">
      {hud.slots.map((s, i) => {
        if (!s) {
          return (
            <div key={i} className="flex h-[58px] w-[64px] items-center justify-center border-2 border-dashed border-ash/25 bg-black/40">
              <span className="font-display text-xl text-ash/30">{i + 1}</span>
            </div>
          );
        }
        const sp = SPELLS[s.id];
        const equipped = hud.equippedSpell === s.id;
        const affordable = hud.souls >= sp.cost;
        const ready = hud.slotReady >= 1 || !equipped;
        const lit = equipped && ready && affordable;
        const infinite = s.max === 0;
        return (
          <div key={i} className="relative h-[58px] w-[64px] border-2 bg-black/70 px-1 pt-1 text-center transition-colors"
            style={{
              borderColor: equipped ? sp.css : "rgba(138,134,122,0.45)",
              boxShadow: equipped ? (lit ? `0 0 14px ${sp.css}44, inset 0 0 10px ${sp.css}22` : `inset 0 0 10px ${sp.css}14`) : undefined,
            }}>
            <span className="absolute left-0.5 top-0 font-display text-[11px] leading-none text-ash">{i + 1}</span>
            <div className="mt-1.5 flex justify-center" style={{ color: equipped ? sp.css : "#8a867a", filter: equipped && lit ? `drop-shadow(0 0 5px ${sp.css}88)` : undefined, opacity: equipped ? 1 : 0.75 }}>
              {spellIcon(s.id, 22)}
            </div>
            <div className="mt-1 leading-none">
              {infinite ? (
                <span className="text-[9px] text-bone/80">&#8734;</span>
              ) : (
                <span className="font-display text-[13px] leading-none" style={{ color: s.charges > 2 ? sp.css : "#f2ecd9" }}>{s.charges}</span>
              )}
            </div>
            {equipped && !ready && (
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: `conic-gradient(rgba(6,6,6,0.8) ${Math.round((1 - hud.slotReady) * 360)}deg, transparent 0deg)` }} />
            )}
          </div>
        );
      })}
      <div className="ml-1 self-center text-[9px] leading-tight tracking-[0.14em] text-ash/80">
        RMB — HEX<br />1-4 / WHEEL — SWAP
      </div>
    </div>
  );
}

function Crosshair({ hitKey, shotKey }: { hitKey: number; shotKey: number }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
      <svg key={`s${shotKey}`} width="46" height="46" viewBox="0 0 46 46" className="crosshair-kick">
        <circle cx="23" cy="23" r="1.7" fill="#e8e2d2" />
        <path d="M23 8v7M23 31v7M8 23h7M31 23h7" stroke="#e8e2d2" strokeWidth="2" />
      </svg>
      {hitKey > 0 && (
        <svg key={`h${hitKey}`} width="46" height="46" viewBox="0 0 46 46" className="absolute inset-0 hitmarker">
          <path d="M12 12l8 8M34 12l-8 8M12 34l8-8M34 34l-8-8" stroke="#f2ecd9" strokeWidth="3" />
        </svg>
      )}
    </div>
  );
}

/* ============================ app ============================ */

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<HexEngine | null>(null);

  const [hud, setHud] = useState<HudData>(DEFAULT_HUD);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [hitKey, setHitKey] = useState(0);
  const [shotKey, setShotKey] = useState(0);
  const [dmgKey, setDmgKey] = useState(0);
  const [healKey, setHealKey] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [flashColor, setFlashColor] = useState("#e8e2d2");
  const [banner, setBanner] = useState<{ key: number; wave: number; sub: string } | null>(null);
  const [spellToast, setSpellToast] = useState<{ key: number; text: string; color: string } | null>(null);
  const [deathStats, setDeathStats] = useState<GameEvent["stats"] | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const feedId = useRef(0);

  const handleEvent = useCallback((e: GameEvent) => {
    switch (e.type) {
      case "kill":
        if (e.text) {
          const id = ++feedId.current;
          setFeed((f) => [...f.slice(-3), { id, text: e.text!, dying: false }]);
          setTimeout(() => setFeed((f) => f.map((i) => (i.id === id ? { ...i, dying: true } : i))), 2600);
          setTimeout(() => setFeed((f) => f.filter((i) => i.id !== id)), 3200);
        }
        break;
      case "hit": setHitKey((k) => k + 1); break;
      case "damage": setDmgKey((k) => k + 1); break;
      case "heal": setHealKey((k) => k + 1); break;
      case "flash": setFlashColor("#e8e2d2"); setFlashKey((k) => k + 1); break;
      case "empty": setShotKey((k) => k + 1); break;
      case "wave": setBanner({ key: (e.wave ?? 1) * 1000 + Date.now() % 1000, wave: e.wave ?? 1, sub: e.sub ?? "" }); break;
      case "dead": setDeathStats(e.stats ?? null); break;
      case "spell": {
        const color = e.color ?? "#e8e2d2";
        const id = ++feedId.current;
        const key = Date.now();
        setFeed((f) => [...f.slice(-3), { id, text: e.text ?? "", dying: false, color }]);
        setTimeout(() => setFeed((f) => f.map((i) => (i.id === id ? { ...i, dying: true } : i))), 3000);
        setTimeout(() => setFeed((f) => f.filter((i) => i.id !== id)), 3600);
        setSpellToast({ key, text: e.text ?? "", color });
        setTimeout(() => setSpellToast((t) => (t && t.key === key ? null : t)), 2300);
        setFlashColor(color);
        setFlashKey((k) => k + 1);
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const engine = new HexEngine(containerRef.current, canvasRef.current, setHud, handleEvent);
    engineRef.current = engine;
    return () => engine.destroy();
  }, [handleEvent]);

  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = engineRef.current;
      if (!st) return;
      if (e.code === "Enter") {
        if (hud.state === "menu" || hud.state === "dead") st.begin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hud.state]);

  const eng = () => engineRef.current;
  const playing = hud.state === "playing";
  const lowHp = playing && hud.hp <= 30;

  const TIPS = [
    "TIP \u2014 The cylinder holds six. Count them, or the crypt counts for you.",
    "TIP \u2014 Souls buy hexes. Kill, and the dungeon pays interest.",
    "TIP \u2014 Soulfire drinks: every kill it takes refunds 12 souls.",
    "TIP \u2014 Grimoires drop from the rabble. Seize them, swap with 1\u20134.",
    "TIP \u2014 Brutes telegraph the smash. Step aside, collect the debt.",
    "TIP \u2014 Stormcall strikes where you look. Aim at the biggest skull.",
  ];

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden bg-pit ${playing && !hud.paused ? "cursor-none" : ""}`}>
      <canvas ref={canvasRef} className="pixelated absolute inset-0 h-full w-full" />

      {/* film layers */}
      <div className="fx-vignette pointer-events-none absolute inset-0 z-10" />
      <div className="fx-scanlines pointer-events-none absolute inset-0 z-10" />
      <div className="fx-grain pointer-events-none absolute -inset-10 z-10" />
      {lowHp && <div className="low-hp pointer-events-none absolute inset-0 z-10" />}
      {dmgKey > 0 && <div key={`d${dmgKey}`} className="dmg-flash pointer-events-none absolute inset-0 z-20" />}
      {healKey > 0 && <div key={`h${healKey}`} className="heal-flash pointer-events-none absolute inset-0 z-20" />}
      {flashKey > 0 && (
        <div key={`f${flashKey}`} className="pointer-events-none absolute inset-0 z-20" style={{ background: flashColor, opacity: 0.3, animation: "dmg-out 0.5s ease-out forwards" }} />
      )}

      {/* ============================ HUD ============================ */}
      {playing && (
        <div className="pointer-events-none absolute inset-0 z-30 font-type text-bone">
          <Crosshair hitKey={hitKey} shotKey={shotKey} />

          {/* top-left: the ledger */}
          <div className="absolute left-5 top-5">
            <div className="flex items-baseline gap-3">
              <div className="font-display text-5xl font-bold leading-none tracking-wide">
                {hud.wave > 0 ? toRoman(hud.wave) : "\u2014"}
              </div>
              <div>
                <div className="text-[10px] tracking-[0.3em] text-ash">WAVE</div>
                <div className="text-[11px] tracking-[0.18em] text-bone/85 mt-0.5 flex items-center gap-1.5">
                  <Skull size={12} /> {hud.enemiesLeft} LEFT IN THE CRYPT
                </div>
              </div>
            </div>
            <div className="mt-3 border-l-2 border-bone/60 pl-3">
              <div className="text-[10px] tracking-[0.3em] text-ash">BOUNTY COLLECTED</div>
              <div className="font-display text-3xl leading-none mt-0.5">{hud.score.toLocaleString()}</div>
              <div className="text-[11px] text-ash mt-1 tracking-[0.14em]">{hud.kills} KILLS {"\u00B7"} {hud.fps} FPS</div>
            </div>
          </div>

          {/* top-right: kill feed */}
          <div className="absolute right-5 top-5 flex w-72 flex-col items-end gap-1.5">
            {feed.map((f) => (
              <div key={f.id} className={`feed-in ${f.dying ? "feed-out" : ""} border-r-2 bg-black/60 px-2.5 py-1 text-[11px] leading-snug`}
                style={{ borderColor: f.color ?? "rgba(232,226,210,0.7)", color: f.color ? f.color : "rgba(232,226,210,0.9)", textShadow: f.color ? `0 0 10px ${f.color}66` : undefined }}>
                <span className="mr-1.5 opacity-60">{"\u2020"}</span>{f.text}
              </div>
            ))}
            {hud.muted && <div className="mt-1 text-[10px] tracking-[0.25em] text-ash">{"SILENCED \u2014 [M]"}</div>}
          </div>

          {/* bottom-left: vitals */}
          <div className="absolute bottom-6 left-5 w-72">
            <div className="flex items-center justify-between text-[11px] tracking-[0.2em]">
              <span className="flex items-center gap-1.5"><Skull size={13} /> VITALS</span>
              <span className={hud.hp <= 30 ? "text-bone reload-blink" : "text-ash"}>{hud.hp}</span>
            </div>
            <div className="bar-shell mt-1 h-4 w-full">
              <div className={`bar-fill h-full ${hud.hp <= 30 ? "danger" : ""}`} style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }} />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] tracking-[0.2em]">
              <span className="flex items-center gap-1.5 text-ash"><SoulFlame size={13} /> SOULS</span>
              <span className="text-ash">{hud.souls}</span>
            </div>
            <div className="bar-shell mt-1 h-2.5 w-full">
              <div className="bar-fill soul h-full" style={{ width: `${(hud.souls / hud.maxSouls) * 100}%` }} />
            </div>
          </div>

          {/* bottom-right: the piece */}
          <div className="absolute bottom-6 right-5 flex flex-col items-end">
            <div className="flex items-end gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={`transition-transform ${i < hud.ammo ? "" : "translate-y-0.5 opacity-40"}`}>
                  <Cartridge filled={i < hud.ammo} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {hud.reloading ? (
                <div className="reload-blink text-[11px] tracking-[0.3em] text-bone">{"SPINNING THE CYLINDER\u2026"}</div>
              ) : hud.ammo === 0 ? (
                <div className="reload-blink text-[11px] tracking-[0.3em] text-bone">{"DRY \u2014 PRESS R"}</div>
              ) : (
                <div className="text-[10px] tracking-[0.25em] text-ash">{"R \u2014 RELOAD"}</div>
              )}
            </div>
            {hud.reloading && (
              <div className="bar-shell mt-1.5 h-1.5 w-40">
                <div className="bar-fill h-full" style={{ width: `${hud.reloadProgress * 100}%` }} />
              </div>
            )}
          </div>

          {/* bottom-center: grimoire inventory */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
            <GrimoireBar hud={hud} />
          </div>

          {/* grimoire toast */}
          {spellToast && (
            <div key={spellToast.key} className="spell-toast absolute bottom-28 left-1/2 -translate-x-1/2 font-display text-2xl font-bold tracking-[0.12em]"
              style={{ color: spellToast.color, textShadow: `0 0 16px ${spellToast.color}aa, 3px 3px 0 #0a0a0a` }}>
              {spellToast.text}
            </div>
          )}

          {/* wave banner */}
          {banner && (
            <div key={banner.key} className="absolute left-1/2 top-[30%] -translate-x-1/2 text-center">
              <div className="banner-in font-display text-7xl font-bold tracking-[0.14em] text-bone" style={{ textShadow: "4px 4px 0 #0a0a0a, -1px -1px 0 #0a0a0a" }}>
                WAVE {toRoman(banner.wave)}
              </div>
              <div className="banner-sub-in mt-2 text-[13px] tracking-[0.3em] text-ash">{banner.sub.toUpperCase()}</div>
            </div>
          )}
        </div>
      )}

      {/* ============================ TITLE ============================ */}
      {hud.state === "menu" && (
        <div className="absolute inset-0 z-40 flex" style={{ background: "radial-gradient(ellipse 90% 90% at 50% 40%, rgba(6,6,6,0.35) 0%, rgba(4,4,4,0.9) 100%)" }}>
          <div className="torch-glow pointer-events-none absolute left-[8%] top-[18%] h-40 w-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(232,226,210,0.14), transparent 70%)" }} />
          <div className="torch-glow pointer-events-none absolute right-[10%] bottom-[22%] h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(232,226,210,0.1), transparent 70%)", animationDelay: "1.2s" }} />

          <div className="flex w-full flex-col justify-center gap-10 px-8 md:flex-row md:items-center md:justify-between md:px-16 lg:px-24">
            <div className="max-w-xl">
              <div className="flex items-center gap-3 text-[11px] tracking-[0.42em] text-ash">
                <span className="inline-block h-px w-10 bg-ash" /> {"CONTRACT \u21166 \u2014 THE UNDERCROFT"}
              </div>
              <h1 className="flicker font-display mt-3 text-[19vw] font-black leading-[0.82] text-bone md:text-[7.5rem] lg:text-[9rem]"
                style={{ textShadow: "6px 6px 0 #0a0a0a, 10px 10px 0 rgba(232,226,210,0.12)" }}>
                HEX<span className="text-ash">SLINGER</span>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-bone/80">
                {"You are the last debt-collector of the Ashen Syndicate \u2014 a wizard who swapped the staff for a six-chambered judge. The goblin rabble took the crypt. "}
                <span className="text-bone">Repossess it.</span>
              </p>
              <div className="mt-4 flex items-center gap-4 text-bone/70">
                <RevolverIcon />
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button className="btn-racket text-sm" onClick={() => eng()?.begin()}>
                  {"\u25B6 TAKE THE CONTRACT"}
                </button>
                <span className="text-[11px] tracking-[0.2em] text-ash">or press <kbd className="key">ENTER</kbd></span>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[10px] tracking-[0.18em] text-ash">
                <span><kbd className="key">W</kbd><kbd className="key">A</kbd><kbd className="key">S</kbd><kbd className="key">D</kbd> MOVE</span>
                <span><kbd className="key">LMB</kbd> HANDCANNON</span>
                <span><kbd className="key">RMB</kbd> HEX</span>
                <span><kbd className="key">1-4</kbd> GRIMOIRE</span>
                <span><kbd className="key">SHIFT</kbd> SPRINT</span>
                <span><kbd className="key">SPACE</kbd> VAULT</span>
              </div>
              <div className="mt-3 text-[10px] tracking-[0.14em] text-ash/80">
                {"GRIMOIRES DROP FROM THE RABBLE \u2014 SEIZE THEM TO FILL YOUR HEX SLOTS."}
              </div>
            </div>

            <div className="panel-racket w-full max-w-sm p-6 md:mr-6">
              <div className="flex items-center justify-between border-b border-bone/30 pb-2">
                <span className="font-display text-2xl font-bold tracking-wide">BOUNTY LEDGER</span>
                <Skull size={20} className="text-ash" />
              </div>
              <div className="mt-4 space-y-3 text-[12px]">
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><GoblinGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">{"GOBLIN SCAB \u2014 fast, packs a shiv, comes in packs."}</span>
                  <span className="font-display text-lg text-bone">100</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><WraithGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">{"CRYPT WRAITH \u2014 strafes like a duelist's ghost."}</span>
                  <span className="font-display text-lg text-bone">150</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><BruteGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">{"BONE BRUTE \u2014 slow. Expensive to put down."}</span>
                  <span className="font-display text-lg text-bone">250</span>
                </div>
              </div>
              <div className="mt-4 border-t border-bone/30 pt-3">
                <div className="text-[10px] tracking-[0.3em] text-ash">THE GRIMOIRES</div>
                <div className="mt-2 space-y-1.5 text-[11px] leading-snug">
                  <div className="flex items-center gap-2" style={{ color: SPELLS.bonestorm.css }}><BonestormIcon size={16} /> <span className="text-bone/85">{"BONESTORM \u2014 a grinding cyclone of knuckle-shards."}</span></div>
                  <div className="flex items-center gap-2" style={{ color: SPELLS.stormcall.css }}><StormcallIcon size={16} /> <span className="text-bone/85">{"STORMCALL \u2014 three forked bolts off the ceiling."}</span></div>
                  <div className="flex items-center gap-2" style={{ color: SPELLS.bloodcomet.css }}><BloodCometIcon size={16} /> <span className="text-bone/85">{"BLOODCOMET \u2014 a clot that leaves a burning pool."}</span></div>
                </div>
              </div>
              <div className="mt-4 border-t border-bone/30 pt-3 text-[10px] leading-relaxed tracking-[0.12em] text-ash">
                {"PAYMENT IN SOULS \u25C8 \u2014 SOULFIRE IS SOUL-FED FOREVER."}<br />
                {"SOULS REGROW. GREED DOESN'T RELOAD."}
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-0 right-0 text-center">
            <div key={tipIdx} className="ticker mx-auto inline-block text-[11px] tracking-[0.22em] text-ash">
              {TIPS[tipIdx % TIPS.length]}
            </div>
          </div>
        </div>
      )}

      {/* ============================ PAUSE ============================ */}
      {playing && hud.paused && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="panel-racket w-full max-w-md p-8 text-center">
            <div className="text-[11px] tracking-[0.4em] text-ash">THE RACKET PAUSES FOR NO ONE</div>
            <div className="font-display mt-1 text-6xl font-bold text-bone" style={{ textShadow: "4px 4px 0 #0a0a0a" }}>
              INTERMISSION
            </div>
            <div className="mt-7 flex flex-col items-center gap-3">
              <button className="btn-racket w-56 text-sm" onClick={() => eng()?.resume()}>BACK TO WORK</button>
              <button className="btn-racket w-56 text-sm" onClick={() => eng()?.toMenu()}>SURRENDER THE CRYPT</button>
              <button className="btn-racket w-56 text-sm" onClick={() => eng()?.toggleMute()}>
                {hud.muted ? "UNSILENCE \u2014 M" : "SILENCE \u2014 M"}
              </button>
            </div>
            <div className="mt-6 text-[10px] leading-relaxed tracking-[0.16em] text-ash">
              WAVE {hud.wave > 0 ? toRoman(hud.wave) : "\u2014"} {"\u00B7"} {hud.kills} KILLS {"\u00B7"} {hud.score.toLocaleString()} BOUNTY
            </div>
          </div>
        </div>
      )}

      {/* ============================ DEATH ============================ */}
      {hud.state === "dead" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(6,6,6,0.55), rgba(3,3,3,0.94))" }}>
          <div className="max-w-xl px-8 text-center">
            <div className="text-[11px] tracking-[0.45em] text-ash">CAUSE OF DEATH: BUSINESS</div>
            <h2 className="font-display mt-2 text-6xl font-black leading-[0.9] text-bone md:text-8xl" style={{ textShadow: "5px 5px 0 #0a0a0a, 9px 9px 0 rgba(232,226,210,0.1)" }}>
              YOUR NUMBER<br />CAME UP
            </h2>
            {deathStats && (
              <div className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-px border-2 border-bone/50 bg-bone/25 text-left md:grid-cols-4">
                {[
                  ["BOUNTY", deathStats.score.toLocaleString()],
                  ["KILLS", `${deathStats.kills}`],
                  ["WAVE", toRoman(deathStats.wave)],
                  ["ACCURACY", `${deathStats.accuracy}%`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-pit/95 px-4 py-3">
                    <div className="text-[9px] tracking-[0.25em] text-ash">{k}</div>
                    <div className="font-display text-2xl leading-tight text-bone">{v}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button className="btn-racket text-sm" onClick={() => eng()?.begin()}>{"\u25B2 RISE AGAIN"}</button>
              <button className="btn-racket text-sm" onClick={() => eng()?.toMenu()}>BACK TO THE SURFACE</button>
            </div>
            <div className="mt-4 text-[11px] tracking-[0.2em] text-ash">press <kbd className="key">ENTER</kbd> to renegotiate</div>
          </div>
        </div>
      )}
    </div>
  );
}
