import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-5xl font-bold">⚔️ RTS Arena</h1>
      <p className="opacity-70 max-w-md text-center">
        Protège ton Roi, bâtis ton économie, désigne une cible et lance tes troupes.
        Dernier Roi (ou alliance) debout = victoire.
      </p>
      <div className="flex gap-4">
        <Link
          href="/play"
          className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold transition"
        >
          Jouer
        </Link>
        <Link
          href="/login"
          className="px-6 py-3 rounded bg-slate-700 hover:bg-slate-600 transition"
        >
          Connexion
        </Link>
      </div>
    </main>
  );
}
