# 신규 직업 AI 일러스트

## 초상화 (역할 카드 / 플레이어 그리드)

| 파일 | 직업 |
|------|------|
| `cleric.png` | 성직자 |
| `terrorist.png` | 테러리스트 |
| `beast_man.png` | 짐승인간 |
| `cultist.png` | 광신도 |

배치 경로: `public/assets/roles/{id}.png`

## 스킬 컷신 (밤/낮 연출)

| 파일 | 스킬 |
|------|------|
| `cleric_revive.png` | 성직자 부활 |
| `terrorist_martyr.png` | 테러리스트 자폭 (처형) |
| `terrorist_oxidation.png` | 테러리스트 산화 (마피아 동반 사망) |
| `beastman_kill.png` | 짐승인간 갈망 킬 |
| `beastman_contact.png` | 짐승인간 접선 |
| `cultist_succession.png` | 광신도 → 교주 계승 |

배치 경로: `public/assets/motions/{name}.png`

## 동기화 (필수)

PNG 원본 위치: `assets/cleric.png` 등 (프로젝트 루트 `assets/`)

```bash
npm run install-new-roles
npm start
```

서버 콘솔에 `[ASSETS] terrorist portrait => ...png` 가 나와야 정상입니다.  
`MISSING (SVG fallback)` 이면 PNG가 없어 갈색 실루엣(SVG)만 보입니다.

캐시 갱신: `public/app.js` `ROLE_PORTRAIT_VERSION`, `public/motions.js` `MOTION_ASSET_VERSION` 이 올라가 있어야 합니다.
