import { W, H, GROUND, NET_X, NET_W } from "./game-core.mjs";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#87ceeb");
    sky.addColorStop(1, "#b8e6ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GROUND);

    ctx.fillStyle = "#5a9e38";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "#4a8e2f";
    for (let i = 0; i < W; i += 40) {
      ctx.fillRect(i, GROUND + 8, 20, 4);
    }

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND + 0.5);
    ctx.lineTo(W, GROUND + 0.5);
    ctx.stroke();

    const netTop = GROUND - 155;
    ctx.fillStyle = "#eee";
    ctx.fillRect(NET_X - NET_W / 2, netTop, NET_W, GROUND - netTop);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let y = netTop; y < GROUND; y += 12) {
      ctx.beginPath();
      ctx.moveTo(NET_X - 28, y);
      ctx.lineTo(NET_X + 28, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#8d6e63";
    ctx.fillRect(NET_X - 3, netTop - 8, 6, 8);
  }

  function drawPikachu(p, highlight) {
    const x = p.x;
    const y = p.y;
    const w = p.w;
    const h = p.h;
    const thunder = p.thunderTimer > 0;

    if (highlight) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - w / 2 - 4, y - h - 4, w + 8, h + 8);
    }

    ctx.save();
    ctx.translate(x, y);
    if (p.facing < 0) ctx.scale(-1, 1);

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.45, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, -h * 0.55);
    ctx.lineTo(-w * 0.15, -h * 0.95);
    ctx.lineTo(w * 0.05, -h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.35, -h * 0.55);
    ctx.lineTo(w * 0.15, -h * 0.95);
    ctx.lineTo(-w * 0.05, -h * 0.55);
    ctx.closePath();
    ctx.fill();

    if (thunder) {
      ctx.strokeStyle = "#ffeb3b";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#ffeb3b";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(8, -h - 25);
      ctx.lineTo(-4, -h - 25);
      ctx.lineTo(12, -h - 50);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(-10, -h * 0.5, 4, 0, Math.PI * 2);
    ctx.arc(10, -h * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.cheek;
    ctx.beginPath();
    ctx.ellipse(-16, -h * 0.38, 7, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(16, -h * 0.38, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5d4037";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -h * 0.32);
    ctx.quadraticCurveTo(0, -h * 0.26, 6, -h * 0.32);
    ctx.stroke();

    ctx.fillStyle = "#5d4037";
    ctx.fillRect(-8, -12, 6, 10);
    ctx.fillRect(2, -12, 6, 10);
    ctx.restore();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("P" + p.id, x, y - h - 6);
  }

  function drawBall(ball) {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.spin * 8);
    const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, ball.r);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.5, "#ffeb3b");
    g.addColorStop(1, "#f9a825");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f57f17";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-ball.r * 0.3, -ball.r + i * (ball.r * 0.5));
      ctx.lineTo(ball.r * 0.3, -ball.r + i * (ball.r * 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMessage(message, timer) {
    if (timer <= 0 || !message) return;
    ctx.fillStyle = "#0008";
    ctx.fillRect(W / 2 - 100, H / 2 - 30, 200, 50);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, W / 2, H / 2 + 8);
  }

  function render(snapshot, mySlot) {
    drawBackground();
    for (const p of snapshot.players) {
      drawPikachu(p, mySlot === p.id);
    }
    drawBall(snapshot.ball);
    drawMessage(snapshot.state.message, snapshot.state.messageTimer);
  }

  return { render };
}
