import type { GameStore } from "@/store/gameStore";

const BOT_DELAY_MS = 520;

let botTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleBotTurn(get: () => GameStore): void {
  if (botTimer) clearTimeout(botTimer);
  botTimer = setTimeout(() => {
    botTimer = null;
    get().executeBotTurn();
  }, BOT_DELAY_MS);
}

export function cancelBotTurn(): void {
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
}
