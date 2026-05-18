"use client";

import { io, type Socket } from "socket.io-client";
import { useGameStore } from "@/store/gameStore";
import {
  clearOnlineEmitters,
  setOnlineEmitters,
} from "@/multiplayer/onlineEmitters";
import type { GameState } from "@/types/game";

const WS_URL =
  typeof process.env.NEXT_PUBLIC_WS_URL === "string"
    ? process.env.NEXT_PUBLIC_WS_URL
    : "http://localhost:3333";

let socket: Socket | null = null;

export function getWsUrl(): string {
  return WS_URL;
}

/** HTTP /health — Socket 서버가 켜져 있는지 확인 */
export async function pingGameServer(): Promise<boolean> {
  try {
    const res = await fetch(`${WS_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export function buildInviteUrl(roomCode: string): string {
  if (typeof window === "undefined") return "";
  const code = roomCode.trim().toUpperCase();
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

/** 서버가 꺼져 있으면 emit ACK가 오지 않아 멈추는 것을 막기 위함 */
function waitForSocketConnect(s: Socket, ms = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (s.connected) {
      resolve();
      return;
    }
    const onOk = () => {
      clearTimeout(timer);
      s.off("connect_error", onErr);
      resolve();
    };
    const onErr = () => {
      clearTimeout(timer);
      s.off("connect", onOk);
      reject(
        new Error(
          "서버에 연결할 수 없습니다. 터미널에서 npm run dev:server 또는 npm run dev:all을 실행했는지 확인하세요.",
        ),
      );
    };
    const timer = setTimeout(() => {
      s.off("connect", onOk);
      s.off("connect_error", onErr);
      reject(
        new Error(
          "연결 시간 초과: Socket 서버(보통 포트 3333)가 켜져 있는지 확인하세요.",
        ),
      );
    }, ms);
    s.once("connect", onOk);
    s.once("connect_error", onErr);
  });
}

function wireCoreHandlers(s: Socket) {
  s.off("game-sync");
  s.off("session-ended");

  s.on(
    "game-sync",
    (payload: {
      state: GameState;
      mySeatIndex: number;
      myHand: GameState["players"][0]["hand"];
    }) => {
      useGameStore.getState().applyServerSync(payload.state, {
        mySeatIndex: payload.mySeatIndex,
        myHand: payload.myHand,
      });
    },
  );

  s.on("session-ended", () => {
    disconnectOnline();
    useGameStore.getState().resetToLocalLobby();
    window.alert("방이 종료되었습니다.");
  });

  setOnlineEmitters({
    submitPlay: (cardIds) => {
      s.emit("game:play", { cardIds });
    },
    submitPass: () => {
      s.emit("game:pass", {});
    },
    submitTax: (cardIds) => {
      s.emit("game:tax", { cardIds });
    },
    requestNextRound: () => {
      s.emit("game:next-round", {});
    },
  });
}

export function disconnectOnline(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  clearOnlineEmitters();
}

export type LobbyMember = {
  seatIndex: number;
  name: string | null;
  connected: boolean;
};

export type RoomLobbyPayload = {
  roomCode: string;
  members: LobbyMember[];
  hostSocketId: string;
};

export interface CreateRoomResult {
  roomCode: string;
  seatIndex: number;
}

export async function createRoomOnline(
  name: string,
  onLobbyUpdate: (p: RoomLobbyPayload) => void,
): Promise<CreateRoomResult> {
  disconnectOnline();
  socket = io(WS_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 10_000,
  });

  socket.on("room-lobby", (p: RoomLobbyPayload) => onLobbyUpdate(p));
  wireCoreHandlers(socket);

  try {
    await waitForSocketConnect(socket);
  } catch (e) {
    disconnectOnline();
    throw e;
  }

  return new Promise((resolve, reject) => {
    socket!.emit(
      "create-room",
      { name },
      (res: {
        ok?: boolean;
        roomCode?: string;
        seatIndex?: number;
        error?: string;
      }) => {
        if (
          res?.ok &&
          res.roomCode !== undefined &&
          res.seatIndex !== undefined
        ) {
          resolve({ roomCode: res.roomCode, seatIndex: res.seatIndex });
        } else {
          disconnectOnline();
          reject(new Error(res?.error ?? "create failed"));
        }
      },
    );
  });
}

export async function joinRoomOnline(
  code: string,
  name: string,
  onLobbyUpdate: (p: RoomLobbyPayload) => void,
): Promise<CreateRoomResult> {
  disconnectOnline();
  socket = io(WS_URL, {
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 10_000,
  });

  socket.on("room-lobby", (p: RoomLobbyPayload) => onLobbyUpdate(p));
  wireCoreHandlers(socket);

  try {
    await waitForSocketConnect(socket);
  } catch (e) {
    disconnectOnline();
    throw e;
  }

  return new Promise((resolve, reject) => {
    socket!.emit(
      "join-room",
      { code, name },
      (res: {
        ok?: boolean;
        roomCode?: string;
        seatIndex?: number;
        error?: string;
      }) => {
        if (
          res?.ok &&
          res.roomCode !== undefined &&
          res.seatIndex !== undefined
        ) {
          resolve({ roomCode: res.roomCode, seatIndex: res.seatIndex });
        } else {
          disconnectOnline();
          reject(new Error(res?.error ?? "join failed"));
        }
      },
    );
  });
}

export function startOnlineGame(): Promise<void> {
  if (!socket?.connected) {
    return Promise.reject(new Error("not connected"));
  }
  return new Promise((resolve, reject) => {
    socket!.emit("start-game", {}, (res: { ok?: boolean; error?: string }) => {
      if (res?.ok) resolve();
      else reject(new Error(res?.error ?? "start failed"));
    });
  });
}
