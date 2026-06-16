# 🏀 NBA Fantasy Assistant

Yahoo Fantasy NBA 리그 자동 연동 기반의 드래프트 · 트레이드 · 웨이버 분석 도구

## 시작하기

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env.local` 파일이 이미 생성되어 있습니다. 필요 시 수정하세요:
```
YAHOO_CLIENT_ID=your_client_id
YAHOO_CLIENT_SECRET=your_client_secret
YAHOO_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

### 3. 개발 서버 실행
```bash
npm run dev
```
http://localhost:3000 접속 후 Yahoo 로그인

## 주요 기능

### 📋 드래프트 어시스턴트 (`/draft`)
- Snake draft 순서 자동 계산 (6팀, 13라운드)
- 커스텀 배점 기반 Fantasy Score 실시간 계산
- 포지션 밸런스 체크 (필요 포지션 강조)
- 타팀 픽 처리로 잔여 선수풀 자동 업데이트
- 내 픽까지 남은 픽 수 카운트다운

### 🔄 트레이드 분석기 (`/trade`)
- player_key 기반 다자 트레이드 분석
- 스탯별 상세 비교 (PTS/REB/AST/ST/BLK/TO 등)
- 공정성 점수 (0~100) + 판정 (유리/불리/균형)
- 부상 상태 반영

### ➕ 웨이버 어드바이저 (`/waiver`)
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

## Yahoo Developer App 설정
Yahoo Developer Console에서 Callback URI를 `http://localhost:3000/api/auth/callback`으로 설정해주세요.
배포 시에는 실제 도메인으로 변경이 필요합니다.
