"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { ClientMessage, type BuildingKind } from "@rts/shared";
import { PixiRenderer, type StateView } from "./PixiRenderer";
import HUD, { type HudSnapshot } from "@/components/HUD";

function buildSnapshot(room: Room): HudSnapshot {
  const st = room.state as unknown as StateView;
  const me = room.sessionId;
  const players: HudSnapshot["players"] = [];
  let gold = 0;
  let myAllianceId = "";
  let currentTargetId = "";

  st.players.forEach((p) => {
    players.push({
      sessionId: p.sessionId,
      pseudo: p.pseudo,
      color: p.color,
      eliminated: p.eliminated,
      allianceId: p.allianceId,
    });
    if (p.sessionId === me) {
      gold = p.gold;
      myAllianceId = p.allianceId;
      currentTargetId = p.currentTargetId;
    }
  });

  const winner = st.winnerId ? st.players.get(st.winnerId) : undefined;
  return {
    phase: st.phase,
    gold: Math.floor(gold),
    mySessionId: me,
    winnerId: st.winnerId,
    winnerPseudo: winner?.pseudo ?? "",
    lobbyCountdownMs: st.lobbyCountdownMs,
    elapsedMs: st.elapsedMs,
    timeLimitMs: st.timeLimitMs,
    players,
    myAllianceId,
    currentTargetId,
  };
}

export default function GameCanvas({ room }: { room: Room }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const buildMode = useRef<BuildingKind | null>(null);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [pendingBuild, setPendingBuild] = useState<BuildingKind | null>(null);
  const [invites, setInvites] = useState<{ fromPlayerId: string; fromPseudo: string }[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new PixiRenderer(
      host,
      () => room.state as unknown as StateView,
      () => room.sessionId,
      {
        onWorldClick: (x, y, enemyOwnerId) => {
          if (buildMode.current) {
            room.send(ClientMessage.Build, { kind: buildMode.current, x, y });
            buildMode.current = null;
            setPendingBuild(null);
            return;
          }
          if (enemyOwnerId) {
            room.send(ClientMessage.AttackTarget, { targetPlayerId: enemyOwnerId });
            return;
          }
          room.send(ClientMessage.MoveKing, { x, y });
        },
      },
    );
    void renderer.init();

    const onInvite = (msg: { fromPlayerId: string; fromPseudo: string }) =>
      setInvites((cur) =>
        cur.some((i) => i.fromPlayerId === msg.fromPlayerId) ? cur : [...cur, msg],
      );
    room.onMessage("alliance_invite", onInvite);

    const interval = window.setInterval(() => setSnap(buildSnapshot(room)), 150);

    return () => {
      window.clearInterval(interval);
      renderer.destroy();
    };
  }, [room]);

  function selectBuild(kind: BuildingKind) {
    buildMode.current = buildMode.current === kind ? null : kind;
    setPendingBuild(buildMode.current);
  }

  return (
    <div className="relative w-screen h-screen">
      <div ref={hostRef} className="absolute inset-0" />
      <HUD
        snap={snap}
        pendingBuild={pendingBuild}
        invites={invites}
        onSelectBuild={selectBuild}
        onTrain={(unit) => room.send(ClientMessage.TrainTroop, { unit })}
        onRequestAlliance={(id) => room.send(ClientMessage.AllianceRequest, { targetPlayerId: id })}
        onAcceptAlliance={(fromPlayerId) => {
          room.send(ClientMessage.AllianceAccept, { fromPlayerId });
          setInvites((cur) => cur.filter((i) => i.fromPlayerId !== fromPlayerId));
        }}
      />
    </div>
  );
}
