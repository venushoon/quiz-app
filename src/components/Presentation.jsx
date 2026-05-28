import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../firebase';
import { QRCodeCanvas } from 'qrcode.react';

export default function Presentation() {
  const [sessionCode] = useState('840219');
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

  const joinUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/play`;

  useEffect(() => {
    const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
    const unsubQ = onValue(qRef, (snap) => {
      if (snap.exists()) setQuestions(Object.values(snap.val()).sort((a, b) => a.id - b.id));
      else setQuestions([]);
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
      if (snap.exists()) setParticipantsData(snap.val());
      else setParticipantsData({});
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

  useEffect(() => {
    if (!useTimer || isRevealed || !startedAt || status !== 'playing') {
      setTimeRatio(isRevealed ? 0 : 100);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      let ratio = 100 - (elapsed / (timerSec * 1000)) * 100;
      if (ratio <= 0) {
        ratio = 0;
        clearInterval(interval);
      }
      setTimeRatio(ratio);
    }, 50);
    return () => clearInterval(interval);
  }, [useTimer, isRevealed, startedAt, timerSec, status]);

  const totalList = Object.entries(participantsData).map(([id, data]) => ({ id, ...data }));
  const participantsCount = totalList.length;
  const survivorsList = totalList.filter(p => p.isAlive !== false);
  const survivorsCount = survivorsList.length;

  // 프레젠테이션용 통계 변수 계산
  const optionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const subjectiveDistribution = {};
  
  totalList.forEach(student => {
    const ans = answersData[student.id]?.answer;
    if (ans !== undefined) {
      optionCounts[ans] = (optionCounts[ans] || 0) + 1;
      const textAns = String(ans).trim();
      if(textAns) subjectiveDistribution[textAns] = (subjectiveDistribution[textAns] || 0) + 1;
    }
  });

  if (status === 'waiting') {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>
        <h1 className="text-6xl font-black mb-12 animate-pulse text-indigo-300">곧 퀴즈가 시작됩니다!</h1>
        <div className="bg-white p-6 rounded-3xl shadow-2xl mb-12">
          <QRCodeCanvas value={joinUrl} size={300} />
        </div>
        <p className="text-3xl font-bold text-slate-300 mb-4">스마트폰 카메라로 스캔하거나 코드를 입력하세요</p>
        <div className="text-8xl font-black tracking-widest text-white bg-slate-800 px-12 py-4 rounded-3xl border-4 border-slate-700 shadow-inner">
          {sessionCode}
        </div>
        <div className="absolute bottom-10 right-10 bg-indigo-600 px-6 py-3 rounded-2xl">
          <span className="text-2xl font-bold text-indigo-100">현재 접속자 : </span>
          <span className="text-4xl font-black text-white ml-2">{participantsCount}명</span>
        </div>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
        <div className="text-9xl mb-8">🏆</div>
        <h1 className="text-5xl font-bold mb-6 text-amber-400">모든 퀴즈가 종료되었습니다.</h1>
        <h2 className="text-8xl font-black text-white mb-16 tracking-tight">최종 생존자: {survivorsCount}명</h2>
        <div className="bg-slate-800 border-4 border-slate-700 p-8 rounded-3xl max-w-5xl w-full text-center shadow-2xl">
          <div className="flex flex-wrap justify-center gap-4 max-h-72 overflow-y-auto p-4">
            {survivorsList.length > 0 ? survivorsList.map(s => (
              <span key={s.id} className="bg-slate-700 px-8 py-4 rounded-xl text-3xl font-bold border border-slate-600 shadow-sm text-white">
                {s.name}
              </span>
            )) : <span className="text-3xl text-slate-500">생존자가 없습니다.</span>}
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="w-full h-screen bg-slate-900 text-white flex items-center justify-center font-sans">
        <h1 className="text-4xl font-bold text-slate-500 animate-pulse">문제를 불러오는 중입니다...</h1>
      </div>
    );
  }

  const currentQuestionData = questions.find(q => q.id === currentQ) || questions[0];
  const isSubjective = currentQuestionData.type === '주관식';
  const displaySubjectiveAnswer = isSubjective && correctAnswer ? String(correctAnswer).split(',')[0].trim() : '';

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col overflow-hidden font-sans">
      <div className="w-full h-6 bg-slate-800 shrink-0">
         <div
          className="h-full bg-gradient-to-l from-blue-500 via-emerald-500 to-red-500"
          style={{ width: `${timeRatio}%`, transition: useTimer ? 'none' : 'width 0.5s' }}
        ></div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-10 text-center relative">
        <span className={`text-2xl font-black mb-6 px-4 py-1 rounded-full uppercase tracking-widest ${isSubjective ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
          {isSubjective ? '주관식 서술형' : '객관식 선택형'} Q{currentQ}
        </span>
        
        <h1 className="text-6xl md:text-8xl font-extrabold leading-tight mb-16 text-white break-keep max-w-7xl">
          {currentQuestionData.text}
        </h1>

        {isSubjective ? (
          <div className="w-full max-w-5xl flex flex-col items-center gap-6">
            {isRevealed ? (
              <>
                <div className="bg-emerald-600 border-8 border-emerald-400 rounded-3xl p-10 shadow-2xl animate-bounce">
                  <span className="text-3xl text-emerald-200 block mb-1">정답은</span>
                  <span className="text-7xl font-black text-white">{displaySubjectiveAnswer}</span>
                </div>
                {/* 주관식 답변 분포 Top 3 시각화 */}
                <div className="flex gap-4 mt-6 w-full justify-center">
                  {Object.entries(subjectiveDistribution).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([text, count]) => (
                    <div key={text} className="bg-slate-800 border-2 border-slate-700 px-6 py-3 rounded-2xl text-xl font-bold text-slate-300">
                      "{text}" : <span className="text-indigo-400 font-black ml-2">{count}명</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-4xl font-bold text-slate-600 animate-pulse py-20">
                학생 기기에 정답을 입력해주세요 ✍️
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
            {currentQuestionData.options?.map((opt, idx) => {
              if (!opt) return null;
              const optionNum = idx + 1;
              const isCorrectOption = isRevealed && optionNum === correctAnswer;
              const isWrongOption = isRevealed && optionNum !== correctAnswer;
              
              const totalVotes = submitted || 1;
              const votePct = ((optionCounts[optionNum] || 0) / totalVotes * 100).toFixed(0);

              return (
                <div 
                  key={idx} 
                  className={`border-4 rounded-3xl p-8 text-5xl font-bold flex justify-between items-center shadow-lg transition-all duration-500 relative overflow-hidden
                    ${isCorrectOption ? 'bg-emerald-600 border-emerald-400 text-white scale-105' : 
                      isWrongOption ? 'bg-slate-800/30 border-slate-800 text-slate-600' : 
                      'bg-slate-800 border-slate-700 text-slate-100'}
                  `}
                >
                  {/* 정답 공개 시 보기에 부드럽게 나타나는 득표율 배경 그래프 투명막대 */}
                  {isRevealed && (
                    <div 
                      className={`absolute top-0 left-0 h-full opacity-20 transition-all duration-1000 ${isCorrectOption ? 'bg-emerald-300' : 'bg-slate-500'}`}
                      style={{ width: `${votePct}%` }}
                    ></div>
                  )}

                  <div className="flex items-center z-10">
                    <span className={`mr-8 text-6xl ${isCorrectOption ? 'text-white' : isWrongOption ? 'text-slate-600' : 'text-indigo-400'}`}>
                      {optionNum}
                    </span> 
                    <span>{opt}</span>
                  </div>

                  {/* 투표율 숫자 표출 */}
                  {isRevealed && (
                    <span className="text-3xl font-black z-10 text-right opacity-90">
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
          <div className="bg-white p-3 rounded-xl shadow-lg">
            <QRCodeCanvas value={joinUrl} size={100} />
          </div>
          <div className="text-2xl text-slate-400 text-left">
            스마트폰 카메라로 스캔하거나 <br/>
            직접 접속 코드를 입력하세요 👉
            <span className="text-6xl font-black text-white mt-1 ml-4 inline-block tracking-widest">{sessionCode}</span>
          </div>
        </div>
        <div className="text-right text-2xl text-slate-400">
          답안 제출 현황 <br/>
          <span className="text-6xl font-black text-emerald-400 mt-3 inline-block">{submitted} / {participantsCount}</span>
        </div>
      </div>
    </div>
  );
}