import { createServer } from "http";
import { Server } from "colyseus";
import { Encoder } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/ArenaRoom";

// Grande carte (120×120 = 14 400 tuiles synchronisées) + jusqu'à 8 joueurs et leurs troupes :
// l'état complet encodé dépasse de loin le BUFFER_SIZE par défaut (8 KB) de @colyseus/schema.
// Sans ça, l'encodage de l'état échoue ("buffer overflow") → la synchro ne part jamais →
// le client est déconnecté → en solo onLeave élimine le joueur → la partie se "termine"
// en quelques secondes. On agrandit le buffer une bonne fois (allocation unique au démarrage).
Encoder.BUFFER_SIZE = 1024 * 1024; // 1 MB

const port = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("arena", ArenaRoom);

gameServer
  .listen(port)
  .then(() => console.log(`⚔  Serveur Colyseus (arena) en écoute sur :${port}`))
  .catch((e) => {
    console.error("Échec démarrage serveur:", e);
    process.exit(1);
  });
