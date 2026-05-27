"use client";

import { GameConfig, UNITS, UNIT_KINDS, type BuildingKind, type UnitKind } from "@rts/shared";

export interface HudPlayer {
  sessionId: string;
  pseudo: string;
  color: number;
  eliminated: boolean;
  allianceId: string;
}

export interface HudSnapshot {
  phase: string;
  gold: number;
  mySessionId: string;
  winnerId: string;
  winnerPseudo: string;
  lobbyCountdownMs: number;
  elapsedMs: number;
  timeLimitMs: number;
  players: HudPlayer[];
  myAllianceId: string;
  currentTargetId: string;
}

interface Props {
  snap: HudSnapshot | null;
  pendingBuild: BuildingKind | null;
  invites: { fromPlayerId: string; fromPseudo: string }[];
  onSelectBuild: (k: BuildingKind) => void;
  onTrain: (unit: UnitKind) => void;
  onRequestAlliance: (id: string) => void;
  onAcceptAlliance: (id: string) => void;
}

function label(k: BuildingKind): string {
  return k === "goldmine" ? "⛏️ Mine" : k === "barracks" ? "🏰 Caserne" : "🗼 Tour";
}
function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function colorHex(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

export default function HUD(props: Props) {
  const { snap } = props;
  if (!snap) return null;
  const others = snap.players.filter((p) => p.sessionId !== snap.mySessionId);

  return (
    <>
      <div className="absolute top-3 left-3 flex gap-3 items-center pointer-events-none">
        <div className="px-3 py-1.5 rounded bg-black/60 font-bold text-amber-300">💰 {snap.gold}</div>
        {snap.phase === "playing" && (
          <div className="px-3 py-1.5 rounded bg-black/50 text-sm">
            {fmtTime(snap.timeLimitMs - snap.elapsedMs)}
          </div>
        )}
      </div>

      {snap.phase === "lobby" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-center space-y-2">
            <p className="text-2xl font-bold">En attente de joueurs…</p>
            <p className="opacity-70">{snap.players.length} joueur(s) connecté(s)</p>
            {snap.lobbyCountdownMs > 0 && (
              <p className="text-emerald-400">Départ dans {Math.ceil(snap.lobbyCountdownMs / 1000)}s</p>
            )}
          </div>
        </div>
      )}

      {snap.phase === "ended" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center space-y-3">
            <p className="text-3xl font-bold">
              {snap.winnerId === snap.mySessionId
                ? "🏆 Victoire !"
                : `Fin — vainqueur : ${snap.winnerPseudo || "—"}`}
            </p>
            <a href="/" className="inline-block px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500">
              Accueil
            </a>
          </div>
        </div>
      )}

      {snap.phase === "playing" && (
        <>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {(["goldmine", "barracks", "tower"] as BuildingKind[]).map((k) => (
              <button
                key={k}
                onClick={() => props.onSelectBuild(k)}
                className={`px-3 py-2 rounded text-sm ${
                  props.pendingBuild === k ? "bg-emerald-500" : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {label(k)} <span className="opacity-60">({GameConfig.BUILDINGS[k].cost})</span>
              </button>
            ))}
            {UNIT_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => props.onTrain(k)}
                className="px-3 py-2 rounded text-sm bg-indigo-600 hover:bg-indigo-500"
              >
                {k === "infantry" ? "⚔️" : k === "archer" ? "🏹" : "🐎"} {UNITS[k].name}{" "}
                <span className="opacity-60">({UNITS[k].cost})</span>
              </button>
            ))}
          </div>

          <div className="absolute bottom-3 left-3 text-xs opacity-60 max-w-[230px] pointer-events-none">
            Clic = déplacer le Roi · Clic sur un ennemi = envoyer les troupes ·{" "}
            {props.pendingBuild ? "clic au sol pour bâtir" : "choisis un bâtiment puis clique"}
          </div>

          <div className="absolute top-3 right-3 w-56 space-y-1">
            {others.map((p) => {
              const allied = p.allianceId !== "" && p.allianceId === snap.myAllianceId;
              const target = snap.currentTargetId === p.sessionId;
              return (
                <div
                  key={p.sessionId}
                  className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-black/50 text-sm"
                >
                  <span className="flex items-center gap-1 truncate">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ background: colorHex(p.color) }}
                    />
                    <span className={`truncate ${p.eliminated ? "line-through opacity-40" : ""}`}>
                      {p.pseudo}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {target && <span className="text-red-400 text-xs">⚔</span>}
                    {!p.eliminated &&
                      (allied ? (
                        <span className="text-emerald-400 text-xs">allié</span>
                      ) : (
                        <button
                          onClick={() => props.onRequestAlliance(p.sessionId)}
                          className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600"
                        >
                          allier
                        </button>
                      ))}
                  </span>
                </div>
              );
            })}
            {props.invites.map((inv) => (
              <div
                key={inv.fromPlayerId}
                className="flex items-center justify-between px-2 py-1 rounded bg-amber-900/60 text-sm"
              >
                <span className="truncate">{inv.fromPseudo} veut s&apos;allier</span>
                <button
                  onClick={() => props.onAcceptAlliance(inv.fromPlayerId)}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500"
                >
                  accepter
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
