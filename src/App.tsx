import { useCallback, useEffect, useRef, useState } from "react";
import { HexEngine, toRoman, SPELLS, type HudData, type GameEvent, type SpellId } from "./game/engine";

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
    <path d="M2 6h6l1 3v13H1V9l1-3Z" fill={filled ? "#ff9432" : "none"} stroke={filled ? "#c56f22" : "#8a867a"} strokeWidth="1.4" />
    <rect x="3" y="1" width="4" height="4" fill={filled ? "#ffd9a0" : "none"} stroke={filled ? "#c56f22" : "#8a867a"} strokeWidth="1.4" />
  </svg>
);

const HellboltIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 1l2 6 6-2-4 5 7 2-7 2 4 5-6-2-2 6-2-6-6 2 4-5-7-2 7-2-4-5 6 2 2-6Z" fill="currentColor" />
  </svg>
);

const NovaIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
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

/* ============================ HUD pieces ============================ */

const DEFAULT_HUD: HudData = {
  hp: 100, maxHp: 100, souls: 100, maxSouls: 100, ammo: 6, maxAmmo: 6,
  reloading: false, reloadProgress: 0, score: 0, kills: 0, wave: 0, enemiesLeft: 0,
  slotReady: 1, equippedSpell: "hellbolt", spellCharges: 0, spellMax: 0,
  novaReady: 1, state: "menu", paused: false, muted: false, fps: 60,
};

interface FeedItem { id: number; text: string; dying: boolean; color?: string }

const MortarIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 3c-3.4 0-5.5 2.5-5.5 6 0 2.7 1.4 4.8 3.5 5.6V17h4v-2.4c2.1-.8 3.5-2.9 3.5-5.6 0-3.5-2.1-6-5.5-6Z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9.8" cy="9" r="1.3" fill="currentColor" />
    <circle cx="14.2" cy="9" r="1.3" fill="currentColor" />
    <path d="M10.5 12.5h3M8 20h8M10 17v3M14 17v3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ChainIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M13 2 5 13h5l-2 9 9-13h-5l3-7h-2Z" fill="currentColor" />
  </svg>
);

const LanceIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M21 3l-8.5 8.5M21 3l-1 5M21 3l-5 1" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12.5 11.5 3 21M6.5 14.5l3 3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 7.5l2.5 2.5" stroke="currentColor" strokeWidth="2.6" />
  </svg>
);

function spellIcon(id: SpellId, size = 26) {
  if (id === "mortar") return <MortarIcon size={size} />;
  if (id === "chain") return <ChainIcon size={size} />;
  if (id === "lance") return <LanceIcon size={size} />;
  return <HellboltIcon size={size} />;
}

function HexSlot({ hud }: { hud: HudData }) {
  const sp = SPELLS[hud.equippedSpell];
  const ready = hud.slotReady >= 1;
  const affordable = hud.souls >= sp.cost;
  const on = ready && affordable;
  const deg = Math.round((1 - Math.max(0, Math.min(1, hud.slotReady))) * 360);
  const infinite = hud.spellMax === 0;
  return (
    <div className="relative flex items-center gap-3 border-2 bg-black/70 px-3 py-2"
      style={{ borderColor: on ? sp.css : "rgba(138,134,122,0.5)", boxShadow: on ? `0 0 18px ${sp.css}33, inset 0 0 14px ${sp.css}1a` : undefined }}>
      <div className={on ? "" : "opacity-45"} style={on ? { color: sp.css, filter: `drop-shadow(0 0 7px ${sp.css}88)` } : { color: "#8a867a" }}>
        {spellIcon(hud.equippedSpell, 30)}
      </div>
      <div>
        <div className="font-type text-[11px] leading-none tracking-[0.18em]" style={{ color: on ? sp.css : "#8a867a" }}>
          {sp.name}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[9px] leading-none text-ash">
          <kbd className="key !text-[8px] !px-1 !py-0">RMB</kbd>
          <span style={affordable ? { color: sp.css } : { color: "#e8e2d2" }}>{sp.cost}◈</span>
          {infinite ? (
            <span className="tracking-[0.14em] text-bone/70">SOUL-FED ∞</span>
          ) : (
            <span className="flex items-center gap-[2px]">
              {Array.from({ length: hud.spellMax }).map((_, i) => (
                <span key={i} className="inline-block h-2 w-[4px]"
                  style={{ background: i < hud.spellCharges ? sp.css : "rgba(138,134,122,0.35)" }} />
              ))}
            </span>
          )}
        </div>
      </div>
      {!ready && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `conic-gradient(rgba(6,6,6,0.82) ${deg}deg, transparent 0deg)` }} />
      )}
    </div>
  );
}

