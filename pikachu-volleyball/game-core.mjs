export const W = 900;
export const H = 500;
export const GROUND = H - 48;
export const NET_X = W / 2;
export const NET_W = 10;
export const WIN_SCORE = 15;

const PLAYER_CONTROLS = {
  1: { left: "KeyA", right: "KeyD", jump: "KeyW", thunder: "KeyS" },
  2: { left: "KeyF", right: "KeyH", jump: "KeyT", thunder: "KeyG" },
  3: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", thunder: "ArrowDown" },
  4: { left: "KeyJ", right: "KeyL", jump: "KeyI", thunder: "KeyK" },
};

function makePlayer(id, team, x) {
  return {
    id,
    team,
    x,
    y: GROUND,
    vx: 0,
    vy: 0,
    w: 44,
    h: 52,
    onGround: true,
    thunderTimer: 0,
    thunderCd: 0,
    facing: team === "A" ? 1 : -1,
    color: team === "A" ? "#ffeb3b" : "#fff176",
    cheek: team === "A" ? "#e53935" : "#42a5f5",
    input: { left: false, right: false, jump: false, thunder: false },
  };
}

export function createInitialPlayers() {
  return [
    makePlayer(1, "A", W * 0.22),
    makePlayer(2, "A", W * 0.38),
    makePlayer(3, "B", W * 0.62),
    makePlayer(4, "B", W * 0.78),
  ];
}

export function getPlayerControls(id) {
  return PLAYER_CONTROLS[id];
}

function teamBounds(team) {
  const margin = 24;
  if (team === "A") return { min: margin, max: NET_X - NET_W / 2 - 8 };
  return { min: NET_X + NET_W / 2 + 8, max: W - margin };
}

export class PikachuVolleyballSim {
  constructor() {
    this.state = {
      running: false,
      paused: true,
      scoreA: 0,
      scoreB: 0,
      serveTeam: "A",
      rallyActive: false,
      message: "",
      messageTimer: 0,
      serveDelay: 0,
    };
    this.ball = { x: NET_X, y: GROUND - 120, vx: 0, vy: 0, r: 14, spin: 0 };
    this.players = createInitialPlayers();
  }

  setPlayerInput(playerId, input) {
    const p = this.players.find((pl) => pl.id === playerId);
    if (!p) return;
    p.input = {
      left: !!input.left,
      right: !!input.right,
      jump: !!input.jump,
      thunder: !!input.thunder,
    };
  }

  setLocalKeys(keys) {
    for (const p of this.players) {
      const c = PLAYER_CONTROLS[p.id];
      p.input = {
        left: !!keys[c.left],
        right: !!keys[c.right],
        jump: !!keys[c.jump],
        thunder: !!keys[c.thunder],
      };
    }
  }

  resetPositions() {
    const ax = [W * 0.22, W * 0.38];
    const bx = [W * 0.62, W * 0.78];
    let ai = 0;
    let bi = 0;
    for (const p of this.players) {
      if (p.team === "A") p.x = ax[ai++];
      else p.x = bx[bi++];
      p.y = GROUND;
      p.vx = 0;
      p.vy = 0;
      p.onGround = true;
      p.thunderTimer = 0;
      p.thunderCd = 0;
    }
  }

  resetBall(serveTeam) {
    this.ball.x = serveTeam === "A" ? NET_X - 80 : NET_X + 80;
    this.ball.y = GROUND - 100;
    this.ball.vx = serveTeam === "A" ? 3.5 : -3.5;
    this.ball.vy = -9;
    this.ball.spin = 0;
    this.state.rallyActive = true;
    this.state.serveDelay = 0;
  }

  startMatch() {
    this.state.scoreA = 0;
    this.state.scoreB = 0;
    this.state.serveTeam = "A";
    this.state.running = true;
    this.state.paused = false;
    this.state.message = "";
    this.state.messageTimer = 0;
    this.state.serveDelay = 0;
    this.resetPositions();
    this.resetBall("A");
  }

  stopMatch() {
    this.state.running = false;
    this.state.paused = true;
  }

  updatePlayer(p, dt) {
    const bounds = teamBounds(p.team);
    const speed = 5.2;
    const jump = -13.5;
    const inp = p.input;

    if (p.thunderCd > 0) p.thunderCd -= dt;
    if (p.thunderTimer > 0) {
      p.thunderTimer -= dt;
      return;
    }

    if (inp.left) {
      p.vx = -speed;
      p.facing = -1;
    } else if (inp.right) {
      p.vx = speed;
      p.facing = 1;
    } else {
      p.vx *= 0.75;
    }

    if (inp.jump && p.onGround) {
      p.vy = jump;
      p.onGround = false;
    }

    if (inp.thunder && p.thunderCd <= 0 && p.onGround) {
      p.thunderTimer = 0.35;
      p.thunderCd = 1.2;
      p.vy = -4;
      p.onGround = false;
    }

    p.vy += 0.55;
    p.x += p.vx;
    p.y += p.vy;

    if (p.y >= GROUND) {
      p.y = GROUND;
      p.vy = 0;
      p.onGround = true;
    }

    p.x = Math.max(bounds.min + p.w / 2, Math.min(bounds.max - p.w / 2, p.x));
  }

