"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { joinArena, createSoloArena } from "@/game/net/colyseusClient";
import { supabase } from "@/lib/supabaseClient";
import GameCanvas from "@/game/GameCanvas";

export default function PlayPage() {
  const [room, setRoom] = useState<Room | null>(null);
  const [pseudo, setPseudo] = useState("");
  const [bots, setBots] = useState(1);
  const [difficulty, setDifficulty] = useState("normal");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [err, setErr] = useState("");
  const connecting = useRef(false);

  async function connect(joiner: (token: string) => Promise<Room>) {
    if (connecting.current) return;
    connecting.current = true;
    setStatus("connecting");
    setErr("");
    let token = pseudo.trim() || `Invité-${Math.floor(Math.random() * 999)}`;
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) token = data.session.access_token;
      }
      const r = await joiner(token);
      setRoom(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      connecting.current = false;
    }
  }

  useEffect(() => {
    return () => {
      room?.leave();
    };
  }, [room]);

  if (room) return <GameCanvas room={room} />;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">Rejoindre une arène</h1>
        {status === "connecting" && <p className="opacity-70">Connexion…</p>}
        {status === "error" && <p className="text-red-400 text-sm">Échec : {err}</p>}

        <input
          className="w-full px-3 py-2 rounded bg-slate-800 outline-none text-center"
          placeholder="Ton pseudo"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
        />

        <button
          onClick={() => connect((t) => createSoloArena(t, bots, difficulty))}
          className="w-full px-4 py-3 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold"
        >
          🤖 Jouer en solo (vs IA)
        </button>

        <div className="flex items-center justify-center gap-2 text-sm opacity-80">
          <span>Adversaires&nbsp;:</span>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => setBots(n)}
              className={`w-8 h-8 rounded ${bots === n ? "bg-emerald-500" : "bg-slate-700 hover:bg-slate-600"}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 text-sm opacity-80">
          <span>Difficulté&nbsp;:</span>
          {(
            [
              ["easy", "Facile"],
              ["normal", "Normal"],
              ["hard", "Difficile"],
            ] as const
          ).map(([d, lbl]) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`px-3 h-8 rounded ${difficulty === d ? "bg-emerald-500" : "bg-slate-700 hover:bg-slate-600"}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-3">
          <button
            onClick={() => connect((t) => joinArena(t))}
            className="w-full px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
          >
            👥 Multijoueur (2 joueurs min.)
          </button>
        </div>

        <p className="text-xs opacity-50">
          Solo : démarre tout de suite contre des bots. Multi : attend un 2ᵉ joueur humain.
        </p>
      </div>
    </main>
  );
}
