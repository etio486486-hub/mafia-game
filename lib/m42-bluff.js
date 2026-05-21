/**
 * 마피아팀·교주팀(신도 포함) 시민 위장·지속 블러핑 (홀경/맞경/쓰리경 등).
 */

const m42Cult = require('./m42-cult');
const { agentLog } = require('./debug-agent-log');

const ROLE_CLAIM_DETECT = {
  police: /(?:저는|나는|제가|전)\s*경찰|(?:저|제가)\s*홀경|경찰입니다|홀경입니다|자경입니다|진경입니다|수사하겠|조사하겠|경찰이라/,
  doctor: /저는\s*의사|나는\s*의사|의사입니다|홀의|눈힐입니다/,
  soldier: /저는\s*군인|나는\s*군인|군인입니다|홀군|방탄\s*있/,
  reporter: /저는\s*기자|나는\s*기자|기자입니다|홀기|취재하겠/,
  medium: /저는\s*영매|영매입니다|홀영/,
  citizen: /저는\s*시민|무직|특수직\s*아님|일반\s*시민/
};

const policeFmt = require('./police-report-format');

/** '경찰 조사' 단독은 시민이 타인 조결을 인용할 때 오탐 → 제외. 실제 조결은 조사했는데·수사/조사 결과·경찰 조결 등으로 잡음 */
const POLICE_REPORT_CHAT = /수사\s*결과|조사\s*결과|경찰\s*조결|마피아\s*아닙|마피아입니다|마피아가\s*아닙|무죄입니다|조사했는데|제\s*조사/;

const ROLE_SHORT = {
  police: '경',
  doctor: '의',
  soldier: '군',
  reporter: '기',
  medium: '영',
  citizen: '시'
};

const BLUFF_OPEN_LINES = {
  police: [],
  citizen: [
    '저는 시민입니다. 특수직은 아닙니다.',
    '무직 시민입니다. 경찰·기자 팩트 따라가겠습니다.',
    '일반 시민입니다. 경찰·의사·기자 같은 특수직은 직공할 수 없습니다.',
    '저는 무직 시민입니다. 특수직 직공은 못 하고 조결·취재만 따르겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄은 한 번 있습니다.',
    '군인입니다. 맞군 나오면 조결로 짭군 가리겠습니다.'
  ],
  doctor: [
    '저는 의사입니다. 의사는 특수직이라 밤에 치료합니다.',
    '홀의입니다. 특수직인 의사 쪽이고 밤에 살리는 역할입니다.',
    '저는 의사입니다. 일반 시민이 아닌 특수직입니다.'
  ],
  reporter: [
    '저는 기자입니다. 2밤부터 취재 결과 공표하겠습니다.',
    '기자입니다. 팩트만 말하겠습니다.'
  ],
  medium: [
    '저는 영매입니다. 성불·사망자 채팅 확인합니다.',
    '영매입니다. 밤에 성불하겠습니다.'
  ]
};

const MAT_CHAT = /맞경|맞의|맞군|맞영|맞직|맞기|쓰리경|쓰리의|쓰리의|쓰리군|쓰리영|대립|짭경|짭의|짭군|짭영|진경|늦경|눈치경|홀경|맞경찰/;
const JIKGONG_CHAT = /직공|직업\s*뭐|직업이\s*뭐|각자\s*직업|직업\s*말|ㅈㄱ|풍지/;
const MATGYEONG_ASK = /맞경|맞경찰|맞의|맞군|맞영|맞기|쓰리경|쓰리의|쓰리군|홀경|홀의|홀군|홀영/;
const NON_POLICE_MAT_ROLE_CHAT = /맞의|맞군|맞기|맞영|맞직|쓰리의|쓰리군|쓰리기|쓰리영|짭의|짭군|짭기|짭영|진의|진군|진기|진영|홀의|홀군|홀기|홀영/;

/** 맞직(맞경·맞의·맞군·맞영 등) 우김 템플릿 */
const ROLE_MATGYEONG = {
  doctor: {
    short: '의',
    label: '의사',
    templates: [
      '{rival}님 맞의입니다. 저 {self}가 진의이고 {rival}님은 짭의로 보입니다.',
      '맞의면 한쪽은 맢입니다. {rival}님 힐·직공이 수상하고 저 {self}가 진의입니다.',
      '{rival}님, 맞의 나왔으면 밤 치료 기록부터 맞춰 봅시다. 저는 홀의 {self}입니다.',
      '쓰리의 아니고 맞의면 {rival}님부터 의심하세요. 저는 진짜 의사입니다.',
      '{rival}님 맞의 우기지 말고 치료 타이밍부터 설명하세요. 저 {self}가 진의입니다.'
    ],
    stir: [
      '맞의 나왔으면 조밤·힐 타이밍부터 맞춰 봅시다.',
      '홀의·맞의 구분이 먼저입니다. 저는 의사 쪽입니다.',
      '맞의면 한쪽은 짭의일 확률이 큽니다. 치료 팩트로 가죠.'
    ]
  },
  soldier: {
    short: '군',
    label: '군인',
    templates: [
      '{rival}님 맞군입니다. 저 {self}가 진군이고 방탄은 제 쪽입니다.',
      '맞군이면 {rival}님 방탄 우기가 수상합니다. 저 {self}가 홀군입니다.',
      '{rival}님, 맞군 나왔으면 조밤 방탄부터 맞춰 보세요. 저는 진군 {self}입니다.',
      '쓰리군 아니고 맞군이면 {rival}님 라인이 짭군으로 보입니다.',
      '{rival}님 맞군 우기지 말고 방탄 사용 여부부터 말하세요. 저 {self}입니다.'
    ],
    stir: [
      '맞군·홀군 구분이 먼저입니다. 방탄은 한 번뿐입니다.',
      '맞군이면 조밤에 막힌 쪽이 진군일 수 있습니다.',
      '맞군 싸움은 방탄·조밤 팩트로만 가죠.'
    ]
  },
  medium: {
    short: '영',
    label: '영매',
    templates: [
      '{rival}님 맞영입니다. 저 {self}가 진영이고 성불은 제 쪽입니다.',
      '맞영이면 {rival}님 성불·사망챗 우기가 수상합니다. 저 {self}가 홀영입니다.',
      '{rival}님, 맞영 나왔으면 성불 결과부터 맞춰 봅시다. 저는 진영 {self}입니다.',
      '쓰리영 아니고 맞영이면 {rival}님부터 의심하세요. 저는 진짜 영매입니다.',
      '{rival}님 맞영 우기지 말고 성불 대상부터 공개하세요. 저 {self}입니다.'
    ],
    stir: [
      '맞영·홀영 구분이 먼저입니다. 사망자 채팅도 같이 보죠.',
      '맞영이면 성불 팩트로 짭영 가립시다.',
      '맞영 나왔으면 영매 한 명은 짭영일 확률이 큽니다.'
    ]
  },
  reporter: {
    short: '기',
    label: '기자',
    templates: [
      '{rival}님 맞기입니다. 저 {self}가 진기이고 2밤부터 취재는 제 쪽입니다.',
      '맞기면 {rival}님 취재 공표가 수상합니다. 저 {self}가 홀기입니다.',
      '{rival}님, 맞기 나왔으면 취재 대상·공표부터 맞춰 봅시다. 저는 진기 {self}입니다.',
      '쓰리기 아니고 맞기면 {rival}님 라인이 짭기로 보입니다.',
      '{rival}님 맞기 우기지 말고 취재 결과부터 말하세요. 저 {self}입니다.'
    ],
    stir: [
      '맞기·홀기 구분이 먼저입니다. 2밤부터 취재 공표가 나옵니다.',
      '맞기면 기자 공표로 짭기 가립시다.',
      '맞기 나왔으면 취재·조결을 같이 대조하죠.'
    ]
  }
};

/** 맞경 상대(시민 경찰 주장자) 이름 넣어 진경·짭경 우김 */
const POLICE_VS_EVIL_TEMPLATES = [
  '저는 진경입니다. {rival}님이 먼저 나와 저를 짭경으로 몰고 있습니다.',
  '{rival}님 말이 앞뒤가 안 맞습니다. 맞경이면 조결로 까보죠. 진짜 경찰은 저 {self}입니다.',
  '{rival}님 늦게 나와 우기는 건 전형적인 짭경 빌드입니다. 저 {self}가 실제로 밤에 수사했습니다.',
  '맞경이면 한쪽은 맢입니다. {rival}님 조결이 제 수사랑 충돌합니다. 저는 진경입니다.',
  '{rival}님, 저랑 다른 조결 내는 이유부터 설명하세요. 진경은 저 {self}입니다.',
  '저 {self}가 경찰입니다. {rival}님은 왜 제가 본 팩트랑 다른 말을 하죠?',
  '{rival}님처럼 말만 하지 말고 전날 밤 누구 조사했는지부터 맞춰 봅시다. 진경은 저입니다.',
  '짭경은 조결부터 티 납니다. {rival}님 수상하고 저 {self}가 진짜입니다.',
  '{rival}님이 진경인 척하는데, 제 조사 기록이랑 안 맞습니다. 저는 진경입니다.',
  '맞경 싸움은 조결로 갑니다. {rival}님 말고 저 {self} 조결을 보세요. 저가 진경입니다.',
  '{rival}님, 맞경 나왔으면 조결부터 맞춰 봅시다. 진경은 저 {self}입니다.',
  '시민 여러분 {rival}님 말만 믿으면 짭경한테 당합니다. 저가 밤에 수사했습니다.',
  '{rival}님 조결 문장이 왜 제 결과랑 반대인지 설명부터 하세요.',
  '제가 먼저 조결 올렸는데 {rival}님이 뒤늦게 진경 우기는 건 전형적인 짭경입니다.',
  '{rival}님 맞경 우기지 말고 밤에 찍은 사람부터 말하세요. 진경은 저입니다.',
  '맞경이면 한쪽은 맢인데 {rival}님 라인이 더 수상합니다. 저 {self} 조결 보세요.',
  '{rival}님, 짭경은 말이 빠릅니다. 저는 팩트로 말하는 진경입니다.',
  '쓰리경 아니고 맞경이면 {rival}님부터 의심하세요. 저는 진짜 경찰 {self}입니다.',
  '{rival}님 진경인 척하지 마시고 조사 대상부터 공개하세요.',
  '맞경 싸움 감정 빼고 조결만 봅시다. {rival}님 조결이 이상합니다. 저는 진경입니다.'
];

