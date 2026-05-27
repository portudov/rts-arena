import { Client, type Room } from "colyseus.js";

const WS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL ?? "ws://localhost:2567";

/** Rejoint (ou crée) une room "arena" multijoueur. Le token part dans onAuth. */
export async function joinArena(token: string): Promise<Room> {
  const client = new Client(WS_URL);
  return client.joinOrCreate("arena", { token });
}

/** Crée une room SOLO dédiée (1 humain vs `bots` IA), démarrage immédiat. */
export async function createSoloArena(token: string, bots = 1): Promise<Room> {
  const client = new Client(WS_URL);
  return client.create("arena", { token, mode: "solo", bots });
}
