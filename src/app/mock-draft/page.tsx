'use client';
import { useState, useCallback, useEffect } from 'react';
import { NBA_PLAYERS, DBPlayer, getFantasyScore, getProjectedScore } from '@/lib/playerDb';
import Link from 'next/link';

// ── Types ────────────────────────────────────────────────────────────────────
interface ScoringWeights { FGM:number; FGA:number; FTM:number; FTA:number; threePM:number; threePA:number; PTS:number; REB:number; AST:number; ST:number; BLK:number; TO:number; DD:number; TD:number; [key:string]: number; }
interface RosterSlots { PG:number; SG:number; G:number; SF:number; PF:number; F:number; C:number; UTIL:number; BN:number; }
interface DraftSettings { numTeams:number; myPick:number; draftType:'snake'|'linear'; rosterSlots:RosterSlots; scoringWeights:ScoringWeights; }
interface TeamRoster { [teamIdx:number]: DBPlayer[] }

const DEFAULT_WEIGHTS: ScoringWeights = { FGM:2, FGA:-1, FTM:1.5, FTA:-1, threePM:3, threePA:-1, PTS:1, REB:1.2, AST:1.8, ST:3, BLK:3, TO:-1, DD:3, TD:5 };
const DEFAULT_SLOTS: RosterSlots = { PG:1, SG:1, G:1, SF:1, PF:1, F:1, C:2, UTIL:2, BN:3 };
const ACTIVE_SLOTS = (s: RosterSlots) => s.PG + s.SG + s.G + s.SF + s.PF + s.F + s.C + s.UTIL;
const TOTAL_SLOTS = (s: RosterSlots) => ACTIVE_SLOTS(s) + s.BN;

// ── CPU Draft Logic ───────────────────────────────────────────────────────────
function cpuPick(available: DBPlayer[], roster: DBPlayer[], slots: RosterSlots, weights: ScoringWeights & Record<string,number>): DBPlayer {
  const posCounts: Record<string, number> = {};
  roster.forEach(p => p.positions.forEach(pos => { posCounts[pos] = (posCounts[pos]||0)+1; }));

  // 포지션 충족 안 된 포지션에서 BPA 우선
  const neededPos = (Object.keys(slots) as (keyof RosterSlots)[]).filter(pos => {
    if (pos === 'BN' || pos === 'UTIL') return false;
    return (posCounts[pos] || 0) < slots[pos];
  });

  const sorted = [...available].sort((a, b) => getProjectedScore(b, weights) - getProjectedScore(a, weights));

  if (neededPos.length > 0) {
    const needed = sorted.find(p => p.positions.some(pos => neededPos.includes(pos as keyof RosterSlots)));
    if (needed) return needed;
  }
  return sorted[0];
}

// ── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart }: { onStart: (s: DraftSettings) => void }) {
  const [numTeams, setNumTeams] = useState(6);
  const [myPick, setMyPick] = useState(1);
  const [draftType, setDraftType] = useState<'snake'|'linear'>('snake');
  const [slots, setSlots] = useState<RosterSlots>(DEFAULT_SLOTS);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);

  const totalRounds = TOTAL_SLOTS(slots);

  return (
    <div style={{minHeight:'100vh',padding:'2rem',maxWidth:800,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'2rem'}}>
        <Link href="/" style={{color:'var(--text2)',textDecoration:'none',fontSize:13}}>← 홈</Link>
        <h1 style={{fontSize:22,fontWeight:700}}>🏀 Mock Draft 설정</h1>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',marginBottom:'1.5rem'}}>
        {/* 기본 설정 */}
        <div className="card">
          <h3 style={{fontWeight:600,marginBottom:'1rem',fontSize:14,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em'}}>기본 설정</h3>
          <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
            <div>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:6}}>팀 수</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {[4,6,8,10,12].map(n=>(
                  <button key={n} onClick={()=>{setNumTeams(n);if(myPick>n)setMyPick(1);}}
                    className="btn" style={{padding:'6px 14px',background:numTeams===n?'var(--accent)':'var(--bg3)',color:numTeams===n?'white':'var(--text2)',border:`1px solid ${numTeams===n?'var(--accent)':'var(--border)'}`}}>
                    {n}팀
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:6}}>내 드래프트 순서</label>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {Array.from({length:numTeams},(_,i)=>i+1).map(n=>(
                  <button key={n} onClick={()=>setMyPick(n)}
                    className="btn" style={{padding:'6px 14px',background:myPick===n?'var(--accent)':'var(--bg3)',color:myPick===n?'white':'var(--text2)',border:`1px solid ${myPick===n?'var(--accent)':'var(--border)'}`}}>
                    {n}번
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{fontSize:12,color:'var(--text2)',display:'block',marginBottom:6}}>드래프트 방식</label>
              <div style={{display:'flex',gap:6}}>
                {(['snake','linear'] as const).map(t=>(
                  <button key={t} onClick={()=>setDraftType(t)}
                    className="btn" style={{padding:'6px 20px',background:draftType===t?'var(--accent)':'var(--bg3)',color:draftType===t?'white':'var(--text2)',border:`1px solid ${draftType===t?'var(--accent)':'var(--border)'}`}}>
                    {t === 'snake' ? '🐍 Snake' : '➡️ Linear'}
                  </button>
                ))}
              </div>
              <p style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                {draftType==='snake'?'홀수 라운드 정순 → 짝수 라운드 역순':'매 라운드 동일한 순서'}
              </p>
            </div>
          </div>
        </div>

        {/* 로스터 슬롯 */}
        <div className="card">
          <h3 style={{fontWeight:600,marginBottom:'1rem',fontSize:14,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em'}}>로스터 슬롯</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
            {(Object.keys(slots) as (keyof RosterSlots)[]).map(pos=>(
              <div key={pos} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg3)',padding:'6px 10px',borderRadius:6}}>
                <span style={{fontSize:12,fontWeight:600,color:'var(--accent)'}}>{pos}</span>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <button onClick={()=>setSlots(s=>({...s,[pos]:Math.max(0,s[pos]-1)}))
                  } style={{width:22,height:22,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>-</button>
                  <span style={{fontSize:13,fontWeight:600,minWidth:16,textAlign:'center'}}>{slots[pos]}</span>
                  <button onClick={()=>setSlots(s=>({...s,[pos]:s[pos]+1}))}
                    style={{width:22,height:22,borderRadius:4,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)',cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:'0.75rem',padding:'8px',background:'var(--bg3)',borderRadius:6,fontSize:12,color:'var(--text2)',display:'flex',justifyContent:'space-between'}}>
            <span>총 {totalRounds}라운드 드래프트</span>
            <span style={{color:'var(--accent)',fontWeight:600}}>액티브 {ACTIVE_SLOTS(slots)}명 + BN {slots.BN}명</span>
          </div>
        </div>
      </div>

      {/* 포인트 배점 */}
      <div className="card" style={{marginBottom:'1.5rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: showWeights?'1rem':0}}>
          <h3 style={{fontWeight:600,fontSize:14,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.05em'}}>포인트 배점</h3>
          <button className="btn btn-secondary" style={{padding:'4px 12px',fontSize:12}} onClick={()=>setShowWeights(v=>!v)}>
            {showWeights?'접기':'커스터마이즈'}
          </button>
        </div>
        {showWeights && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.6rem'}}>
            {(Object.keys(weights) as (keyof ScoringWeights)[]).map(k=>(
              <div key={k}>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:3}}>{k}</label>
                <input type="number" step="0.1" value={weights[k]}
                  onChange={e=>setWeights(w=>({...w,[k]:parseFloat(e.target.value)||0}))}
                  style={{width:'100%',textAlign:'center'}} />
              </div>
            ))}
          </div>
        )}
        {!showWeights && (
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {(Object.entries(weights) as [keyof ScoringWeights,number][]).map(([k,v])=>(
              <span key={k} style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:'var(--bg3)',color:v>0?'var(--green)':v<0?'var(--red)':'var(--text3)'}}>
                {k} {v>0?'+':''}{v}
              </span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" style={{width:'100%',padding:'14px',fontSize:16,justifyContent:'center'}}
        onClick={()=>onStart({numTeams,myPick,draftType,rosterSlots:slots,scoringWeights:weights})}>
        🏀 드래프트 시작
      </button>
    </div>
  );
}

// ── Draft Room ────────────────────────────────────────────────────────────────
function DraftRoom({ settings, onReset }: { settings: DraftSettings; onReset: ()=>void }) {
  const totalRounds = TOTAL_SLOTS(settings.rosterSlots);
  const totalPicks = totalRounds * settings.numTeams;

  // 픽 순서 계산
  const getTeamForPick = useCallback((overall: number) => {
    const round = Math.floor((overall - 1) / settings.numTeams);
    const pickInRound = (overall - 1) % settings.numTeams;
    if (settings.draftType === 'snake' && round % 2 === 1) {
      return settings.numTeams - 1 - pickInRound;
    }
    return pickInRound;
  }, [settings]);

  const isMyPick = useCallback((overall: number) => {
    return getTeamForPick(overall) === settings.myPick - 1;
  }, [getTeamForPick, settings.myPick]);

  const [currentOverall, setCurrentOverall] = useState(1);
  const [rosters, setRosters] = useState<TeamRoster>({});
  const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set());
  const [draftLog, setDraftLog] = useState<{overall:number;teamIdx:number;player:DBPlayer}[]>([]);
  const [posFilter, setPosFilter] = useState('ALL');
  const [searchQ, setSearchQ] = useState('');
  const autoCpu = false;
  const [isDone, setIsDone] = useState(false);

  const available = NBA_PLAYERS.filter(p => !draftedIds.has(p.id));
  const myRoster = rosters[settings.myPick - 1] || [];
  const isMyTurn = isMyPick(currentOverall) && !isDone;

  const myPickNumbers: number[] = [];
  for (let i = 1; i <= totalPicks; i++) {
    if (isMyPick(i)) myPickNumbers.push(i);
  }
  const nextMyPick = myPickNumbers.find(n => n >= currentOverall) || -1;
  const picksUntil = nextMyPick > currentOverall ? nextMyPick - currentOverall : 0;

  const doPick = useCallback((player: DBPlayer, teamIdx: number) => {
    setRosters(prev => ({ ...prev, [teamIdx]: [...(prev[teamIdx]||[]), player] }));
    setDraftedIds(prev => new Set([...prev, player.id]));
    setDraftLog(prev => [...prev, { overall: currentOverall, teamIdx, player }]);
    const next = currentOverall + 1;
    if (next > totalPicks) setIsDone(true);
    else setCurrentOverall(next);
  }, [currentOverall, totalPicks]);

  // CPU auto-pick
  useEffect(() => {
    if (isDone || isMyTurn) return;
    if (!autoCpu && !isMyTurn) {
      // auto CPU picks when not my turn
      const teamIdx = getTeamForPick(currentOverall);
      const teamRoster = rosters[teamIdx] || [];
      if (available.length === 0) return;
      const timer = setTimeout(() => {
        const pick = cpuPick(available, teamRoster, settings.rosterSlots, settings.scoringWeights as ScoringWeights & Record<string,number>);
        doPick(pick, teamIdx);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentOverall, isMyTurn, isDone, available, rosters, settings, getTeamForPick, doPick, autoCpu]);

  const filtered = available.filter(p => {
    const matchPos = posFilter === 'ALL' || p.positions.includes(posFilter);
    const matchQ = !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.nbaTeam.toLowerCase().includes(searchQ.toLowerCase());
    return matchPos && matchQ;
  }).sort((a,b) => getProjectedScore(b, settings.scoringWeights as ScoringWeights & Record<string,number>) - getProjectedScore(a, settings.scoringWeights as ScoringWeights & Record<string,number>));

  // position balance
  const myPosCounts: Record<string,number> = {};
  myRoster.forEach(p => p.positions.forEach(pos => { myPosCounts[pos] = (myPosCounts[pos]||0)+1; }));
  const posNeed = (player: DBPlayer) => player.positions.some(pos => {
    const need = settings.rosterSlots[pos as keyof RosterSlots] || 0;
    return (myPosCounts[pos]||0) < need;
  });

  const currentRound = Math.ceil(currentOverall / settings.numTeams);

  return (
    <div style={{minHeight:'100vh',padding:'1.5rem',maxWidth:1300,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
        <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
          <button onClick={onReset} className="btn btn-secondary" style={{padding:'4px 12px',fontSize:12}}>← 재설정</button>
          <h1 style={{fontSize:18,fontWeight:700}}>🏀 Mock Draft</h1>
          <span style={{fontSize:12,color:'var(--text2)'}}>{settings.numTeams}팀 · {settings.draftType === 'snake' ? '🐍 Snake' : '➡️ Linear'} · {totalRounds}라운드</span>
        </div>
        {isDone && <span style={{background:'rgba(34,197,94,0.2)',color:'var(--green)',padding:'4px 16px',borderRadius:999,fontSize:13,fontWeight:700}}>✅ 드래프트 완료!</span>}
      </div>

      {/* Status bar */}
      <div className="card" style={{marginBottom:'1rem',padding:'0.75rem 1.25rem'}}>
        <div style={{display:'flex',gap:'2rem',alignItems:'center'}}>
          <div><div style={{fontSize:11,color:'var(--text2)'}}>라운드</div><div style={{fontSize:20,fontWeight:700}}>{isDone?totalRounds:currentRound}<span style={{fontSize:12,color:'var(--text2)',fontWeight:400}}>/{totalRounds}</span></div></div>
          <div><div style={{fontSize:11,color:'var(--text2)'}}>전체 픽</div><div style={{fontSize:20,fontWeight:700}}>{isDone?totalPicks:currentOverall}<span style={{fontSize:12,color:'var(--text2)',fontWeight:400}}>/{totalPicks}</span></div></div>
          <div><div style={{fontSize:11,color:'var(--text2)'}}>내 다음 픽</div><div style={{fontSize:20,fontWeight:700,color:picksUntil<=3&&!isDone?'var(--accent)':'var(--text)'}}>{isDone?'-':nextMyPick<0?'완료':`${nextMyPick}번`}</div></div>
          <div><div style={{fontSize:11,color:'var(--text2)'}}>내 픽까지</div><div style={{fontSize:20,fontWeight:700,color:picksUntil<=3&&!isDone?'var(--accent)':'var(--text)'}}>{isDone||isMyTurn?'-':`${picksUntil}픽`}</div></div>
          <div><div style={{fontSize:11,color:'var(--text2)'}}>내 팀</div><div style={{fontSize:20,fontWeight:700}}>{myRoster.length}<span style={{fontSize:12,color:'var(--text2)',fontWeight:400}}>/{totalRounds}</span></div></div>
          {isMyTurn && !isDone && (
            <div style={{marginLeft:'auto',background:'rgba(249,115,22,0.15)',border:'1px solid var(--accent)',color:'var(--accent)',padding:'6px 16px',borderRadius:999,fontSize:13,fontWeight:700,animation:'pulse 1s infinite'}}>
              🔥 내 픽 차례!
            </div>
          )}
          {!isMyTurn && !isDone && (
            <div style={{marginLeft:'auto',fontSize:12,color:'var(--text2)'}}>
              CPU 자동 선택 중...
            </div>
          )}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:'1.5rem'}}>
        {/* Left: Available players */}
        <div>
          <div style={{display:'flex',gap:'0.5rem',marginBottom:'0.75rem',flexWrap:'wrap',alignItems:'center'}}>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="선수 검색..." style={{flex:1,minWidth:140}} />
            {['ALL','PG','SG','G','SF','PF','F','C','UTIL'].map(pos=>(
              <button key={pos} onClick={()=>setPosFilter(pos)} className="btn"
                style={{padding:'5px 10px',fontSize:11,background:posFilter===pos?'var(--accent)':'var(--bg3)',color:posFilter===pos?'white':'var(--text2)',border:`1px solid ${posFilter===pos?'var(--accent)':'var(--border)'}`}}>
                {pos}
              </button>
            ))}
          </div>

          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table>
              <thead>
                <tr>
                  <th style={{width:32,textAlign:'center'}}>#</th>
                  <th>선수</th>
                  <th>포지션</th>
                  <th style={{textAlign:'right'}}>지난시즌 Pt</th>
                  <th style={{textAlign:'right'}}>프로젝션 Pt</th>
                  <th style={{textAlign:'right'}}>PTS</th>
                  <th style={{textAlign:'right'}}>REB</th>
                  <th style={{textAlign:'right'}}>AST</th>
                  <th style={{textAlign:'right',width:90}}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0,60).map((player,i)=>{
                  const actualScore = getFantasyScore(player.stats);
                  const projScore = getProjectedScore(player, settings.scoringWeights as ScoringWeights & Record<string,number>);
                  const needs = posNeed(player);
                  return (
                    <tr key={player.id} style={{opacity:player.status==='out'?0.4:player.status==='injured'?0.7:1}}>
                      <td style={{textAlign:'center',color:'var(--text3)',fontSize:11}}>{i+1}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div>
                            <div style={{fontWeight:500,display:'flex',alignItems:'center',gap:5}}>
                              {player.name}
                              {needs && isMyTurn && <span style={{fontSize:9,color:'var(--accent)',background:'rgba(249,115,22,0.1)',padding:'1px 4px',borderRadius:3}}>필요</span>}
                            </div>
                            <div style={{fontSize:11,color:'var(--text2)'}}>
                              {player.nbaTeam} · {player.age}세
                              {player.status!=='active'&&<span style={{marginLeft:4,color:player.status==='injured'?'var(--yellow)':'var(--red)'}}>({player.injuryNote||player.status})</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{player.positions.map(p=><span key={p} className="pos-badge" style={{marginRight:2}}>{p}</span>)}</td>
                      <td style={{textAlign:'right',color:'var(--text2)',fontSize:12}}>{actualScore.toFixed(1)}</td>
                      <td style={{textAlign:'right',fontWeight:700,color:'var(--accent)'}}>{projScore.toFixed(1)}</td>
                      <td style={{textAlign:'right',fontSize:12,color:'var(--text2)'}}>{player.stats.PTS.toFixed(1)}</td>
                      <td style={{textAlign:'right',fontSize:12,color:'var(--text2)'}}>{player.stats.REB.toFixed(1)}</td>
                      <td style={{textAlign:'right',fontSize:12,color:'var(--text2)'}}>{player.stats.AST.toFixed(1)}</td>
                      <td>
                        {isMyTurn && !isDone ? (
                          <button className="btn btn-primary" style={{padding:'4px 12px',fontSize:11,width:'100%'}}
                            onClick={()=>doPick(player, settings.myPick-1)}>
                            픽 선택
                          </button>
                        ) : (
                          <span style={{fontSize:11,color:'var(--text3)'}}>대기 중</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {/* My Roster */}
          <div className="card">
            <h3 style={{fontWeight:600,fontSize:14,marginBottom:'0.75rem'}}>🙋 내 팀 ({myRoster.length}/{totalRounds})</h3>
            {myRoster.length === 0 ? (
              <div style={{color:'var(--text3)',fontSize:12,textAlign:'center',padding:'1.5rem 0'}}>아직 선택한 선수가 없어요</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                {myRoster.map((p,i)=>{
                  const proj = getProjectedScore(p, settings.scoringWeights as ScoringWeights & Record<string,number>);
                  return (
                    <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',background:'var(--bg3)',borderRadius:6}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:10,color:'var(--text3)',minWidth:16}}>{i+1}R</span>
                        <div>
                          <div style={{fontSize:12,fontWeight:500}}>{p.name}</div>
                          <div style={{fontSize:10,color:'var(--text2)'}}>{p.positions.join('/')} · {p.nbaTeam}</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontWeight:700,fontSize:13,color:'var(--accent)'}}>{proj.toFixed(1)}</div>
                        <div style={{fontSize:10,color:'var(--text3)'}}>proj</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {myRoster.length > 0 && (
              <div style={{marginTop:'0.75rem',paddingTop:'0.75rem',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',fontSize:12}}>
                <span style={{color:'var(--text2)'}}>팀 총 프로젝션</span>
                <strong style={{color:'var(--accent)'}}>{myRoster.reduce((s,p)=>s+getProjectedScore(p,settings.scoringWeights as ScoringWeights & Record<string,number>),0).toFixed(1)} pt/g</strong>
              </div>
            )}

            {/* Position balance */}
            <div style={{marginTop:'0.75rem'}}>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:5}}>포지션 현황</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {(Object.entries(settings.rosterSlots) as [keyof RosterSlots,number][]).filter(([pos])=>pos!=='BN').map(([pos,need])=>{
                  const have = myPosCounts[pos]||0;
                  const ok = have>=need;
                  return <span key={pos} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:ok?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',color:ok?'var(--green)':'var(--red)'}}>{pos} {have}/{need}</span>;
                })}
              </div>
            </div>
          </div>

          {/* Snake order */}
          <div className="card">
            <h3 style={{fontWeight:600,fontSize:13,marginBottom:'0.75rem',color:'var(--text2)'}}>내 픽 순서</h3>
            <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:200,overflowY:'auto'}}>
              {myPickNumbers.map(n=>{
                const round = Math.ceil(n/settings.numTeams);
                const done = n < currentOverall;
                const isCurrent = n === currentOverall;
                const log = draftLog.find(l=>l.overall===n);
                return (
                  <div key={n} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 6px',borderRadius:4,background:isCurrent?'rgba(249,115,22,0.1)':'transparent',opacity:done?0.5:1}}>
                    <span style={{fontSize:11,color:'var(--text2)'}}>{round}R · {n}번픽</span>
                    <span style={{fontSize:11,color:isCurrent?'var(--accent)':'var(--text3)',fontWeight:isCurrent?700:400}}>
                      {done&&log?log.player.name:isCurrent?'← 지금':'대기'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent picks */}
          {draftLog.length > 0 && (
            <div className="card">
              <h3 style={{fontWeight:600,fontSize:13,marginBottom:'0.75rem',color:'var(--text2)'}}>최근 픽</h3>
              <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:180,overflowY:'auto'}}>
                {[...draftLog].reverse().slice(0,10).map(log=>(
                  <div key={log.overall} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,padding:'3px 0',borderBottom:'1px solid var(--border)'}}>
                    <span style={{color:'var(--text3)'}}>{log.overall}번 팀{log.teamIdx+1}{log.teamIdx===settings.myPick-1?<span style={{color:'var(--accent)'}}> (나)</span>:''}</span>
                    <span style={{fontWeight:log.teamIdx===settings.myPick-1?600:400,color:log.teamIdx===settings.myPick-1?'var(--text)':'var(--text2)'}}>{log.player.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Done summary */}
      {isDone && (
        <div className="card" style={{marginTop:'1.5rem',border:'1px solid var(--green)'}}>
          <h2 style={{fontWeight:700,fontSize:16,marginBottom:'1rem',color:'var(--green)'}}>✅ 드래프트 완료! 내 팀 최종 결과</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'0.75rem'}}>
            {myRoster.map((p,i)=>(
              <div key={p.id} style={{background:'var(--bg3)',padding:'0.75rem',borderRadius:8}}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:3}}>{i+1}라운드</div>
                <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                <div style={{fontSize:11,color:'var(--text2)'}}>{p.positions.join('/')} · {p.nbaTeam}</div>
                <div style={{marginTop:4,fontWeight:700,color:'var(--accent)'}}>{getProjectedScore(p, settings.scoringWeights as ScoringWeights & Record<string,number>).toFixed(1)} proj pt</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:'1rem',display:'flex',gap:'2rem',paddingTop:'1rem',borderTop:'1px solid var(--border)'}}>
            <div><div style={{fontSize:12,color:'var(--text2)'}}>팀 총 프로젝션 (per game)</div><div style={{fontSize:24,fontWeight:700,color:'var(--accent)'}}>{myRoster.reduce((s,p)=>s+getProjectedScore(p,settings.scoringWeights as ScoringWeights & Record<string,number>),0).toFixed(1)} pt</div></div>
            <div style={{marginLeft:'auto',display:'flex',gap:'0.75rem'}}>
              <button className="btn btn-secondary" onClick={onReset}>새로 시작</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function MockDraftPage() {
  const [settings, setSettings] = useState<DraftSettings|null>(null);
  if (!settings) return <SetupScreen onStart={setSettings} />;
  return <DraftRoom settings={settings} onReset={()=>setSettings(null)} />;
}