const POLICE_VS_REAL_TEMPLATES = [
  '진경은 저 {self}입니다. {rival}님 말만 믿을 순 없어요. 제가 밤에 찍은 조사가 있습니다.',
  '{rival}님 늦게 나와 우기는 건 짭경이랑 같습니다. 저 {self}가 진짜 경찰입니다.',
  '맞경이면 조결부터인데, {rival}님 조결이 제 수사랑 안 맞습니다. 저는 진경입니다.',
  '{rival}님, 저랑 다른 조결 내는 이유 설명이 필요합니다. 진경은 저 {self}입니다.',
  '저 {self}가 경찰입니다. {rival}님은 왜 제가 본 결과랑 다른 말을 하죠?',
  '{rival}님 말이 앞뒤가 안 맞습니다. 밤에 수사한 쪽은 저 {self}입니다.',
  '짭경은 말로만 우깁니다. {rival}님 조결 검증합시다. 진경은 저입니다.',
  '{rival}님이 진경인 척하는데 제 기록이랑 충돌합니다. 저 {self}가 진경입니다.',
  '맞경이면 한쪽은 맢입니다. {rival}님 수상하고 저 {self} 조결을 보세요.',
  '{rival}님 전날 밤 누구 조사했는지부터 물어보죠. 진짜 경찰은 저 {self}입니다.',
  '{rival}님, 맞경이면 조결부터 맞춰 봅시다. 저 {self}가 먼저 수사했습니다.',
  '제 조결이 맞습니다. {rival}님이 뒤늦게 진경 우기는 건 짭경 패턴입니다.',
  '{rival}님 말만 하지 말고 밤에 조사한 대상부터 공개하세요.',
  '시민분들 {rival}님 조결과 제 조결 중 하나는 거짓입니다. 저는 진경 {self}입니다.',
  '맞경 우기기 그만하고 {rival}님 조결 문장부터 검증합시다.',
  '{rival}님, 제가 본 팩트랑 왜 다른 말을 하시는지 답변 부탁드립니다.',
  '짭경은 감정 싸움부터 합니다. 저 {self}는 조결로 말합니다.',
  '{rival}님 진경인 척하지 마세요. 제 기록이 더 앞서 있습니다.',
  '맞경이면 {rival}님부터 의심하세요. 저는 밤 수사 기록이 있습니다.',
  '{rival}님, 맞경 나왔으면 저 {self} 조결부터 보시고 판단하세요.'
];

/** 맞경 직후 2~4턴 티키타카용 짧은 반박 */
const MATGYEONG_TIKI_TAKA_EVIL = [
  '{rival}님, 조결 숫자부터 다시 말하세요. 저는 진경입니다.',
  '제가 먼저 밤 수사했는데 {rival}님이 뒤늦게 진경 우기는 건 짭경 패턴입니다.',
  '{rival}님 맞경 나왔으면 저 {self} 조결부터 보세요.',
  '시민분들 {rival}님 말만 들으면 짭경한테 당합니다. 진경은 저입니다.',
  '{rival}님 왜 제 조사랑 반대 조결을 내셨죠? 답변부터 하세요.',
  '맞경은 조결로만 갑니다. {rival}님 설명 없이 진경 우기면 수상합니다.',
  '{rival}님, 짭경은 말이 빠릅니다. 저는 팩트로 말합니다.',
  '저 {self}가 먼저 조결 올렸습니다. {rival}님이 짭경인 이유가 여기 있습니다.',
  '{rival}님 밤에 누구 찍었는지부터 말하세요. 저는 진경입니다.',
  '맞경 싸움 감정 빼고 조결만 봅시다. {rival}님 조결이 이상합니다.',
  '{rival}님, 맞경 우기지 마시고 조사 대상 공개하세요.',
  '제 조사 기록이 맞습니다. {rival}님 조결부터 검증합시다.',
  '{rival}님 진경인 척 그만하시고 조결 타임라인 맞춰 보죠.',
  '맞경이면 한쪽은 맢인데 {rival}님 라인이 더 수상합니다.',
  '{rival}님, 저랑 다른 조결 내는 이유가 뭔가요? 진경은 저 {self}입니다.',
  '짭경은 늦게 나와 우깁니다. {rival}님 패턴이 딱 그렇습니다.',
  '{rival}님 말만 하지 말고 전날 밤 수사 대상부터 말하세요.',
  '저 {self} 조결 믿으시면 됩니다. {rival}님은 짭경 쪽입니다.',
  '맞경 정리는 조결로 합니다. {rival}님 설명 부탁드립니다.',
  '{rival}님, 쓰리경 아니면 {rival}님부터 의심하세요. 저는 진경입니다.'
];

const MATGYEONG_TIKI_TAKA_REAL = [
  '{rival}님, 말만 하지 마시고 밤에 누구 조사했는지 말하세요.',
  '저 {self}가 먼저 조결 올렸습니다. {rival}님이 짭경인 이유가 여기 있습니다.',
  '{rival}님 조결이 제 기록이랑 충돌합니다. 진경은 저 {self}입니다.',
  '맞경이면 한쪽은 맢입니다. {rival}님 쪽 조결부터 검증합시다.',
  '제가 밤에 수사한 내용이 맞습니다. {rival}님 설명 부탁드립니다.',
  '{rival}님, 맞경 우기지 말고 조사 대상부터 공개하세요.',
  '짭경은 감정 싸움부터 합니다. 저 {self}는 조결로 말합니다.',
  '{rival}님 진경인 척하지 마세요. 제 기록이 더 앞서 있습니다.',
  '맞경이면 {rival}님부터 의심하세요. 저는 밤 수사 기록이 있습니다.',
  '{rival}님, 조결 문장이 왜 제 결과랑 반대인지 답변해 주세요.',
  '저 {self}가 진경입니다. {rival}님 말만 믿지 마세요.',
  '{rival}님 늦게 나온 쪽이 짭경인 경우가 많습니다.',
  '맞경 정리는 조결 타임라인으로만 갑시다. {rival}님 수상합니다.',
  '{rival}님, 제 조결과 {rival}님 조결 중 하나는 거짓입니다.',
  '진경은 저입니다. {rival}님 밤 수사 대상부터 맞춰 봅시다.',
  '{rival}님 맞경 선동 그만하고 팩트부터 보죠.',
  '제가 수사한 결과가 맞습니다. {rival}님 설명 없으면 짭경입니다.',
  '{rival}님, 맞경이면 조결부터인데 왜 다른 말을 하시죠?',
  '저 {self} 조결 먼저 보세요. {rival}님은 짭경 쪽으로 보입니다.',
  '{rival}님, 맞경 나왔으면 저 {self} 라인부터 검증합시다.'
];

const MATGYEONG_BICKER_NO_RIVAL = [
  '맞경이면 한쪽은 맢일 확률이 큽니다. 저는 진짜 수사 쪽입니다.',
  '맞경은 조결로만 갑니다. 저는 진경이고 짭경부터 잡읍시다.',
  '저 진경입니다. 늦게 나온 쪽이 짭경인 경우가 많습니다.',
  '맞경 우기기하지 말고 조결부터 맞춰 봅시다. 진경은 저입니다.',
  '짭경은 말이 빠르고 진경은 팩트가 남습니다. 저는 후자입니다.'
];

function pickPoliceVersusBicker(selfName, rivalName, isEvil) {
  const self = selfName || '저';
  const rival = rivalName || '상대';
  const pool = isEvil ? POLICE_VS_EVIL_TEMPLATES : POLICE_VS_REAL_TEMPLATES;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replace(/\{self\}/g, self).replace(/\{rival\}/g, rival);
}

