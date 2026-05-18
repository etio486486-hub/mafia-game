"use client";

import { useEffect, useState } from "react";
import { MVP_PLAYER_COUNT } from "@/lib/constants";
import { useGameStore } from "@/store/gameStore";
import type { SeatConfig } from "@/types/game";
import {
  buildInviteUrl,
  createRoomOnline,
  disconnectOnline,
  getWsUrl,
  joinRoomOnline,
  pingGameServer,
  startOnlineGame,
  type RoomLobbyPayload,
} from "@/multiplayer/socketClient";

const DEFAULT_SEATS: SeatConfig[] = [
  { isHuman: true, name: "나" },
  { isHuman: false, name: "AI 김 과장" },
  { isHuman: false, name: "AI 이 대리" },
  { isHuman: false, name: "AI 박 사원" },
];

function OnlineLobbySection() {
  const [lobby, setLobby] = useState<RoomLobbyPayload | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [serverOk, setServerOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const r = params.get("room");
    if (r) setJoinCode(r.toUpperCase());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void pingGameServer().then((ok) => {
      if (!cancelled) setServerOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onLobby = (p: RoomLobbyPayload) => {
    setLobby(p);
    setRoomCode(p.roomCode);
  };

  const handleCreate = async () => {
    setError(null);
    setLoading(true);
    try {
      const { roomCode: code } = await createRoomOnline(
        name.trim() || "호스트",
        onLobby,
      );
      setRoomCode(code);
      setIsHost(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "방 만들기 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setError("방 코드를 입력하세요.");
      setLoading(false);
      return;
    }
    try {
      await joinRoomOnline(code, name.trim() || "손님", onLobby);
      setIsHost(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입장 실패");
    } finally {
      setLoading(false);
    }
  };

  const filled =
    lobby?.members.filter((m) => m.connected && m.name).length ?? 0;

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      await startOnlineGame();
    } catch (e) {
      setError(e instanceof Error ? e.message : "시작 실패");
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = roomCode ? buildInviteUrl(roomCode) : "";

  return (
    <div className="rounded-2xl border border-indigo-500/40 bg-indigo-950/30 p-5">
      <h2 className="text-lg font-semibold text-indigo-200">온라인 (4인)</h2>
      <p className="mt-1 text-xs text-slate-500">
        Socket 서버:{" "}
        <code className="text-slate-400">{getWsUrl()}</code>
        {serverOk === true && (
          <span className="ml-2 text-emerald-400">● 연결됨</span>
        )}
        {serverOk === false && (
          <span className="ml-2 text-red-400">
            ● 꺼짐 — 터미널에서 npm run dev:all 실행
          </span>
        )}
      </p>

      <div className="mt-4 space-y-3">
        <label className="block text-xs text-slate-400">표시 이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
          placeholder="닉네임"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {loading ? "연결 중…" : "방 만들기"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-3">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="방 코드"
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm uppercase tracking-widest"
          />
          <button
            type="button"
            disabled={loading}
            onClick={handleJoin}
            className="rounded-lg border border-indigo-500/60 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-40"
          >
            {loading ? "연결 중…" : "코드로 입장"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {lobby && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-200">
              방 코드:{" "}
              <span className="font-mono text-amber-300">{lobby.roomCode}</span>
            </p>
            {inviteUrl && (
              <button
                type="button"
                className="text-xs text-indigo-300 underline"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                }}
              >
                초대 링크 복사
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {lobby.members.map((m) => (
              <li key={m.seatIndex}>
                P{m.seatIndex + 1} {m.name ?? "(빈 자리)"}{" "}
                {m.connected ? "" : " · 연결 끊김"}
              </li>
            ))}
          </ul>
          {isHost && (
            <button
              type="button"
              disabled={loading || filled < MVP_PLAYER_COUNT}
              onClick={handleStart}
              className="mt-3 w-full rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              4명 모이면 시작 ({filled}/4)
            </button>
          )}
          <button
            type="button"
            className="mt-2 w-full text-xs text-slate-500 hover:text-slate-300"
            onClick={() => {
              disconnectOnline();
              setLobby(null);
              setRoomCode(null);
              setError(null);
            }}
          >
            방 나가기
          </button>
        </div>
      )}
    </div>
  );
}

export function LobbyScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const [seats, setSeats] = useState<SeatConfig[]>(DEFAULT_SEATS);
  const [tab, setTab] = useState<"local" | "online">("local");

  const humanCount = seats.filter((s) => s.isHuman).length;

  const toggleSeat = (index: number) => {
    setSeats((prev) =>
      prev.map((seat, i) =>
        i === index ? { ...seat, isHuman: !seat.isHuman } : seat,
      ),
    );
  };

  const setName = (index: number, nameVal: string) => {
    setSeats((prev) =>
      prev.map((seat, i) => (i === index ? { ...seat, name: nameVal } : seat)),
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">달무티</h1>
        <p className="mt-2 text-sm text-slate-400">
          로컬(AI) 또는 온라인으로 친구와 플레이
        </p>
      </div>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setTab("local")}
          className={[
            "rounded-full px-4 py-1.5 text-sm",
            tab === "local"
              ? "bg-amber-600 text-white"
              : "bg-slate-800 text-slate-400",
          ].join(" ")}
        >
          로컬
        </button>
        <button
          type="button"
          onClick={() => setTab("online")}
          className={[
            "rounded-full px-4 py-1.5 text-sm",
            tab === "online"
              ? "bg-indigo-600 text-white"
              : "bg-slate-800 text-slate-400",
          ].join(" ")}
        >
          온라인 초대
        </button>
      </div>

      {tab === "online" ? (
        <OnlineLobbySection />
      ) : (
        <>
          <ul className="space-y-3">
            {seats.map((seat, index) => (
              <li
                key={index}
                className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3"
              >
                <button
                  type="button"
                  onClick={() => toggleSeat(index)}
                  className={[
                    "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
                    seat.isHuman
                      ? "bg-amber-600 text-white"
                      : "bg-slate-700 text-slate-300",
                  ].join(" ")}
                >
                  {seat.isHuman ? "사람" : "AI"}
                </button>
                <input
                  type="text"
                  value={seat.name ?? ""}
                  onChange={(e) => setName(index, e.target.value)}
                  placeholder={seat.isHuman ? "닉네임" : "AI 이름"}
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
                <span className="text-xs text-slate-500">P{index + 1}</span>
              </li>
            ))}
          </ul>

          <p className="text-center text-xs text-slate-500">
            {humanCount === 0
              ? "최소 1명은 사람으로 설정하세요."
              : `${humanCount}명 참가 · ${MVP_PLAYER_COUNT - humanCount}명 AI`}
          </p>

          <button
            type="button"
            disabled={humanCount === 0}
            onClick={() => startNewGame(seats)}
            className="rounded-xl bg-amber-600 px-8 py-3 font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            게임 시작
          </button>
        </>
      )}
    </main>
  );
}
