# NBA Fantasy Assistant Companion

개인용 읽기 전용 Chrome 확장 프로그램입니다. 사용자가 현재 열어 본 Yahoo Fantasy Basketball 페이지의 렌더링된 선수 정보만 로컬에 저장합니다.

## 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 선택합니다.
4. 이 `extension` 폴더를 선택합니다.
5. Yahoo Fantasy Basketball과 `http://localhost:3000/dashboard`를 각각 한 번 새로고침합니다.

## 안전 범위

- Yahoo로 추가 네트워크 요청을 보내지 않습니다.
- Yahoo 쿠키, 비밀번호, OAuth 토큰을 읽거나 저장하지 않습니다.
- 선수 지명, Add/Drop, Waiver, Trade, Lineup 변경을 실행하지 않습니다.
- 현재 브라우저에 렌더링된 정보만 읽습니다.

