"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!supabase) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Mode invité</h1>
          <p className="opacity-70">
            Supabase n&apos;est pas configuré. Tu joueras en invité — choisis simplement un pseudo
            sur l&apos;écran de jeu.
          </p>
          <a href="/play" className="inline-block px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500">
            Aller jouer
          </a>
        </div>
      </main>
    );
  }

  const sb = supabase;

  async function signIn() {
    setBusy(true);
    setMsg("");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.push("/play");
  }

  async function signUp() {
    setBusy(true);
    setMsg("");
    const { error } = await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg("Compte créé. Vérifie tes emails si la confirmation est activée, puis connecte-toi.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Connexion</h1>
        <input
          className="w-full px-3 py-2 rounded bg-slate-800 outline-none"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 rounded bg-slate-800 outline-none"
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {msg && <p className="text-sm text-amber-400">{msg}</p>}
        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={signIn}
            className="flex-1 px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            Se connecter
          </button>
          <button
            disabled={busy}
            onClick={signUp}
            className="flex-1 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
          >
            Créer un compte
          </button>
        </div>
      </div>
    </main>
  );
}