function pickMatgyeongVotePushLine(targetName) {
  const t = targetName || '해당 대상';
  const lines = [
    `${t}님 마피아 조결입니다. 시민은 오늘 ${t}님으로 표를 모아 주십시오.`,
    `제 조결 기준 ${t}님은 마피아입니다. 투표는 ${t}님으로 고정합시다.`,
    `${t}님이 맢으로 나왔습니다. 맞경이면 말보다 투표로 ${t}님부터 정리합시다.`,
    `${t}님 마피아 결과가 나왔습니다. 시민팀은 ${t}님 처형표로 확인해 주십시오.`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function pickMatgyeongNoRivalBicker() {
  return MATGYEONG_BICKER_NO_RIVAL[Math.floor(Math.random() * MATGYEONG_BICKER_NO_RIVAL.length)];
}

/** 맞경 쌍 직후 2~4턴 티키타카 한 줄 */
function pickMatgyeongTikiTakaLine(room, bot, rival, opts = {}) {
  if (!bot || !rival) return null;
  const isEvil = opts.isEvil !== false;
  const pool = isEvil ? MATGYEONG_TIKI_TAKA_EVIL : MATGYEONG_TIKI_TAKA_REAL;
  if (!pool.length) return pickPoliceVersusBicker(bot.nickname, rival.nickname, isEvil);
  const round = opts.round != null ? opts.round : 0;
  const idx = (round + Math.floor(Math.random() * pool.length)) % pool.length;
  const self = bot.nickname || '저';
  const rivalName = rival.nickname || '상대';
  return pool[idx].replace(/\{self\}/g, self).replace(/\{rival\}/g, rivalName);
}

/** 낮 토론 중 수시로 쓰는 혼란·선동 멘트 */
const EVIL_CONFUSION_STIR_LINES = [
  '맞경 나왔으면 조결부터 맞춰 봅시다. 저는 시민입니다.',
  '홀경·맞경·짭경 구분이 먼저입니다. 급하게 몰표하지 마십시오.',
  '경찰 두 명이면 짭경 가리는 게 급합니다. 저도 조결 기다리겠습니다.',
  '맞직이면 취재·조결 팩트로 가야 합니다. 감정 싸움은 마피아 이득입니다.',
  '저는 시민 편입니다. 오늘은 맞경 정리부터 하겠습니다.',
  '조결 나온 사람끼리 맞춰 보고, 안 나온 직공은 수상합니다.',
  '쓰리경이면 한 명은 짭경일 확률이 큽니다. 조결 비교합시다.',
  '무근거 지목보다 경찰·기자 결과가 낫습니다. 저는 무직 시민입니다.',
  '맞의·맞군·맞기 나오면 조결로 짭직 가립시다.',
  '투표 전에 맞경·확직부터 정리하는 게 안전합니다.',
  '저는 일반 시민입니다. 특수직은 직공할 수 없습니다.',
  '무직 시민입니다. 경찰·의사·기자 같은 특수직 직공은 못 합니다.',
  '일반 시민 외에는 특수직이라 공개 못 합니다. 저는 무직 시민입니다.',
  '진짜 특수직만 직공하는 편이 낫습니다. 저는 일반 시민입니다.',
  '맞경 나왔는데 둘 다 진경이라 우기면 시민은 조결만 봐야 합니다.',
  '경찰 두 분 다 "내가 진경"이면 조사 대상·밤 순서부터 맞춰 보세요.',
  '맞경은 한쪽이 짭경인 경우가 많습니다. 조결 문장이 다른 쪽부터 의심합니다.',
  '둘 다 경찰이라면 조결이 왜 엇갈렸는지 설명이 필요합니다. 저는 시민입니다.',
  '맞경 싸움은 감정 빼고 조결 타임라인으로만 가죠.'
];

/**
 * 실제 배역이 시민팀 특직일 때는 밤·조결 등으로 대외 정체가 고정된다.
 * 교주 포교(joinedCult)만으로는 직업이 바뀌지 않으므로, 이런 봇은 fakeClaim·연기 톤 교정 대상에서 제외한다.
 * (그렇지 않으면 진경찰+신도 조합에서 fake=reporter가 잡혀 "저는 기자입니다"로 덮어씌워진다.)
 */
const REAL_CITIZEN_SPECIAL_ROLES = new Set([
  'police', 'doctor', 'reporter', 'soldier', 'medium', 'politician', 'private_detective'
]);

function retainsRealRolePublicIdentity(bot) {
  return !!(bot && bot.role && REAL_CITIZEN_SPECIAL_ROLES.has(bot.role));
}

/** 마피아팀·교주·(일반) 신도 — 낮 공개 채팅에서 시민 연기·블러핑 대상 */
function isEvilBluffBot(bot, helpers) {
  if (!bot || !bot.alive) return false;
  if (helpers.isMafiaTeam && helpers.isMafiaTeam(bot.role)) return true;
  if (bot.role === m42Cult.ROLE_CULT_LEADER) return true;
  if (bot.joinedCult && !retainsRealRolePublicIdentity(bot)) return true;
  return false;
}

function isCultSideBluff(bot) {
  return bot.role === m42Cult.ROLE_CULT_LEADER || !!bot.joinedCult;
}

/** 직공 롤콜: 마피아·스파이·교주·신도 — 시민팀 위장 풀 (중복 직공 허용) */
const CITIZEN_BLUFF_ROLL_POOL = [
  'citizen', 'citizen', 'citizen', 'soldier', 'reporter', 'medium',
  'politician', 'politician', 'doctor', 'police'
];

const CITIZEN_BLUFF_ROLL_LINES = {
  citizen: [
    '저는 일반 시민입니다. 특수직 아닙니다.',
    '무직 시민입니다. 오늘 조결 맞춰 가겠습니다.',
    '홀시입니다. 정보 나오면 따라가겠습니다.',
    '일반 시민입니다. 특수직은 직공할 수 없어 무직으로만 말하겠습니다.',
    '저는 무직 시민입니다. 경찰·의사·기자 같은 특수직 직공은 못 합니다.',
    '저는 무직 시민입니다. 같은 편이 조결·홀경 라인 잡는 게 낫습니다. 저는 직공하지 않겠습니다.',
    '특수직은 낮에 밝히면 표적입니다. 저는 무직으로만 가겠습니다. 경찰 조결은 다른 분이 맡는 편이 자연스럽습니다.',
    '저는 일반 시민입니다. 옆에서 경찰 블러핑 하시는 분 계시면 저는 특직 공개는 안 하고 조결만 따르겠습니다.'
  ],
  soldier: [
    '저는 군인입니다. 방탄 한 번 있습니다.',
    '홀군입니다. 시민 보호 쪽입니다.'
  ],
  reporter: [
    '저는 기자입니다. 2밤부터 취재합니다.',
    '홀기입니다. 팩트만 말하겠습니다.',
    '저는 기자입니다. 아직 2밤 전이라 취재 전입니다.'
  ],
  medium: [
    '저는 영매입니다. 성불·사망자 채팅 확인합니다.',
    '홀영입니다. 사망자 성불·채팅은 제 역할입니다.'
  ],
  politician: [
    '저는 정치인입니다. 투표로 확인해 주십시오.',
    '정치인입니다. 낮 2표·찬반 면역은 투표로 검증해 주십시오.'
  ],
  doctor: [
    '저는 의사입니다. 의사는 특수직이라 밤에 치료합니다.',
    '홀의입니다. 특수직인 의사 쪽이고 밤에 살리는 역할입니다.',
    '저는 의사입니다. 일반 시민이 아닌 특수직입니다.'
  ],
  police: [
    '저는 경찰입니다. 조사한 사람만 조결로 말씀드리겠습니다.',
    '홀경입니다. 밤에 수사합니다.'
  ]
};

function getDayMessages(room) {
  return (room.chatLog && room.chatLog.day) ? room.chatLog.day.slice(-40) : [];
}

function isRoleRollCallOpen(room) {
  return !!(room?.game?.roleRollCallOpen);
}

function allowBeforeRoleRollCall(text, room) {
  if (!text) return true;
  if (isRoleRollCallOpen(room)) return true;
  return !NON_POLICE_MAT_ROLE_CHAT.test(String(text).replace(/\s+/g, ''));
}

function pickConfusionStirLine(room) {
  const lines = EVIL_CONFUSION_STIR_LINES.filter((line) => allowBeforeRoleRollCall(line, room));
  const pool = lines.length ? lines : EVIL_CONFUSION_STIR_LINES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getAlivePoliceId(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const p = alive.find((pl) => pl.role === 'police');
  return p ? p.id : null;
}

/** 생존 마피아팀(마피아·스파이) AI 봇만 — 경찰 조결 블러핑 분담용 */
function getAliveMafiaTeamBotPlayers(room, helpers) {
  if (!helpers.getAlivePlayers || !helpers.isMafiaTeam) return [];
  return helpers.getAlivePlayers(room).filter(
    (p) => p && p.isBot && p.alive && helpers.isMafiaTeam(p.role)
  );
}

/**
 * 마피아팀 봇이 둘 이상이면 id 정렬상 첫 봇만 경찰(가짜 조결) 블러핑을 맡음.
 * 나머지는 시민·특직 비공개 쪽으로 가서 둘 다 홀경인 척하지 않게 함.
 */
function mayMafiaTeamBotBluffPolice(room, bot, helpers) {
  if (helpers.getAlivePlayers) {
    const aliveHumanPolice = helpers.getAlivePlayers(room).find(
      (p) => p && p.alive && p.role === 'police' && !p.isBot
    );
    if (aliveHumanPolice) return false;
  }
  if (!bot || !helpers.isMafiaTeam || !helpers.isMafiaTeam(bot.role)) return true;
  const mafiaBots = getAliveMafiaTeamBotPlayers(room, helpers);
  if (mafiaBots.length <= 1) return true;
  const sorted = mafiaBots.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sorted.length > 0 && sorted[0].id === bot.id;
}

function pickAliveNames(room, bot, helpers, count = 2) {
  const alive = helpers.getAlivePlayers
    ? helpers.getAlivePlayers(room).filter((p) => p.id !== bot.id && p.alive)
    : [];
  return [...alive].sort(() => Math.random() - 0.5).slice(0, count).map((p) => p.nickname);
}

/** 직공 + 조결 공개한 사람 = 경찰 후보(홀경) */
function scanPoliceReporters(room, helpers) {
  const claims = scanRoleClaims(room, helpers);
  const reporters = [...(claims.police || [])];
  const seen = new Set(reporters.map((r) => r.id));

  for (const msg of getDayMessages(room)) {
    if (!msg || !msg.fromId || !msg.text || msg.system) continue;
    if (!POLICE_REPORT_CHAT.test(msg.text) && !ROLE_CLAIM_DETECT.police.test(msg.text.replace(/\s+/g, ''))) {
      continue;
    }
    if (seen.has(msg.fromId)) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (!p || !p.alive) continue;
    seen.add(msg.fromId);
    reporters.push({
      id: msg.fromId,
      nickname: msg.from || p.nickname
    });
  }

  const realId = getAlivePoliceId(room, helpers);
  if (realId && !seen.has(realId)) {
    const p = helpers.getPlayerById(room, realId);
    if (p && p.alive) {
      reporters.push({ id: realId, nickname: p.nickname });
    }
  }

  return reporters;
}

function scanRoleClaims(room, helpers) {
  const out = {
    police: [], doctor: [], soldier: [], reporter: [], medium: [], citizen: []
  };
  const seen = {};
  for (const role of Object.keys(out)) {
    seen[role] = new Set();
  }

  for (const msg of getDayMessages(room)) {
    if (!msg || msg.system || !msg.text || !msg.fromId) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, msg.fromId) : null;
    if (p && !p.alive) continue;
    const compact = String(msg.text).replace(/\s+/g, '');

    for (const [role, re] of Object.entries(ROLE_CLAIM_DETECT)) {
      if (!re.test(compact) && !re.test(msg.text)) continue;
      if (seen[role].has(msg.fromId)) continue;
      seen[role].add(msg.fromId);
      out[role].push({
        id: msg.fromId,
        nickname: msg.from || (p && p.nickname) || '?'
      });
    }
  }
  return out;
}

function countClaims(claims, role, excludeId) {
  const list = claims[role] || [];
  if (!excludeId) return list.length;
  return list.filter((c) => c.id !== excludeId).length;
}

function getBotFakeClaim(room, botId, helpers) {
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, botId) : null;
  if (retainsRealRolePublicIdentity(p)) return null;
  const mind = helpers.getBotMind ? helpers.getBotMind(room, botId) : null;
  return mind && mind.fakeClaim ? mind.fakeClaim : null;
}

function setBotFakeClaim(room, botId, role, helpers, opts = {}) {
  const mind = helpers.getBotMind ? helpers.getBotMind(room, botId) : null;
  if (!mind) return;
  if (role == null) {
    if (opts.force) mind.fakeClaim = null;
    return;
  }
  const p = helpers.getPlayerById ? helpers.getPlayerById(room, botId) : null;
  if (p && retainsRealRolePublicIdentity(p)) return;
  if (!opts.force && mind.fakeClaim != null && mind.fakeClaim !== role) return;
  mind.fakeClaim = role;
}

function burnMafiaPoliceBluffLine(room, helpers, reason) {
  if (!room.game) return;
  if (room.game.mafiaPoliceBluffBurnt) return;
  room.game.mafiaPoliceBluffBurnt = true;
  reassignAliveMafiaAwayFromPolice(room, helpers);
  // #region agent log
  agentLog({
    hypothesisId: 'Mf2',
    location: 'm42-bluff.js:burnMafiaPoliceBluffLine',
    message: 'mafia police bluff line burnt — no second 맞경',
    runId: 'mafia-bluff',
    data: { reason, roomCode: room.code }
  });
  // #endregion
}

/** 맞경으로 걸린 마피아가 죽으면 남은 마피아는 군인·영매 등 다른 특직으로 분산 */
function reassignAliveMafiaAwayFromPolice(room, helpers) {
  const used = new Set();
  const pool = ['soldier', 'medium', 'doctor', 'reporter', 'citizen'];
  for (const bot of getAliveMafiaTeamBotPlayers(room, helpers)) {
    const cur = getBotFakeClaim(room, bot.id, helpers);
    if (cur && cur !== 'police') used.add(cur);
  }
  for (const bot of getAliveMafiaTeamBotPlayers(room, helpers)) {
    const cur = getBotFakeClaim(room, bot.id, helpers);
    if (cur !== 'police') continue;
    const avail = pool.filter((r) => !used.has(r));
    const role = (avail.length ? avail : pool)[Math.floor(Math.random() * (avail.length ? avail.length : pool.length))];
    setBotFakeClaim(room, bot.id, role, helpers, { force: true });
    used.add(role);
  }
}

/** 진경 사망 후 마피아팀 지정 봇이 경찰 위장을 이어받음 (맞경 실패 후에는 금지) */
function promoteMafiaPoliceBluffer(room, helpers) {
  if (room.game?.mafiaPoliceBluffBurnt) return null;
  if (getAlivePoliceId(room, helpers)) return null;
  const mafiaBots = getAliveMafiaTeamBotPlayers(room, helpers)
    .filter((b) => mayMafiaTeamBotBluffPolice(room, b, helpers));
  if (!mafiaBots.length) return null;
  const sorted = mafiaBots.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const bluffer = sorted.find((b) => {
    const cur = getBotFakeClaim(room, b.id, helpers);
    return !cur || cur === 'police';
  }) || sorted[0];
  setBotFakeClaim(room, bluffer.id, 'police', helpers, { force: true });
  return bluffer;
}

function getAliveEvilBluffBots(room, helpers) {
  if (!helpers.getAlivePlayers) return [];
  return helpers.getAlivePlayers(room).filter(
    (p) => p && p.isBot && p.alive && isEvilBluffBot(p, helpers)
  );
}

/** 게임 시작·낮마다 악역 봇 위장 직업 1회 고정 (변경 불가) */
function ensureAllEvilFakeClaims(room, helpers) {
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  for (const p of alive) {
    if (!p?.isBot) continue;
    if (retainsRealRolePublicIdentity(p)) {
      const mind = helpers.getBotMind ? helpers.getBotMind(room, p.id) : null;
      if (mind && mind.fakeClaim != null) mind.fakeClaim = null;
    }
  }

  const evilBots = getAliveEvilBluffBots(room, helpers);
  if (!evilBots.length) return;

  const usedRoles = new Set();
  const mafiaSorted = evilBots
    .filter((b) => helpers.isMafiaTeam && helpers.isMafiaTeam(b.role))
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const bot of evilBots) {
    const cur = getBotFakeClaim(room, bot.id, helpers);
    if (cur && !['mafia', 'spy', 'cult_leader'].includes(cur)) {
      usedRoles.add(cur);
    }
  }

  const pickUnused = (pool) => {
    const avail = pool.filter((r) => !usedRoles.has(r));
    const pick = (avail.length ? avail : pool)[Math.floor(Math.random() * (avail.length ? avail.length : pool.length))];
    usedRoles.add(pick);
    return pick;
  };

  const realPolice = getAlivePoliceId(room, helpers);
  const policeBluffer = !room.game?.mafiaPoliceBluffBurnt
    ? mafiaSorted.find((b) => mayMafiaTeamBotBluffPolice(room, b, helpers))
    : null;

  if (policeBluffer && !realPolice && !room.game?.mafiaPoliceBluffBurnt) {
    const cur = getBotFakeClaim(room, policeBluffer.id, helpers);
    if (!cur || cur === 'police') {
      setBotFakeClaim(room, policeBluffer.id, 'police', helpers, { force: !cur });
      usedRoles.add('police');
    }
  }

  for (const bot of evilBots) {
    const existing = getBotFakeClaim(room, bot.id, helpers);
    if (existing && !['mafia', 'spy', 'cult_leader'].includes(existing)) continue;

    if (bot.id === policeBluffer?.id && getBotFakeClaim(room, bot.id, helpers) === 'police') continue;
    if (mayMafiaTeamBotBluffPolice(room, bot, helpers) && !realPolice) continue;

    const pool = CITIZEN_BLUFF_ROLL_POOL.filter((r) => r !== 'police');
    const role = pickUnused(pool.length ? pool : ['citizen']);
    setBotFakeClaim(room, bot.id, role, helpers);
  }

  // #region agent log
  const snapshot = evilBots.map((b) => ({
    nick: b.nickname,
    role: b.role,
    fake: getBotFakeClaim(room, b.id, helpers)
  }));
  agentLog({
    hypothesisId: 'Mf1',
    location: 'm42-bluff.js:ensureAllEvilFakeClaims',
    message: 'evil fake claims locked',
    runId: 'mafia-bluff',
    data: { bots: snapshot, realPolice: !!realPolice }
  });
  // #endregion
}