  hitBallFromPlayer(p) {
    const ball = this.ball;
    const headY = p.y - p.h + 8;
    const hitW = p.w * 0.9;
    const dx = ball.x - p.x;
    const dy = ball.y - headY;

    if (Math.abs(dx) > hitW / 2 + ball.r) return false;
    if (dy > ball.r + 20 || dy < -ball.r - 30) return false;

    const power = p.thunderTimer > 0 ? 1.55 : 1;
    const aimX = p.team === "A" ? 1 : -1;
    ball.vx = aimX * (7 + Math.abs(p.vx) * 0.4) * power + dx * 0.08;
    ball.vy = -10 * power - Math.min(4, Math.abs(p.vy) * 0.3);
    if (p.thunderTimer > 0) {
      ball.vx *= 1.35;
      ball.vy *= 1.2;
      ball.spin = aimX * 0.3;
    }
    ball.x = p.x + Math.sign(dx || aimX) * (hitW / 2 + ball.r);
    ball.y = headY - ball.r;
    return true;
  }

  scorePoint(team) {
    const st = this.state;
    st.rallyActive = false;
    if (team === "A") st.scoreA++;
    else st.scoreB++;
    st.message = team === "A" ? "팀 A 득점!" : "팀 B 득점!";
    st.messageTimer = 1.2;
    st.serveTeam = team;

    if (st.scoreA >= WIN_SCORE || st.scoreB >= WIN_SCORE) {
      st.running = false;
      st.paused = true;
      return { gameOver: true, winner: st.scoreA >= WIN_SCORE ? "A" : "B" };
    }

    st.serveDelay = 0.9;
    return { gameOver: false };
  }

  updateBall(dt) {
    const ball = this.ball;
    const st = this.state;

    if (st.serveDelay > 0) {
      st.serveDelay -= dt;
      if (st.serveDelay <= 0 && st.running) {
        this.resetBall(st.serveTeam);
      }
      return null;
    }

    ball.vy += 0.38;
    ball.vx += ball.spin * 0.02;
    ball.spin *= 0.98;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - ball.r < 60) {
      ball.y = 60 + ball.r;
      ball.vy = Math.abs(ball.vy) * 0.65;
    }

    if (ball.x - ball.r < 8) {
      ball.x = 8 + ball.r;
      ball.vx = Math.abs(ball.vx) * 0.8;
    }
    if (ball.x + ball.r > W - 8) {
      ball.x = W - 8 - ball.r;
      ball.vx = -Math.abs(ball.vx) * 0.8;
    }

    const netLeft = NET_X - NET_W / 2;
    const netRight = NET_X + NET_W / 2;
    const netTop = GROUND - 155;

    if (ball.y + ball.r > netTop) {
      if (ball.x > netLeft - ball.r && ball.x < netRight + ball.r && ball.y < GROUND) {
        if (ball.x < NET_X) {
          ball.x = netLeft - ball.r;
          ball.vx = -Math.abs(ball.vx) * 0.75;
        } else {
          ball.x = netRight + ball.r;
          ball.vx = Math.abs(ball.vx) * 0.75;
        }
      }
    }

    if (ball.y + ball.r >= GROUND && st.rallyActive) {
      ball.y = GROUND - ball.r;
      const scoringTeam = ball.x < NET_X ? "B" : "A";
      return this.scorePoint(scoringTeam);
    }

    for (const p of this.players) {
      this.hitBallFromPlayer(p);
    }
    return null;
  }

  tick(dt) {
    const st = this.state;
    if (!st.running || st.paused) return null;

    for (const p of this.players) this.updatePlayer(p, dt);
    const scoreResult = this.updateBall(dt);
    if (st.messageTimer > 0) st.messageTimer -= dt;
    return scoreResult;
  }

  getSnapshot() {
    return {
      state: { ...this.state },
      ball: { ...this.ball },
      players: this.players.map((p) => ({
        id: p.id,
        team: p.team,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        w: p.w,
        h: p.h,
        onGround: p.onGround,
        thunderTimer: p.thunderTimer,
        facing: p.facing,
        color: p.color,
        cheek: p.cheek,
      })),
    };
  }
}
