import React, { useState, useEffect } from 'react';
import { ref, set, push, onValue } from 'firebase/database';
import { rtdb } from '../firebase';

export default function StudentPlay() {
  const [isJoined, setIsJoined] = useState(false);
  const [sessionCode, setSessionCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  
  const [status, setStatus] = useState('waiting');
  const [currentQ, setCurrentQ] = useState(1);
  const [questions, setQuestions] = useState([]);
  
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [myAnswer, setMyAnswer] = useState(null);
  const [shortAnswerText, setShortAnswerText] = useState('');
  
  const [isRevealed, setIsRevealed] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [isAlive, setIsAlive] = useState(true);

  const [useTimer, setUseTimer] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [timeRatio, setTimeRatio] = useState(100);

  useEffect(() => {
    if (!isJoined) return;
    const stateRef = ref(rtdb, `sessions/${sessionCode}/state`);
    const unsub = onValue(stateRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setStatus(data.status || 'waiting');
        if (data.currentQuestion !== currentQ) {
          setCurrentQ(data.currentQuestion);
          setHasSubmitted(false);
          setMyAnswer(null);
          setShortAnswerText('');
        }
        setIsRevealed(data.isRevealed || false);
        setCorrectAnswer(data.correctAnswer || null);
        setUseTimer(data.useTimer || false);
        setTimerSec(data.timerSec || 0);
        setStartedAt(data.startedAt || null);
      }
    });
    return () => unsub();
  }, [isJoined, sessionCode, currentQ]);

  useEffect(() => {
    if (!isJoined) return;
    const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
    const unsub = onValue(qRef, (snap) => {
      if (snap.exists()) setQuestions(Object.values(snap.val()));
    });
    return () => unsub();
  }, [isJoined, sessionCode]);

  useEffect(() => {
    if (!isJoined || !studentId) return;
    const meRef = ref(rtdb, `sessions/${sessionCode}/participants/${studentId}/isAlive`);
    const unsub = onValue(meRef, (snap) => {
      if (snap.exists()) setIsAlive(snap.val() !== false);
      else setIsAlive(true);
    });
    return () => unsub();
  }, [isJoined, sessionCode, studentId]);

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

  const handleJoin = async () => {
    if (!sessionCode.trim() || !studentName.trim()) return alert("모두 입력해주세요!");
    try {
      const participantsRef = ref(rtdb, `sessions/${sessionCode}/participants`);
      const newParticipantRef = push(participantsRef);
      await set(newParticipantRef, { 
        name: studentName, 
        joinedAt: Date.now(),
        isAlive: true 
      });
      setStudentId(newParticipantRef.key);
      setIsJoined(true);
    } catch (error) {
      alert("입장에 실패했습니다. 코드를 확인해주세요.");
    }
  };

  const submitAnswer = async (answerValue) => {
    if (hasSubmitted || !isAlive || status !== 'playing') return;
    if (currentQuestionData?.type === '주관식' && !String(answerValue).trim()) {
      return alert("정답을 입력해주세요!");
    }
    
    setMyAnswer(answerValue);
    setHasSubmitted(true);

    const answerRef = ref(rtdb, `sessions/${sessionCode}/answers/q${currentQ}/${studentId}`);
    await set(answerRef, {
      name: studentName,
      answer: answerValue,
      timestamp: Date.now()
    });
  };

  const currentQuestionData = questions.find(q => q.id === currentQ) || {};

  // 범용적으로 수정된 접속(로그인) 뷰
  if (!isJoined) {
    return (
      <div className="w-full h-[100dvh] bg-indigo-600 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white w-full max-w-md rounded-3xl p-8 flex flex-col gap-6 shadow-2xl">
          <div className="text-center">
            <div className="text-5xl mb-3">📱</div>
            <h1 className="text-3xl font-black text-slate-800 mb-2">실시간 퀴즈 참여</h1>
            <p className="text-slate-500 font-bold text-sm">입장 코드와 이름을 입력하세요</p>
          </div>
          <div className="space-y-4">
            <input type="text" inputMode="text" value={sessionCode} onChange={(e) => setSessionCode(e.target.value)} placeholder="선생님이 알려준 입장 코드" className="w-full p-4 bg-slate-100 border-2 border-slate-200 rounded-xl text-xl font-bold text-center focus:border-indigo-500 focus:outline-none" />
            <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="학년 반 번호 이름" className="w-full p-4 bg-slate-100 border-2 border-slate-200 rounded-xl text-xl font-bold text-center focus:border-indigo-500 focus:outline-none" />
          </div>
          <button onClick={handleJoin} className="w-full bg-indigo-600 active:bg-indigo-800 text-white font-black text-2xl py-5 rounded-2xl shadow-md transition-colors">참여하기</button>
        </div>
      </div>
    );
  }

  // 범용적으로 수정된 퀴즈 종료 뷰
  if (status === 'ended') {
    return (
      <div className="w-full h-[100dvh] bg-indigo-900 flex flex-col items-center justify-center p-6 font-sans text-indigo-50 text-center">
        <div className="text-8xl mb-6">🎉</div>
        <h1 className="text-5xl font-black mb-4">모든 퀴즈 종료!</h1>
        <p className="text-2xl font-bold text-indigo-300 break-keep">참여해 주셔서 감사합니다.<br/>앞쪽 칠판에서 결과를 확인하세요.</p>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="w-full h-[100dvh] bg-indigo-50 flex flex-col items-center justify-center p-6 font-sans text-indigo-900 text-center">
        <div className="text-6xl mb-6 animate-bounce">⏳</div>
        <h1 className="text-4xl font-black mb-4">대기 중...</h1>
        <p className="text-xl font-bold text-indigo-500 break-keep">선생님이 퀴즈를 시작할 때까지 잠시만 기다려주세요!</p>
      </div>
    );
  }

  if (isRevealed && hasSubmitted) {
    let isCorrect = false;
    if (currentQuestionData.type === '주관식') {
      const validAnswers = String(correctAnswer || '').split(',').map(a => a.trim().toLowerCase());
      const studentText = String(myAnswer || '').trim().toLowerCase();
      isCorrect = validAnswers.includes(studentText);
    } else {
      isCorrect = Number(myAnswer) === Number(correctAnswer);
    }

    return (
      <div className={`w-full h-[100dvh] flex flex-col items-center justify-center p-6 font-sans text-white transition-colors duration-500 ${isCorrect ? 'bg-emerald-500' : 'bg-red-500'}`}>
        <div className="text-9xl mb-8">{isCorrect ? '⭕' : '❌'}</div>
        <h1 className="text-6xl font-black mb-4">{isCorrect ? '정답!' : '탈락!'}</h1>
        <p className="text-2xl font-bold opacity-80">선생님이 다음 문제를 준비 중입니다.</p>
      </div>
    );
  }

  if (!isAlive && !isRevealed) {
    return (
      <div className="w-full h-[100dvh] bg-slate-800 flex flex-col items-center justify-center p-6 font-sans text-slate-300">
        <div className="text-6xl mb-6 opacity-50">👀</div>
        <h1 className="text-4xl font-black text-white mb-2">관전 모드</h1>
        <p className="text-lg font-bold text-center">아쉽게도 탈락했습니다.<br/>생존한 친구들을 응원해주세요!</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[100dvh] bg-slate-100 flex flex-col overflow-hidden font-sans">
      <div className="w-full h-3 bg-slate-200 shrink-0">
        <div
          className="h-full bg-gradient-to-l from-blue-500 via-emerald-500 to-red-500"
          style={{ width: `${timeRatio}%`, transition: useTimer ? 'none' : 'width 0.5s' }}
        ></div>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden">
        <div className="bg-white rounded-2xl p-4 flex justify-between items-center border border-slate-200 shadow-sm shrink-0">
          <span className="font-black text-slate-800">{studentName}</span>
          <span className="font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">현재 {currentQ}번 문제</span>
        </div>

        <div className="flex-1 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-4 justify-center shadow-sm overflow-y-auto">
          {hasSubmitted ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-4">👍</div>
              <h2 className="text-2xl font-black text-slate-800">제출 완료!</h2>
              <p className="text-slate-500 font-bold mt-2">앞쪽 칠판을 보고 결과를 기다려주세요.</p>
            </div>
          ) : currentQuestionData.type === '주관식' ? (
            <div className="flex-1 flex flex-col justify-center gap-4">
              <p className="text-center font-bold text-slate-500 mb-2">정답을 입력하세요</p>
              <input 
                type="text" 
                value={shortAnswerText}
                onChange={(e) => setShortAnswerText(e.target.value)}
                placeholder="단어 또는 문장 입력" 
                className="w-full flex-1 min-h-[120px] border-4 border-slate-200 rounded-2xl p-6 text-3xl font-black text-center text-slate-800 focus:outline-none focus:border-indigo-500"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
              <button 
                onClick={() => submitAnswer(shortAnswerText)}
                className="w-full py-6 bg-indigo-600 active:bg-indigo-800 text-white text-3xl font-black rounded-2xl shadow-lg mt-2 transition-colors"
              >
                제출하기
              </button>
            </div>
          ) : (
            <>
              <p className="text-center font-bold text-slate-500 mb-2">정답을 선택하세요</p>
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => submitAnswer(num)}
                  className="flex-1 w-full text-4xl font-black text-slate-700 bg-slate-50 border-4 border-slate-200 rounded-2xl active:bg-indigo-600 active:text-white transition-colors"
                >
                  {num}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}