function pickRivalRoleClaimant(room, helpers, role, bot) {
  const claims = scanRoleClaims(room, helpers);
  const list = (claims[role] || []).filter((c) => c.id !== bot.id);
  if (!list.length) return null;
  for (const c of list) {
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, c.id) : null;
    if (!p || !p.alive) continue;
    if (helpers.isMafiaTeam && helpers.isMafiaTeam(p.role)) continue;
    if (m42Cult.isCultMember(p)) continue;
    return c;
  }
  return list[0];
}

function buildRoleMatgyeongClaim(room, bot, helpers, roleKey) {
  const cfg = ROLE_MATGYEONG[roleKey];
  if (!cfg) return null;
  const fc = getBotFakeClaim(room, bot.id, helpers);
  if (fc !== roleKey) return null;
  if (!isRoleRollCallOpen(room)) return null;

  const rival = pickRivalRoleClaimant(room, helpers, roleKey, bot);
  const self = bot.nickname || '저';
  if (rival) {
    const line = cfg.templates[Math.floor(Math.random() * cfg.templates.length)];
    return line.replace(/\{self\}/g, self).replace(/\{rival\}/g, rival.nickname);
  }
  if (cfg.stir && cfg.stir.length) {
    const stirPool = cfg.stir.filter((line) => allowBeforeRoleRollCall(line, room));
    if (!stirPool.length) return null;
    return stirPool[Math.floor(Math.random() * stirPool.length)];
  }
  return `맞${cfg.short}입니다. 저는 진${cfg.short} ${self}입니다.`;
}

