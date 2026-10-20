import { useState, useEffect, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
import { useSearchParams } from 'react-router-dom'; // 💡 라우터 훅
import { rtdb } from '../firebase';
import { QRCodeCanvas } from 'qrcode.react';

export default function Presentation() {
  const [searchParams] = useSearchParams();
  const sessionCode = searchParams.get('code') || '840219'; // 💡 URL의 파라미터 가져오기
  
  const [currentQ, setCurrentQ] = useState(1);
  const [status, setStatus] = useState('waiting');
  const [participantsData, setParticipantsData] = useState({});
  const [answersData, setAnswersData] = useState({});
  const [submitted, setSubmitted] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [useTimer, setUseTimer] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [timeRatio, setTimeRatio] = useState(100);

  const serverTimeOffsetRef = useRef(0);
  const joinUrl = `${window.location.origin}${window.location.pathname}#/play?code=${encodeURIComponent(sessionCode)}`;

  useEffect(() => {
    const offsetRef = ref(rtdb, '.info/serverTimeOffset');
    const unsubOffset = onValue(offsetRef, (snap) => {
      serverTimeOffsetRef.current = snap.val() || 0;
    });
    return () => unsubOffset();
  }, []);

  useEffect(() => {
    const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
    const unsubQ = onValue(qRef, (snap) => { 
      if (snap.exists()) {
        setQuestions(Object.values(snap.val()).sort((a, b) => a.id - b.id)); 
      } else {
        setQuestions([]); 
      }
    });
    return () => unsubQ();
  }, [sessionCode]);

  useEffect(() => {
    const stateRef = ref(rtdb, `sessions/${sessionCode}/state`);
    const unsubState = onValue(stateRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setCurrentQ(data.currentQuestion || 1);
        setStatus(data.status || 'waiting');
        setIsRevealed(data.isRevealed || false);
        setCorrectAnswer(data.correctAnswer || null);
        setUseTimer(data.useTimer || false);
        setTimerSec(data.timerSec || 0);
        setStartedAt(data.startedAt || null);
      }
    });
    const partRef = ref(rtdb, `sessions/${sessionCode}/participants`);
    const unsubPart = onValue(partRef, (snap) => { 
      if (snap.exists()) {
        setParticipantsData(snap.val()); 
      } else {
        setParticipantsData({}); 
      }
    });
    return () => { unsubState(); unsubPart(); };
  }, [sessionCode]);

  useEffect(() => {
    const ansRef = ref(rtdb, `sessions/${sessionCode}/answers/q${currentQ}`);
    const unsubAns = onValue(ansRef, (snap) => { 
      if (snap.exists()) { 
        setAnswersData(snap.val()); 
        setSubmitted(Object.keys(snap.val()).length); 
      } else { 
        setAnswersData({}); 
        setSubmitted(0); 
      } 
    });
    return () => unsubAns();
  }, [sessionCode, currentQ]);

  const isTimerRunning = useTimer && !isRevealed && Boolean(startedAt) && status === 'playing' && timerSec > 0;

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      const nowServer = Date.now() + serverTimeOffsetRef.current;
      const elapsed = Math.max(0, nowServer - startedAt);
      let ratio = 100 - (elapsed / (timerSec * 1000)) * 100;
      if (ratio <= 0) { 
        ratio = 0; 
        clearInterval(interval); 
      }
      setTimeRatio(ratio);
    }, 50);
    return () => clearInterval(interval);
  }, [isTimerRunning, startedAt, timerSec]);

  const displayTimeRatio = isTimerRunning ? timeRatio : (isRevealed ? 0 : 100);

  const totalList = Object.entries(participantsData).map(([id, data]) => ({ id, ...data }));
  const participantsCount = totalList.length;
  const survivorsList = totalList.filter(p => p.isAlive !== false);
  const survivorsCount = survivorsList.length;
  
  const optionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const subjectiveDistribution = {};
  let validSubmittedCount = 0;
  
  totalList.forEach(student => {
    const ans = answersData[student.id]?.answer;
    if (ans !== undefined) { 
      validSubmittedCount++;
      optionCounts[ans] = (optionCounts[ans] || 0) + 1; 
      const textAns = String(ans).trim(); 
      if(textAns) {
        subjectiveDistribution[textAns] = (subjectiveDistribution[textAns] || 0) + 1; 
      }
    }
  });

  if (status === 'waiting') {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <h1 className="text-6xl font-black mb-12 animate-pulse text-indigo-300">곧 퀴즈가 시작됩니다!</h1>
        <div className="bg-white p-6 rounded-3xl mb-12">
          <QRCodeCanvas value={joinUrl} size={300} />
        </div>
        <p className="text-3xl font-bold text-slate-300 mb-4">입장 코드를 입력하세요</p>
        <div className="text-8xl font-black tracking-widest bg-slate-800 px-12 py-4 rounded-3xl border-4 border-slate-700">
          {sessionCode}
        </div>
        <div className="absolute bottom-10 right-10 bg-indigo-600 px-6 py-3 rounded-2xl text-2xl font-bold">
          접속자: {participantsCount}명
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans">
        <div className="text-9xl mb-8">🏆</div>
        <h1 className="text-5xl font-bold mb-6 text-amber-400">퀴즈가 종료되었습니다.</h1>
        <h2 className="text-8xl font-black mb-16">최종 생존자: {survivorsCount}명</h2>
        <div className="bg-slate-800 border-4 border-slate-700 p-8 rounded-3xl max-w-5xl flex flex-wrap justify-center gap-4 max-h-72 overflow-y-auto">
          {survivorsList.map(s => (
            <span key={s.id} className="bg-slate-700 px-8 py-4 rounded-xl text-3xl font-bold text-white border border-slate-600 shadow-sm">
              {s.name}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex items-center justify-center text-4xl font-bold animate-pulse">
        문제를 불러오는 중...
      </div>
    );
  }

  const q = questions.find(q => q.id === currentQ) || questions[currentQ - 1] || questions[0];
  const isSubjective = q.type === '주관식';
  const displaySubjectiveAnswer = isSubjective && correctAnswer ? String(correctAnswer).split(',')[0].trim() : '';
  const totalVotes = validSubmittedCount || submitted;

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col overflow-hidden font-sans">
      
      {/* 타이머 바 */}
      <div className="w-full h-6 bg-slate-800 shrink-0">
        <div 
          className="h-full bg-gradient-to-l from-blue-500 via-emerald-500 to-red-500" 
          style={{ width: `${displayTimeRatio}%`, transition: useTimer ? 'none' : 'width 0.5s' }}
        ></div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-10 text-center relative">
        <span className={`text-2xl font-black mb-4 px-4 py-1 rounded-full uppercase tracking-widest ${isSubjective ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
          Q{currentQ}. {isSubjective ? '주관식 서술형' : '객관식 선택형'}
        </span>
        
        {/* 💡 텍스트와 이미지 레이아웃 결합 */}
        <div className="max-w-7xl flex flex-col items-center gap-8 mb-10">
          <h1 className={`font-extrabold leading-tight break-keep ${q.image ? 'text-5xl md:text-6xl' : 'text-7xl md:text-8xl'}`}>
            {q.text}
          </h1>
          {q.image && (
            <img 
              src={q.image} 
              className="max-h-[35vh] rounded-3xl border-8 border-slate-700 shadow-2xl object-contain bg-white/5" 
              alt="문제 이미지" 
            />
          )}
        </div>

        {isSubjective ? (
          <div className="w-full max-w-5xl flex flex-col items-center gap-6">
            {isRevealed ? (
              <>
                <div className="bg-emerald-600 border-8 border-emerald-400 rounded-3xl p-10 shadow-2xl animate-bounce">
                  <span className="text-3xl text-emerald-200 block mb-1">정답은</span>
                  <span className="text-7xl font-black text-white">{displaySubjectiveAnswer}</span>
                </div>
                <div className="flex gap-4 mt-6">
                  {Object.entries(subjectiveDistribution).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([text, count]) => (
                    <div key={text} className="bg-slate-800 border-2 border-slate-700 px-6 py-3 rounded-2xl text-xl font-bold text-slate-300 shadow-md">
                      "{text}" : <span className="text-indigo-400 font-black ml-2">{count}명</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-4xl font-bold text-slate-600 animate-pulse py-10">
                정답을 입력해주세요 ✍️
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-6xl">
            {q.options?.map((opt, idx) => {
              if (!opt) return null; 
              const optionNum = idx + 1; 
              const isCorrect = isRevealed && Number(optionNum) === Number(correctAnswer); 
              const isWrong = isRevealed && Number(optionNum) !== Number(correctAnswer);
              const votePct = totalVotes > 0 ? ((optionCounts[optionNum] || 0) / totalVotes * 100).toFixed(0) : 0;
              
              return (
                <div 
                  key={idx} 
                  className={`border-4 rounded-3xl p-6 text-4xl font-bold flex justify-between items-center relative overflow-hidden transition-all duration-500 shadow-xl ${isCorrect ? 'bg-emerald-600 border-emerald-400 scale-105' : isWrong ? 'bg-slate-800/30 border-slate-800 text-slate-600' : 'bg-slate-800 border-slate-700'}`}
                >
                  {isRevealed && (
                    <div 
                      className={`absolute top-0 left-0 h-full opacity-20 transition-all duration-1000 ${isCorrect ? 'bg-emerald-300' : 'bg-slate-500'}`} 
                      style={{ width: `${votePct}%` }}
                    ></div>
                  )}
                  <div className="flex items-center z-10">
                    <span className={`mr-6 text-5xl ${isCorrect ? 'text-white' : isWrong ? 'text-slate-600' : 'text-indigo-400'}`}>
                      {optionNum}
                    </span>
                    <span>{opt}</span>
                  </div>
                  {isRevealed && (
                    <span className="text-2xl font-black z-10 opacity-90 text-right">
                      {optionCounts[optionNum] || 0}명 ({votePct}%)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-8 flex justify-between items-center shrink-0 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-6">
          <div className="bg-white p-2 rounded-xl shadow-lg">
            <QRCodeCanvas value={joinUrl} size={80} />
          </div>
          <div className="text-xl text-slate-400">
            카메라 스캔 또는 코드 입력 👉 
            <span className="text-5xl font-black text-white ml-3 tracking-widest">{sessionCode}</span>
          </div>
        </div>
        <div className="text-right text-xl text-slate-400">
          답안 제출 현황 <br/>
          <span className="text-5xl font-black text-emerald-400 mt-2 inline-block">
            {submitted} / {participantsCount}
          </span>
        </div>
      </div>
    </div>
  );
}