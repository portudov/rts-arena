"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { joinArena } from "@/game/net/colyseusClient";
import { supabase } from "@/lib/supabaseClient";
import GameCanvas from "@/game/GameCanvas";

export default function PlayPage() {
  const [room, setRoom] = useState<Room | null>(null);
  const [pseudo, setPseudo] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [err, setErr] = useState("");
  const connecting = useRef(false);

  async function connect(token: string) {
    if (connecting.current) return;
    connecting.current = true;
    setStatus("connecting");
    setErr("");
    try {
      const r = await joinArena(token);
      setRoom(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      connecting.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      const tok = data.session?.access_token;
      if (tok && active) void connect(tok);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          placeholder="Ton pseudo (invité)"
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect(pseudo || `Invité-${Math.floor(Math.random() * 999)}`);
          }}
        />
        <button
          onClick={() => void connect(pseudo || `Invité-${Math.floor(Math.random() * 999)}`)}
          className="w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500"
        >
          Jouer
        </button>
        <p className="text-xs opacity-50">
          Le pseudo sert d&apos;identité invité si Supabase n&apos;est pas configuré.
        </p>
      </div>
    </main>
  );
}