function getMafiaPoliceBlufferBot(room, helpers) {
  const mafiaBots = getAliveMafiaTeamBotPlayers(room, helpers);
  if (!mafiaBots.length) return null;
  const sorted = mafiaBots.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const b of sorted) {
    if (!mayMafiaTeamBotBluffPolice(room, b, helpers)) continue;
    const cur = getBotFakeClaim(room, b.id, helpers);
    if (cur && cur !== 'police' && !['mafia', 'spy', 'cult_leader'].includes(cur)) continue;
    return b;
  }
  return null;
}

/** 진경 생존 시 마피아팀 지정 봇은 경찰 위장(fakeClaim)을 미리 고정 */
function ensureMafiaPoliceBlufferClaim(room, helpers) {
  if (room.game?.mafiaPoliceBluffBurnt) return null;
  const realId = getAlivePoliceId(room, helpers);
  if (!realId) return promoteMafiaPoliceBluffer(room, helpers);
  let bluffer = getMafiaPoliceBlufferBot(room, helpers);
  if (!bluffer) {
    const mafiaBots = getAliveMafiaTeamBotPlayers(room, helpers)
      .filter((b) => mayMafiaTeamBotBluffPolice(room, b, helpers));
    bluffer = mafiaBots.length ? mafiaBots[0] : null;
  }
  if (!bluffer) return null;
  const cur = getBotFakeClaim(room, bluffer.id, helpers);
  if (cur !== 'police') {
    setBotFakeClaim(room, bluffer.id, 'police', helpers, { force: true });
  }
  return bluffer;
}

