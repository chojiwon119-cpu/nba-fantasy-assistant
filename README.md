# 🏀 NBA Fantasy Assistant

Yahoo Fantasy Basketball 리그를 자동으로 읽어와 예측 기반으로 드래프트·트레이드·웨이버를 도와주는 개인용 도구입니다. **수동으로 할 일은 최초 Yahoo 로그인 1번뿐**입니다 — 브라우저 확장이나 화면을 직접 여는 과정이 없습니다.

## 시작하기

### 1. Yahoo 앱 등록 (최초 1회)

1. [Yahoo Developer Network](https://developer.yahoo.com/apps/)에서 앱을 만듭니다.
2. Fantasy Sports 권한을 Read로 설정하고, Redirect URI를 `http://localhost:3000/api/auth/callback`(배포 시에는 실제 도메인)으로 등록합니다.
3. 발급받은 Client ID/Secret을 `.env.local`에 넣습니다.

```bash
cp .env.example .env.local
# YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET / YAHOO_REDIRECT_URI 채우기
```

### 2. 패키지 설치 및 실행

```bash
npm install
npm run dev
```

`http://localhost:3000` → 자동으로 `/dashboard`로 이동 → **Yahoo로 로그인** 버튼 클릭. 로그인 후에는 refresh token으로 계속 자동 갱신되므로 다시 로그인할 필요가 없습니다.

## 주요 기능

### 📊 My Playbook (`/dashboard`)
- Yahoo 로그인 상태와 리그 자동 연결 확인
- 내 로스터·FA/Waiver 상태를 Yahoo API로 자동 조회 (15분마다 자동 재조회)
- 예측 데이터가 부족하면 대체 데이터로 채우지 않고 신뢰도를 낮춰 표시하는 fail-closed 구조

### 📋 드래프트 어시스턴트 (`/mock-draft`)
- 내 Yahoo 리그의 선수 풀을 자동으로 불러와 구성 (직접 입력 없음)
- Snake/Linear 드래프트, 커스텀 배점, 포지션 밸런스 체크
- 가치 순위는 시즌 평균이 아니라 잔여 시즌(rest_of_season) 예측 점수 기준

### 🔄 트레이드 분석기 (`/trade`) / ➕ 웨이버 어드바이저 (`/waiver`)
- 대시보드에서 선택한 리그가 자동으로 적용됨
- 판정 점수가 시즌 통계 합산이 아니라 예측 모델(트레이드는 잔여 시즌, 웨이버는 향후 14일) 기준

## 포인트 배점 (커스텀)
| 스탯 | 배점 |
|------|------|
| FGA | -1 | FGM | +2 | FTA | -1 | FTM | +1.5 |
| 3PTA | -1 | 3PTM | +3 | PTS | +1 | REB | +1.2 |
| AST | +1.8 | ST | +3 | BLK | +3 | TO | -1 |
| DD | +3 | TD | +5 |

## 로스터 구성
PG×1, SG×1, G×1, SF×1, PF×1, F×1, C×2, UTIL×2, BN×3, IL×3, IL+×1 (총 17명)
드래프트: 액티브 10명 + BN 3명 = 13명

## 예측 모델 (v2, 무료·외부 API 없음)

이전 버전은 NBA.com/ESPN 공개 API를 시도했지만 이 환경에서 전부 접속 차단되어(NBA.com은 연결 자체 불가, ESPN은 403), 결국 브라우저 확장으로 Yahoo 화면을 사람이 직접 열어야만 데이터가 쌓이는 완전 수동 구조가 되어 있었습니다. 지금은 **외부 NBA 데이터 소스를 아예 쓰지 않습니다.**

- **스탯 이력**: 이미 인증되어 있는 Yahoo Fantasy API 자체의 `stats;type=date` 엔드포인트로 최근 10일치를 하루씩 조회해 실제 경기별 스탯을 재구성합니다(지수가중 최근 폼 반영, decay=0.88). Yahoo가 임의 과거 날짜 조회를 막는 배포 환경에서는 자동으로 주 단위(`type=week`) 스탯으로 대체됩니다.
- **부상 상태**: Yahoo가 로스터/FA 응답에 포함하는 `status`/`injury_note` 필드를 그대로 사용합니다.
- **일정/상대전적 보정**: v1에는 없습니다. 정적 스케줄 데이터를 외부에서 안전하게 가져올 방법을 아직 확인하지 못했고, 잘못된 일정 데이터를 실제처럼 보여주는 것보다는 "경기당 예상치"만 제공하는 편이 이 도구의 fail-closed 원칙에 맞습니다.
- 매칭 단계가 없습니다 — Yahoo `player_key`가 그대로 통계의 키이므로, 예전처럼 Yahoo 선수와 외부 NBA 선수 ID를 이름으로 매칭하는 과정 자체가 필요 없습니다.

결과에는 P10/P50/P90, 표본 크기(`recentGamesUsed`), 데이터 품질(`dataQuality`), 신뢰도(`confidence`), 경고 메시지가 포함됩니다. 최근 유효 표본이 3개 미만이면 `insufficient`로 표시하고 추천을 보수적으로 처리합니다.