function NovaChip({ hud }: { hud: HudData }) {
  const on = hud.novaReady >= 1 && hud.souls >= 55;
  const deg = Math.round((1 - Math.max(0, Math.min(1, hud.novaReady))) * 360);
  return (
    <div className={`relative border-2 px-2 py-2 text-center ${on ? "border-bone/70 bg-black/70" : "border-ash/40 bg-black/50"}`}>
      <div className={`flex justify-center ${on ? "text-bone" : "text-ash/60"}`}><NovaIcon size={18} /></div>
      <div className="mt-0.5 text-[8px] leading-none tracking-[0.14em] text-ash">
        <kbd className="key !text-[8px] !px-1 !py-0">Q</kbd> 55◈
      </div>
      {!on && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `conic-gradient(rgba(6,6,6,0.82) ${deg}deg, transparent 0deg)` }} />
      )}
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
  const [deathStats, setDeathStats] = useState<GameEvent["stats"] | null>(null);
  const [spellToast, setSpellToast] = useState<{ key: number; text: string; color: string } | null>(null);
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
    "TIP — The cylinder holds six. Count them, or the crypt counts for you.",
    "TIP — Souls buy hellfire. Kill, and the dungeon pays interest.",
    "TIP — Brutes telegraph the smash. Step aside, collect the debt.",
    "TIP — A grave nova clears a room. It also clears your soul ledger.",
    "TIP — Wraiths strafe. Lead your shots like a street duel.",
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
        <div key={`f${flashKey}`} className="pointer-events-none absolute inset-0 z-20" style={{ background: flashColor, opacity: 0.32, animation: "dmg-out 0.5s ease-out forwards" }} />
      )}

      {/* ============================ HUD ============================ */}
      {playing && (
        <div className="pointer-events-none absolute inset-0 z-30 font-type text-bone">
          <Crosshair hitKey={hitKey} shotKey={shotKey} />

          {/* top-left: the ledger */}
          <div className="absolute left-5 top-5">
            <div className="flex items-baseline gap-3">
              <div className="font-display text-5xl font-bold leading-none tracking-wide">
                {hud.wave > 0 ? toRoman(hud.wave) : "—"}
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
              <div className="text-[11px] text-ash mt-1 tracking-[0.14em]">{hud.kills} KILLS · {hud.fps} FPS</div>
            </div>
          </div>

          {/* top-right: kill feed */}
          <div className="absolute right-5 top-5 flex w-72 flex-col items-end gap-1.5">
            {feed.map((f) => (
              <div key={f.id} className={`feed-in ${f.dying ? "feed-out" : ""} border-r-2 bg-black/60 px-2.5 py-1 text-[11px] leading-snug`}
                style={{ borderColor: f.color ?? "rgba(232,226,210,0.7)", color: f.color ? f.color : "rgba(232,226,210,0.9)", textShadow: f.color ? `0 0 10px ${f.color}66` : undefined }}>
                <span className="mr-1.5 opacity-60">†</span>{f.text}
              </div>
            ))}
            {hud.muted && <div className="mt-1 text-[10px] tracking-[0.25em] text-ash">SILENCED — [M]</div>}
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
                <div className="reload-blink text-[11px] tracking-[0.3em] text-bone">SPINNING THE CYLINDER…</div>
              ) : hud.ammo === 0 ? (
                <div className="reload-blink text-[11px] tracking-[0.3em] text-bone">DRY — PRESS R</div>
              ) : (
                <div className="text-[10px] tracking-[0.25em] text-ash">R — RELOAD</div>
              )}
            </div>
            {hud.reloading && (
              <div className="bar-shell mt-1.5 h-1.5 w-40">
                <div className="bar-fill h-full" style={{ width: `${hud.reloadProgress * 100}%` }} />
              </div>
            )}
          </div>

          {/* bottom-center: the hex slot + fixed nova */}
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-end gap-2.5">
            <HexSlot hud={hud} />
            <NovaChip hud={hud} />
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
          {/* torch ambience */}
          <div className="torch-glow pointer-events-none absolute left-[8%] top-[18%] h-40 w-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(232,226,210,0.14), transparent 70%)" }} />
          <div className="torch-glow pointer-events-none absolute right-[10%] bottom-[22%] h-52 w-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(232,226,210,0.1), transparent 70%)", animationDelay: "1.2s" }} />

          <div className="flex w-full flex-col justify-center gap-10 px-8 md:flex-row md:items-center md:justify-between md:px-16 lg:px-24">
            {/* left: the name */}
            <div className="max-w-xl">
              <div className="flex items-center gap-3 text-[11px] tracking-[0.42em] text-ash">
                <span className="inline-block h-px w-10 bg-ash" /> CONTRACT №6 — THE UNDERCROFT
              </div>
              <h1 className="flicker font-display mt-3 text-[19vw] font-black leading-[0.82] text-bone md:text-[7.5rem] lg:text-[9rem]"
                style={{ textShadow: "6px 6px 0 #0a0a0a, 10px 10px 0 rgba(232,226,210,0.12)" }}>
                HEX<span className="text-ash">SLINGER</span>
              </h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-bone/80">
                You are the last debt-collector of the Ashen Syndicate — a wizard who swapped the staff for a
                six-chambered judge. The goblin rabble took the crypt. <span className="text-bone">Repossess it.</span>
              </p>
              <div className="mt-4 flex items-center gap-4 text-bone/70">
                <RevolverIcon />
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button className="btn-racket text-sm" onClick={() => eng()?.begin()}>
                  ▶ TAKE THE CONTRACT
                </button>
                <span className="text-[11px] tracking-[0.2em] text-ash">or press <kbd className="key">ENTER</kbd></span>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[10px] tracking-[0.18em] text-ash">
                <span><kbd className="key">W</kbd><kbd className="key">A</kbd><kbd className="key">S</kbd><kbd className="key">D</kbd> MOVE</span>
                <span><kbd className="key">LMB</kbd> HANDCANNON</span>
                <span><kbd className="key">RMB</kbd> HEX SLOT</span>
                <span><kbd className="key">Q</kbd> NOVA</span>
                <span><kbd className="key">SHIFT</kbd> SPRINT</span>
                <span><kbd className="key">SPACE</kbd> VAULT</span>
              </div>
              <div className="mt-3 text-[10px] tracking-[0.14em] text-ash/80">
                GRIMOIRES DROP FROM THE RABBLE — SEIZE THEM TO SWAP YOUR HEX.
              </div>
            </div>

            {/* right: the dossier */}
            <div className="panel-racket w-full max-w-sm p-6 md:mr-6">
              <div className="flex items-center justify-between border-b border-bone/30 pb-2">
                <span className="font-display text-2xl font-bold tracking-wide">BOUNTY LEDGER</span>
                <Skull size={20} className="text-ash" />
              </div>
              <div className="mt-4 space-y-3 text-[12px]">
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><GoblinGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">GOBLIN SCAB — fast, packs a shiv, comes in packs.</span>
                  <span className="font-display text-lg text-bone">100</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><WraithGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">CRYPT WRAITH — strafes like a duelists' ghost.</span>
                  <span className="font-display text-lg text-bone">150</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-bone/80"><BruteGlyph /></span>
                  <span className="flex-1 leading-snug text-bone/85">BONE BRUTE — slow. Expensive to put down.</span>
                  <span className="font-display text-lg text-bone">250</span>
                </div>
              </div>
              <div className="mt-5 border-t border-bone/30 pt-3 text-[10px] leading-relaxed tracking-[0.12em] text-ash">
                ONE HEX SLOT ◈ — HELLBOLT IS SOUL-FED FOREVER.<br />
                SKULLMORTAR · CHAIN HEX · CRIMSON LANCE DROP AS GRIMOIRES, CHARGES AND ALL.<br />
                SOULS REGROW. GREED DOESN'T RELOAD.
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
                {hud.muted ? "UNSILENCE — M" : "SILENCE — M"}
              </button>
            </div>
            <div className="mt-6 text-[10px] leading-relaxed tracking-[0.16em] text-ash">
              WAVE {hud.wave > 0 ? toRoman(hud.wave) : "—"} · {hud.kills} KILLS · {hud.score.toLocaleString()} BOUNTY
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
              <button className="btn-racket text-sm" onClick={() => eng()?.begin()}>▲ RISE AGAIN</button>
              <button className="btn-racket text-sm" onClick={() => eng()?.toMenu()}>BACK TO THE SURFACE</button>
            </div>
            <div className="mt-4 text-[11px] tracking-[0.2em] text-ash">press <kbd className="key">ENTER</kbd> to renegotiate</div>
          </div>
        </div>
      )}
    </div>
  );
}