/** 고정된 위장 직업에 맞는 한 줄 (경찰→가짜 조결, 시민→시민 풀만) */
function pickLineConsistentWithFakeClaim(room, bot, helpers, ctx = {}) {
  const fc = getBotFakeClaim(room, bot.id, helpers);
  if (!fc || ['mafia', 'spy', 'cult_leader'].includes(fc)) return null;

  if (fc === 'police') {
    const trig = ctx.triggerText || '';
    if (wantsMatgyeongAsk(trig)) {
      return buildMatgyeongCounterClaim(room, bot, helpers);
    }
    const reporters = scanPoliceReporters(room, helpers);
    if (reporters.length >= 1) {
      return buildMatgyeongCounterClaim(room, bot, helpers)
        || buildFakePoliceReportLine(room, bot, helpers, { forceInnocent: true });
    }
    return buildFakePoliceReportLine(room, bot, helpers)
      || buildBluffOpenLine('police', bot, room);
  }

  if (ROLE_MATGYEONG[fc]) {
    const mat = buildRoleMatgyeongClaim(room, bot, helpers, fc);
    if (mat) return mat;
    const claims = scanRoleClaims(room, helpers)[fc] || [];
    if (claims.some((c) => c.id !== bot.id) || MAT_CHAT.test(String(ctx.triggerText || '').replace(/\s+/g, ''))) {
      return buildRoleMatgyeongClaim(room, bot, helpers, fc);
    }
  }

  const pool = CITIZEN_BLUFF_ROLL_LINES[fc] || CITIZEN_BLUFF_ROLL_LINES.citizen;
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 채팅이 위장 직업과 모순되면 같은 fakeClaim 톤으로 교체 */
function enforceBluffRoleConsistency(text, room, bot, helpers) {
  if (!text || !isEvilBluffBot(bot, helpers)) return text;
  const fc = getBotFakeClaim(room, bot.id, helpers);
  if (!fc || ['mafia', 'spy', 'cult_leader'].includes(fc)) return text;
  const compact = String(text).replace(/\s+/g, '');

  const replaceWithFc = () => {
    const line = pickLineConsistentWithFakeClaim(room, bot, helpers, {});
    if (line) return line;
    const pool = CITIZEN_BLUFF_ROLL_LINES[fc] || CITIZEN_BLUFF_ROLL_LINES.citizen;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  if (fc === 'police') {
    if (/저는\s*시민|나는\s*시민|무직\s*시민|일반\s*시민/.test(compact)
      && !/맞경|홀경|짭경|경찰/.test(compact)) {
      return buildFakePoliceReportLine(room, bot, helpers, { forceInnocent: true })
        || pickMatgyeongCitizenConfusion(room, bot, helpers)
        || text;
    }
    if (/저는\s*의사|군인입니다|기자입니다|영매입니다/.test(compact)) {
      return replaceWithFc();
    }
    return text;
  }

  if (/저는\s*경찰|나는\s*경찰|경찰입니다|홀경입니다/.test(compact)) {
    return replaceWithFc();
  }

  const wrongRole = {
    doctor: /저는\s*군인|군인입니다|기자입니다|영매입니다|경찰입니다/,
    soldier: /저는\s*의사|의사입니다|기자입니다|영매입니다|경찰입니다/,
    medium: /저는\s*의사|군인입니다|기자입니다|경찰입니다/,
    reporter: /저는\s*의사|군인입니다|영매입니다|경찰입니다/,
    citizen: /저는\s*경찰|의사입니다|군인입니다|기자입니다|영매입니다|홀경|홀의|홀군|홀영|홀기/
  };
  if (wrongRole[fc] && wrongRole[fc].test(compact)) {
    return replaceWithFc();
  }

  return text;
}

function pickMafiaBluffRole(room, bot, helpers) {
  const existing = getBotFakeClaim(room, bot.id, helpers);
  if (existing && !['mafia', 'spy', 'cult_leader'].includes(existing)) return existing;

  if (bot.role === 'cult_leader') {
    const pick = CITIZEN_BLUFF_ROLL_POOL[Math.floor(Math.random() * CITIZEN_BLUFF_ROLL_POOL.length)];
    setBotFakeClaim(room, bot.id, pick, helpers);
    return pick;
  }

  const reporters = scanPoliceReporters(room, helpers);
  const realPoliceId = getAlivePoliceId(room, helpers);
  const allowPoliceBluff = mayMafiaTeamBotBluffPolice(room, bot, helpers);
  const noPolicePool = CITIZEN_BLUFF_ROLL_POOL.filter((r) => r !== 'police');

  if (reporters.length === 0) {
    if (allowPoliceBluff && !realPoliceId) {
      setBotFakeClaim(room, bot.id, 'police', helpers);
      return 'police';
    }
    let pick = noPolicePool[Math.floor(Math.random() * noPolicePool.length)];
    if (pick === 'police' && bot.id === realPoliceId) pick = 'citizen';
    setBotFakeClaim(room, bot.id, pick, helpers);
    return pick;
  }

  let pool = reporters.length >= 1
    ? ['police', 'police', 'police', 'citizen']
    : ['police', 'police', 'citizen', 'soldier'];
  if (!allowPoliceBluff) {
    pool = pool.filter((r) => r !== 'police');
    if (!pool.length) pool = ['citizen', 'citizen', 'soldier', 'reporter'];
  }
  if (allowPoliceBluff && realPoliceId && reporters.length >= 1) {
    setBotFakeClaim(room, bot.id, 'police', helpers);
    return 'police';
  }

  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === 'police' && bot.id === realPoliceId) pick = 'citizen';
  setBotFakeClaim(room, bot.id, pick, helpers);
  return pick;
}

function buildBluffOpenLine(fakeRole, bot, room) {
  const g = room.game || {};
  if (fakeRole === 'police') {
    return null;
  }
  const pool = BLUFF_OPEN_LINES[fakeRole] || BLUFF_OPEN_LINES.citizen;
  if (!pool.length) return null;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (fakeRole === 'reporter' && (g.nightIndex || 0) < 2) {
    line = '저는 기자입니다. 아직 2밤 전이라 취재 전입니다.';
  }
  return line;
}

function pickRivalClaimant(claims, role, bot) {
  const list = (claims[role] || []).filter((c) => c.id !== bot.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function roleLabel(role, helpers) {
  return (helpers.ROLE_LABELS && helpers.ROLE_LABELS[role]) || role;
}

function isDay1Bluff(room) {
  return (room.game?.dayIndex || 0) <= 1;
}

function getBotPoliceBluffLedger(room, botId) {
  const g = room && room.game;
  if (!g || !botId) return null;
  const ledger = g.botPoliceBluffLedger;
  if (!ledger || !ledger[botId]) return null;
  const entry = ledger[botId];
  if (entry.dayIndex !== (g.dayIndex || 0)) return null;
  return entry;
}

function setBotPoliceBluffLedger(room, botId, entry) {
  if (!room?.game || !botId || !entry?.line) return;
  if (!room.game.botPoliceBluffLedger) room.game.botPoliceBluffLedger = {};
  room.game.botPoliceBluffLedger[botId] = {
    dayIndex: room.game.dayIndex || 0,
    targetNickname: entry.targetNickname || null,
    innocent: !!entry.innocent,
    line: entry.line
  };
}

function getBotFakePoliceHistoryNames(room, botId) {
  if (!room?.game?.botFakePoliceHistory || !botId) return [];
  return room.game.botFakePoliceHistory[botId] || [];
}

function rememberPoliceBluffLine(room, botId, line) {
  if (!line || !botId) return;
  const names = policeFmt.extractReportedNames(line, 1);
  const targetNickname = names[0] || null;
  const innocent = /마피아\s*아님|무죄|시민\s*팀|깨끗|아니라서/.test(line)
    && !/마피아팀으로|마피아입니다|마피아로/.test(line);
  setBotPoliceBluffLedger(room, botId, { targetNickname, innocent, line });
  if (!room.game) return;
  if (!room.game.botFakePoliceHistory) room.game.botFakePoliceHistory = {};
  if (!room.game.botFakePoliceHistory[botId]) room.game.botFakePoliceHistory[botId] = [];
  if (targetNickname && !room.game.botFakePoliceHistory[botId].includes(targetNickname)) {
    room.game.botFakePoliceHistory[botId].push(targetNickname);
  }
}

/** 이미 채팅에 올린 조결을 ledger에 반영 (맞경 후속 멘트 일관성) */
function ensureLedgerFromDayChat(room, botId) {
  if (getBotPoliceBluffLedger(room, botId)) return getBotPoliceBluffLedger(room, botId);
  for (const msg of getDayMessages(room)) {
    if (!msg || msg.fromId !== botId || !msg.text) continue;
    if (!POLICE_REPORT_CHAT.test(msg.text) && !policeFmt.looksLikePoliceReport(msg.text)) continue;
    rememberPoliceBluffLine(room, botId, msg.text);
    return getBotPoliceBluffLedger(room, botId);
  }
  return null;
}

function getRecentPoliceReportNames(room, limit = 3) {
  const names = [];
  for (let i = getDayMessages(room).length - 1; i >= 0 && names.length < limit; i--) {
    const msg = getDayMessages(room)[i];
    if (!msg?.text || !POLICE_REPORT_CHAT.test(msg.text)) continue;
    for (const n of policeFmt.extractReportedNames(msg.text, limit)) {
      if (!names.includes(n)) names.push(n);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

/** 가짜 경찰 조결은 fakeClaim이 비었거나 이미 경찰 위장일 때만 (다른 직공 고정 시 발화 금지) */
function buildFakePoliceReportLine(room, bot, helpers, opts = {}) {
  const cur = getBotFakeClaim(room, bot.id, helpers);
  if (cur && cur !== 'police') return null;
  if (!cur && !mayMafiaTeamBotBluffPolice(room, bot, helpers)) return null;

  if (!opts.forceNew) {
    const cached = getBotPoliceBluffLedger(room, bot.id);
    if (cached?.line) return cached.line;
  }

  setBotFakeClaim(room, bot.id, 'police', helpers);

  if (opts.preferClearMafiaAlly && helpers.isMafiaTeam) {
    const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
    const avoidN = new Set(
      [...(opts.avoidNames || []), opts.avoidName].filter(Boolean)
    );
    const allies = alive.filter(
      (p) => p && p.id !== bot.id && p.alive && p.nickname && helpers.isMafiaTeam(p.role)
    );
    const candidates = allies.filter((p) => !avoidN.has(p.nickname));
    const pool = candidates.length ? candidates : allies;
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const line = policeFmt.formatInnocentLine(pick.nickname);
      rememberPoliceBluffLine(room, bot.id, line);
      return line;
    }
  }

  const avoid = new Set([
    ...(opts.avoidNames || []),
    ...getRecentPoliceReportNames(room, 4),
    ...getBotFakePoliceHistoryNames(room, bot.id)
  ]);
  if (opts.avoidName) avoid.add(opts.avoidName);

  let names = pickAliveNames(room, bot, helpers, 10);
  names = names.filter((n) => n && !avoid.has(n));
  if (!names.length) {
    names = pickAliveNames(room, bot, helpers, 3);
  }
  let name = names[0];
  if (!name) {
    const alive = helpers.getAlivePlayers
      ? helpers.getAlivePlayers(room).filter((p) => p && p.alive && p.id !== bot.id && p.nickname)
      : [];
    const pick = alive.find((p) => !avoid.has(p.nickname)) || alive[0];
    name = pick ? pick.nickname : null;
  }
  if (!name) return null;

  let line;
  if (opts.forceMafia === true || (!opts.forceInnocent && Math.random() < 0.08)) {
    if (helpers.getAlivePlayers) {
      const nonMafiaAlive = helpers.getAlivePlayers(room).filter(
        (p) => p && p.alive && p.id !== bot.id && (!helpers.isMafiaTeam || !helpers.isMafiaTeam(p.role))
      );
      if (nonMafiaAlive.length) {
        const pick = nonMafiaAlive[Math.floor(Math.random() * nonMafiaAlive.length)];
        line = policeFmt.formatMafiaLine(pick.nickname);
        rememberPoliceBluffLine(room, bot.id, line);
        return line;
      }
    }
    line = policeFmt.formatMafiaLine(name);
  } else {
    line = policeFmt.formatInnocentLine(name);
  }
  rememberPoliceBluffLine(room, bot.id, line);
  return line;
}

/** @deprecated alias — 항상 가짜 조결 */
function buildPoliceStyleBluffLine(room, bot, helpers, opts = {}) {
  return buildFakePoliceReportLine(room, bot, helpers, opts);
}

/** 낮 1: 경찰 연기만 / 이후: 맞경·선동 */
function pickMafiaBluffLine(room, bot, helpers) {
  const tryPoliceBluff = () => {
    const line = buildPoliceStyleBluffLine(room, bot, helpers);
    if (line) return line;
    const fake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
    const pool = CITIZEN_BLUFF_ROLL_LINES[fake] || CITIZEN_BLUFF_ROLL_LINES.citizen;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  if (isDay1Bluff(room)) {
    return tryPoliceBluff();
  }
  const reporters = scanPoliceReporters(room, helpers);
  if (reporters.some((r) => r.id !== bot.id)) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }
  return tryPoliceBluff();
}

/** 마피아·스파이·교주·신도 공통 블러핑 (가짜 조결·맞경·시민 직공 혼합) */
function pickEvilBluffLine(room, bot, helpers) {
  ensureAllEvilFakeClaims(room, helpers);
  const fcLine = pickLineConsistentWithFakeClaim(room, bot, helpers, {});
  if (fcLine) return fcLine;

  const roll = Math.random();
  if (isCultSideBluff(bot)) {
    if (roll < 0.38) return pickMafiaBluffLine(room, bot, helpers);
    if (roll < 0.62) {
      const fake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);
      const pool = CITIZEN_BLUFF_ROLL_LINES[fake] || EVIL_CONFUSION_STIR_LINES;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    return pickConfusionStirLine(room);
  }
  return pickMafiaBluffLine(room, bot, helpers);
}

/** 토론 중 주기적 선동·혼란 (스케줄·무응답 턴) */
function pickContinuousEvilBluff(room, bot, helpers) {
  ensureAllEvilFakeClaims(room, helpers);
  const fc = getBotFakeClaim(room, bot.id, helpers);
  const roll = Math.random();
  if (roll < 0.48) return pickEvilBluffLine(room, bot, helpers);
  if (roll < 0.82) {
    const mat = buildMatgyeongCounterClaim(room, bot, helpers);
    if (mat) return mat;
  }
  if (fc && ROLE_MATGYEONG[fc]) {
    const roleMat = buildRoleMatgyeongClaim(room, bot, helpers, fc);
    if (roleMat) return roleMat;
  }
  const line = pickLineConsistentWithFakeClaim(room, bot, helpers, {});
  if (line) return line;
  return pickConfusionStirLine(room);
}

/** 비경찰 위장 봇 — 맞직·직공 유지 멘트 주기 발화 */
function scheduleMafiaRoleBluffWaves(room, helpers, scheduleFn, postFn) {
  if (!scheduleFn || !postFn || !room?.game) return;
  const roleCallOpen = !!room.game.roleRollCallOpen;
  const evilBots = getAliveEvilBluffBots(room, helpers);
  ensureAllEvilFakeClaims(room, helpers);

  evilBots.forEach((bot, i) => {
    const fc = getBotFakeClaim(room, bot.id, helpers);
    if (!fc || fc === 'police') return;
    if (!roleCallOpen) return;
    if (fc === 'citizen' && Math.random() < 0.35) return;

    scheduleFn(room, () => {
      if (room.phase !== 'day_chat') return;
      const claims = scanRoleClaims(room, helpers)[fc] || [];
      let text = null;
      if (claims.some((c) => c.id !== bot.id)) {
        text = buildRoleMatgyeongClaim(room, bot, helpers, fc);
      }
      if (!text) {
        text = pickLineConsistentWithFakeClaim(room, bot, helpers, {});
      }
      if (text) {
        postFn(room, bot, text, { mafiaFakePolice: fc === 'police' });
        agentLog({
          hypothesisId: 'Mf2',
          location: 'm42-bluff.js:scheduleMafiaRoleBluffWaves',
          message: 'role bluff posted',
          runId: 'mafia-bluff',
          data: { bot: bot.nickname, fakeClaim: fc, preview: String(text).slice(0, 60) }
        });
      }
    }, 2800 + i * 1900 + Math.floor(Math.random() * 800));
  });
}

function wantsMatgyeongAsk(text) {
  if (!text) return false;
  const c = String(text).replace(/\s+/g, '');
  if (!MATGYEONG_ASK.test(c)) return false;
  return /있|없|누|누구|하나|나오|나왔|봐|보|ㅇㅇ|맞아|인가|인지|제발|좀/.test(c)
    || /맞경있/.test(c)
    || c.length <= 12;
}

/** 맞경 상대는 시민 쪽 경찰 주장자만 (스파이·마피아 동료 제외) */
function pickPoliceBluffRival(room, bot, helpers) {
  const reporters = scanPoliceReporters(room, helpers);
  for (const r of reporters) {
    if (r.id === bot.id) continue;
    const p = helpers.getPlayerById ? helpers.getPlayerById(room, r.id) : null;
    if (!p || !p.alive) continue;
    if (helpers.isMafiaTeam && helpers.isMafiaTeam(p.role)) continue;
    if (m42Cult.isCultMember(p)) continue;
    return r;
  }
  return reporters.find((r) => r.id !== bot.id) || null;
}

/** 이미 시민·군인 등 비경찰 직공으로 고정된 악역: 맞경·가짜 조결 대신 무직 입장 */
function pickPoliticianMafiaBluffVoteLine(room, bot, helpers) {
  if (getBotFakeClaim(room, bot.id, helpers) !== 'politician') return null;
  const alive = helpers.getAlivePlayers ? helpers.getAlivePlayers(room) : [];
  const foes = alive.filter(
    (p) => p && p.alive && p.id !== bot.id && p.nickname
      && !(helpers.isMafiaTeam && helpers.isMafiaTeam(p.role))
  );
  if (!foes.length) return null;
  const t = foes[Math.floor(Math.random() * foes.length)];
  const n = t.nickname;
  const lines = [
    `저는 정치인입니다. ${n}님 톤이 맢 같습니다. 2표로 같이 가죠.`,
    `정치인입니다. 면역이라 말은 직설적으로 하겠습니다. ${n}님 라인으로 표 모읍니다.`,
    `저는 정치인입니다. ${n}님부터 몰아야 판이 흔들립니다. 제 두 표는 ${n}님 쪽입니다.`,
    `정치인입니다. ${n}님 발언이 맢 흉내라 오늘은 ${n}님으로 투표 유도하겠습니다.`,
    `저는 정치인입니다. ${n}님 쪽으로 찍고 설득하겠습니다. 2표의 무게를 보여 드리죠.`
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function pickMatgyeongCitizenConfusion(room, bot, helpers) {
  const lines = [
    '맞경이면 한쪽은 맢인데 저는 무직이라 조결은 못 냅니다. 채팅에 올라온 조결부터 보겠습니다.',
    '저는 시민 직공으로 밀고 있어서 경찰 조사는 못 합니다. 공개된 조결만 따르겠습니다.',
    '맞경 싸움은 경찰끼리 하시고 저는 직공한 역할만 유지하겠습니다. 조결 공유 부탁드립니다.',
    '저는 특수직 아니라고 말한 상태입니다. 가짜 조결로 끼어들 순 없습니다.',
    '맞경이면 조결부터인데 저는 경찰이 아니라 조결을 못 올립니다. 나온 팩트로 따라가겠습니다.'
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function isLockedNonPoliceFakeClaim(room, botId, helpers) {
  const cur = getBotFakeClaim(room, botId, helpers);
  return !!(cur && cur !== 'police' && !['mafia', 'spy', 'cult_leader'].includes(cur));
}

/** 홀경 조결 이후 → 가짜 조결 + 맞경 진경·짭경 우김 */
function buildMatgyeongCounterClaim(room, bot, helpers) {
  const fc = getBotFakeClaim(room, bot.id, helpers);
  if (fc && ROLE_MATGYEONG[fc]) {
    return buildRoleMatgyeongClaim(room, bot, helpers, fc);
  }
  if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
    const matRole = ['doctor', 'soldier', 'medium', 'reporter'].find((r) => {
      const claims = scanRoleClaims(room, helpers)[r] || [];
      return claims.some((c) => c.id !== bot.id);
    });
    if (matRole && fc === matRole) {
      return buildRoleMatgyeongClaim(room, bot, helpers, matRole);
    }
    return pickMatgyeongCitizenConfusion(room, bot, helpers);
  }
  if (!mayMafiaTeamBotBluffPolice(room, bot, helpers)) {
    return pickMatgyeongCitizenConfusion(room, bot, helpers);
  }

  ensureLedgerFromDayChat(room, bot.id);
  const ledgerEarly = getBotPoliceBluffLedger(room, bot.id);
  const rivalEarly = pickPoliceBluffRival(room, bot, helpers);
  if (ledgerEarly?.line) {
    const bickerOnly = rivalEarly
      ? pickPoliceVersusBicker(bot.nickname, rivalEarly.nickname, true)
      : pickMatgyeongNoRivalBicker();
    return `${bickerOnly} ${ledgerEarly.line}`;
  }

  const rival = rivalEarly;
  const selfName = bot.nickname || '저';
  const wantBicker = Math.random() < (rival ? 0.92 : 0.72);
  const wantReport = Math.random() < 0.84;

  const pieces = [];
  if (wantBicker) {
    pieces.push(rival ? pickPoliceVersusBicker(selfName, rival.nickname, true) : pickMatgyeongNoRivalBicker());
  }

  const ledger = getBotPoliceBluffLedger(room, bot.id);
  let report = null;
  if (wantReport) {
    if (ledger?.line) {
      report = ledger.line;
    } else if (rival) {
      report = buildFakePoliceReportLine(room, bot, helpers, { forceMafia: true });
      if (!report) {
        const alt = pickAliveNames(room, bot, helpers, 1)[0];
        if (alt) {
          report = policeFmt.formatMafiaLine(alt);
          rememberPoliceBluffLine(room, bot.id, report);
        }
      }
    } else {
      report = buildFakePoliceReportLine(room, bot, helpers);
    }
  }

  if (report && (pieces.length === 0 || Math.random() < 0.9)) {
    pieces.push(report);
    if (/마피아입니다/.test(report) && Math.random() < 0.9) {
      const targetName = policeFmt.extractReportedNames(report)[0] || null;
      pieces.push(pickMatgyeongVotePushLine(targetName));
    }
  }

  if (pieces.length) return pieces.join(' ');

  if (ledger?.line) {
    const bicker = rival
      ? pickPoliceVersusBicker(selfName, rival.nickname, true)
      : pickMatgyeongNoRivalBicker();
    return `${bicker} ${ledger.line}`;
  }

  if (rival) {
    const fake = buildFakePoliceReportLine(room, bot, helpers, { forceMafia: true });
    if (fake) return fake;
    const alt = pickAliveNames(room, bot, helpers, 1)[0];
    if (alt) {
      const line = policeFmt.formatInnocentLine(alt);
      rememberPoliceBluffLine(room, bot.id, line);
      return line;
    }
  }

  return buildFakePoliceReportLine(room, bot, helpers);
}

function pickProactiveMafiaBluff(room, bot, helpers) {
  return pickEvilBluffLine(room, bot, helpers);
}

function reactToMatgyeongAsk(room, bot, isEvil, triggerText, helpers) {
  if (!isEvil || !wantsMatgyeongAsk(triggerText)) return null;
  if (isDay1Bluff(room)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers);
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
  }
  if (Math.random() < 0.42) {
    const rival = pickPoliceBluffRival(room, bot, helpers);
    if (rival) return pickPoliceVersusBicker(bot.nickname, rival.nickname, true);
  }
  return buildMatgyeongCounterClaim(room, bot, helpers);
}

function reactToClaimBluff(room, bot, isEvil, triggerText, last, helpers) {
  const text = `${triggerText || ''} ${last && last.text ? last.text : ''}`;
  const compact = text.replace(/\s+/g, '');
  const reporters = scanPoliceReporters(room, helpers);
  let myFake = getBotFakeClaim(room, bot.id, helpers);
  if (!myFake) myFake = pickMafiaBluffRole(room, bot, helpers);
  const rl = (r) => roleLabel(r, helpers);

  if (!isEvil) {
    if (MAT_CHAT.test(compact) && /맞경|맞직/.test(compact)) {
      return '맞직이면 조결·취재부터 확인하겠습니다. 저는 시민입니다.';
    }
    return null;
  }

  const compactTrig = String(triggerText || '').replace(/\s+/g, '');
  if (/경조결|경찰조사|경찰조사결과|조결|경조|수사결과|조사결과/.test(compactTrig)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers, {
      forceInnocent: true,
      preferClearMafiaAlly: true
    });
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
  }

  if (isDay1Bluff(room)) {
    const rep = buildFakePoliceReportLine(room, bot, helpers);
    if (rep) return rep;
    if (isLockedNonPoliceFakeClaim(room, bot.id, helpers)) {
      return pickMatgyeongCitizenConfusion(room, bot, helpers);
    }
    return pickEvilBluffLine(room, bot, helpers);
  }

  const matAsk = reactToMatgyeongAsk(room, bot, true, triggerText, helpers);
  if (matAsk) return matAsk;

  if (last && POLICE_REPORT_CHAT.test(last.text) && last.fromId !== bot.id) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }

  if (reporters.length >= 1) {
    const rival = reporters.find((r) => r.id !== bot.id);
    if (rival) {
      return buildMatgyeongCounterClaim(room, bot, helpers);
    }
  }

  for (const role of ['police', 'doctor', 'soldier', 'reporter', 'medium']) {
    const n = countClaims(scanRoleClaims(room, helpers), role, null);
    const short = ROLE_SHORT[role];
    const matMention = new RegExp(`맞${short}|쓰리${short}|${short}맞|맞${rl(role)}`);
    if (n >= 1 || matMention.test(compact) || (role === 'police' && reporters.length >= 1)) {
      if (myFake === role) {
        const roleMat = buildRoleMatgyeongClaim(room, bot, helpers, role);
        if (roleMat) return roleMat;
      }
      const names = role === 'police'
        ? reporters.map((r) => r.nickname).join(', ')
        : (scanRoleClaims(room, helpers)[role] || []).map((c) => c.nickname).join(', ');
      if (myFake === role && names) {
        const rival = pickRivalClaimant(scanRoleClaims(room, helpers), role, bot);
        const rivalName = rival ? rival.nickname : names.split(',')[0];
        if (role === 'police' && rivalName && Math.random() < 0.74) {
          return pickPoliceVersusBicker(bot.nickname, rivalName, true);
        }
        return `맞${short}입니다. 저는 진${short}입니다. ${rivalName}님 조결이 수상합니다.`;
      }
      if (names) {
        return `맞${short}입니다. ${names}님 중 조결로 짭${short} 가려야 합니다. 저는 ${rl(myFake)}입니다.`;
      }
    }
  }

  if (last && last.fromId !== bot.id && ROLE_CLAIM_DETECT.police.test(compact)) {
    return buildMatgyeongCounterClaim(room, bot, helpers);
  }

  if (JIKGONG_CHAT.test(compact) || wantsOpenClaim(text) || MAT_CHAT.test(compact)) {
    return pickEvilBluffLine(room, bot, helpers);
  }

  if (Math.random() < 0.72) {
    return pickEvilBluffLine(room, bot, helpers);
  }

  return null;
}

function wantsOpenClaim(text) {
  return JIKGONG_CHAT.test(String(text).replace(/\s+/g, ''));
}

function buildCitizenBluffRollCallAnswer(room, bot, helpers) {
  ensureAllEvilFakeClaims(room, helpers);
  const fake = getBotFakeClaim(room, bot.id, helpers) || pickMafiaBluffRole(room, bot, helpers);

  const open = buildBluffOpenLine(fake, bot, room);
  if (open) return open;
  const pick = CITIZEN_BLUFF_ROLL_LINES[fake] || CITIZEN_BLUFF_ROLL_LINES.citizen;
  return pick[Math.floor(Math.random() * pick.length)];
}

function buildMafiaRollCallAnswer(room, bot, helpers) {
  return buildCitizenBluffRollCallAnswer(room, bot, helpers);
}

function buildLlmBluffHint(brief, bot) {
  if (!brief.isEvilBluff) return '';
  const teukjikHint = '시민 위장 시 "일반 시민 외 특수직은 직공 못 한다", "무직 시민" 사용. 의사 위장 시 "의사는 특수직"이라고 말할 것.';
  if (isCultSideBluff(bot)) {
    return [
      '교주·신도·포교·종소리·교주팀 절대 노출 금지.',
      '낮 공개 채팅은 마피아팀과 같이 적극 블러핑: 거짓 직공, 가짜 조결, 맞경·쓰리경 선동, 짭경 몰기.',
      '시민팀 직업(경찰·군인·기자·영매·정치인·시민)으로 헷갈리게. 중복 직공 허용.',
      teukjikHint,
      '매 턴 시민처럼 말하되 팩트를 흐리게 하고 의심을 다른 사람에게 돌릴 것.'
    ].join(' ');
  }
  if ((brief.dayIndex || 0) <= 1) {
    return `낮 1 경찰 연기: "○○님 조사했는데 마피아 아닙니다"처럼 짧고 자연스럽게. "수사 결과입니다" 같은 시스템 멘트 금지. 홀경·늦경·맞경 선동. ${teukjikHint} 마피아·밤챗·접선 노출 금지. 계속 블러핑.`;
  }
  return `경조결·맞경·직공마다 적극 블러핑. 가짜 조결·맞경 선동·짭경 몰기. ${teukjikHint} 위장 정치인이면 "정치인입니다"를 밝힌 뒤 맢 흉내로 특정 생존자에게 표를 모으되 진짜 직업 단정은 피할 것. "수사 결과입니다" 형식 금지. 마피아·밤챗·접선 노출 금지. 시민을 계속 헷갈리게. 맞경이면 상대 경찰 주장자 이름을 부르며 "진경은 나", "너 짭경", "조결 왜 다르냐"처럼 서로 우기는 대사를 자주 섞을 것. 한번 정한 위장 직공(경찰·시민 등)은 죽을 때까지 바꾸지 말 것. 마피아팀 봇이 둘 이상이면 한 명만 경찰·가짜 조결을 맡고 동료 봇은 무직·특직 비공개(직공 메타)로 가르칠 것.`;
}

module.exports = {
  retainsRealRolePublicIdentity,
  isEvilBluffBot,
  isCultSideBluff,
  scanRoleClaims,
  scanPoliceReporters,
  pickMafiaBluffRole,
  buildBluffOpenLine,
  buildFakePoliceReportLine,
  buildPoliceStyleBluffLine,
  pickMafiaBluffLine,
  pickEvilBluffLine,
  pickContinuousEvilBluff,
  pickPoliceBluffRival,
  buildMatgyeongCounterClaim,
  getBotPoliceBluffLedger,
  rememberPoliceBluffLine,
  ensureLedgerFromDayChat,
  pickPoliceVersusBicker,
  pickMatgyeongVotePushLine,
  pickMatgyeongTikiTakaLine,
  pickMatgyeongNoRivalBicker,
  pickMatgyeongCitizenConfusion,
  pickPoliticianMafiaBluffVoteLine,
  getBotFakeClaim,
  mayMafiaTeamBotBluffPolice,
  getAliveMafiaTeamBotPlayers,
  getMafiaPoliceBlufferBot,
  burnMafiaPoliceBluffLine,
  reassignAliveMafiaAwayFromPolice,
  promoteMafiaPoliceBluffer,
  ensureMafiaPoliceBlufferClaim,
  ensureAllEvilFakeClaims,
  buildRoleMatgyeongClaim,
  scheduleMafiaRoleBluffWaves,
  pickLineConsistentWithFakeClaim,
  enforceBluffRoleConsistency,
  pickProactiveMafiaBluff,
  reactToClaimBluff,
  reactToMatgyeongAsk,
  wantsMatgyeongAsk,
  buildMafiaRollCallAnswer,
  buildCitizenBluffRollCallAnswer,
  buildLlmBluffHint,
  EVIL_CONFUSION_STIR_LINES,
  MAT_CHAT,
  JIKGONG_CHAT
};
