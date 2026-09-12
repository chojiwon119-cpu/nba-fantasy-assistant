# 🏀 NBA Fantasy Assistant

Yahoo Fantasy Basketball을 변경하지 않고, 현재 열린 리그 화면을 읽기 전용으로 자동 반영하는 개인용 예측·의사결정 도구입니다.

## 시작하기

### 1. 패키지 설치
```bash
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```

`http://localhost:3000`에 접속합니다.

### 3. Yahoo Companion 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 선택합니다.
4. 저장소의 `extension` 폴더를 선택합니다.
5. Yahoo Fantasy Basketball과 Assistant 대시보드를 새로고침합니다.

확장 프로그램은 사용자가 현재 열어 본 Yahoo 화면의 선수·로스터 정보만 로컬에 저장합니다. Yahoo로 추가 요청을 보내거나 지명, Add/Drop, Waiver, Trade, Lineup 변경을 실행하지 않습니다.

## 주요 기능

### 📊 My Playbook (`/dashboard`)
- Yahoo Companion 연결 및 데이터 신선도 확인
- 현재 관측된 선수·로스터·FA/Waiver 상태 요약
- 검증된 예측 데이터가 없으면 추천을 생성하지 않는 fail-closed 구조

### 📋 드래프트 어시스턴트 (`/mock-draft`)
- Snake draft 순서 자동 계산 (6팀, 13라운드)
- 커스텀 배점 기반 Fantasy Score 실시간 계산
- 포지션 밸런스 체크 (필요 포지션 강조)
- 타팀 픽 처리로 잔여 선수풀 자동 업데이트
- 내 픽까지 남은 픽 수 카운트다운

### 🔄 트레이드 분석기 (`/trade`, 전환 예정)
- player_key 기반 다자 트레이드 분석
- 스탯별 상세 비교 (PTS/REB/AST/ST/BLK/TO 등)
- 공정성 점수 (0~100) + 판정 (유리/불리/균형)
- 부상 상태 반영

### ➕ 웨이버 어드바이저 (`/waiver`, 전환 예정)
- FA 선수 Fantasy Score 순위 목록
- 픽업 vs 컷 1:1 비교 분석
- "픽업 추천 / 기다려라 / 패스" 3단계 판정
- 스탯별 장단점 비교

## 포인트 배점 (커스텀)
| 스탯 | 배점 |
|------|------|
| FGA | -1 |
| FGM | +2 |
| FTA | -1 |
| FTM | +1.5 |
| 3PTA | -1 |
| 3PTM | +3 |
| PTS | +1 |
| REB | +1.2 |
| AST | +1.8 |
| ST | +3 |
| BLK | +3 |
| TO | -1 |
| DD | +3 |
| TD | +5 |

## 로스터 구성
PG×1, SG×1, G×1, SF×1, PF×1, F×1, C×2, UTIL×2, BN×3, IL×3, IL+×1 (총 17명)
드래프트: 액티브 10명 + BN 3명 = 13명

## 예측 엔진 원칙

모든 조언은 동일한 경기별 예측에서 출발하며, 기능별로 다음 기간의 예상 팀 증분점수를 사용합니다.

- 드래프트: 잔여 시즌 예상점수와 대체선수 대비 가치
- 웨이버: 향후 7일·14일 실제 선발 예상점수 증가분
- 트레이드: 거래 전후 최적 로스터의 잔여 시즌 예상점수 차이

예측에는 예상 경기 수, 출전확률, 예상 출장시간, 불확실성 범위와 모델 버전을 포함합니다. 현재 정적 선수 데이터는 외부 데이터 공급자 연결 전의 오프라인 임시 자료이며 실전 추천 자료로 간주하지 않습니다.

## NBA 데이터 자동 수집 및 예측 모델 v1

NBA 데이터는 공급자 어댑터를 통해 서버에서만 수집됩니다. 기본 공급자는 무료
[NBA.com](https://www.nba.com/) 공식 데이터이며 API 키나 유료 구독이 필요하지 않습니다.
공식 시즌 일정과 NBA Stats 게임로그를 서버에서 읽습니다. API-Sports와 BALLDONTLIE는
선택 가능한 대체 공급자로만 남겨둡니다(`api-sports-legacy`, `balldontlie`). 기존 배포의
`api-sports` 설정은 NBA 공식 공급자로 자동 마이그레이션됩니다.

1. `.env.example`처럼 `NBA_DATA_PROVIDER=nba-official`을 사용합니다. 환경변수를 생략해도 이 값이 기본입니다.
2. `/api/nba/status?probe=1`에서 공식 데이터 연결 상태를 확인합니다.
3. Yahoo Companion이 읽은 선수들은 `/api/nba/match`에서 정규화된 이름과 팀으로 NBA ID에 자동 연결됩니다.
4. 연결된 숫자 ID는 `/api/projections?player_ids=선수ID&horizon=next_7_days`의 예측 입력으로 사용됩니다.

예측 모델은 최근 15경기의 지수가중 분당 생산성, 예상 출전시간, 일정, 홈/원정,
백투백, 상대팀 최근 실점 수준, 부상 상태를 경기별로 반영합니다. 결과에는 예상 총점과
함께 P10/P50/P90, 데이터 품질, 신뢰도 및 적용된 요인이 포함됩니다. 최근 유효 표본이
3경기 미만이면 `insufficient`로 표시합니다.

동일한 NBA.com 요청은 서버에서 캐시하고 진행 중 요청도 병합합니다. NBA.com의 웹 데이터
엔드포인트에는 별도의 공개 SLA가 없으므로 장애 시 추천을 중단하는 fail-closed 원칙을
유지합니다. 선수 상태는 유료 부상 API 대신 Yahoo Companion이 현재 화면에서 읽은
GTD/OUT/IL 정보를 사용합니다.
