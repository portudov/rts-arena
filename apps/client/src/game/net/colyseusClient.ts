import { Client, type Room } from "colyseus.js";

const WS_URL = process.env.NEXT_PUBLIC_COLYSEUS_URL ?? "ws://localhost:2567";

/** Rejoint (ou crée) une room "arena". Le token (JWT Supabase ou pseudo invité) part dans onAuth. */
export async function joinArena(token: string): Promise<Room> {
  const client = new Client(WS_URL);
  return client.joinOrCreate("arena", { token });
}
