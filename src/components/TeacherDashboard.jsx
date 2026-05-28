import React, { useState, useEffect } from 'react';
import { ref, onValue, update, get, set, remove, push } from 'firebase/database';
import { rtdb } from '../firebase';

export default function TeacherDashboard() {
  const [sessionCode, setSessionCode] = useState('840219');
  const [isSurvivalMode, setIsSurvivalMode] = useState(false);
  const [showDeviceQuestion, setShowDeviceQuestion] = useState(false);
  const [isQuizStarted, setIsQuizStarted] = useState(false);
  const [isQuizEnded, setIsQuizEnded] = useState(false); 
  const [timerSec, setTimerSec] = useState(0); 

  const [participantsData, setParticipantsData] = useState({});
  const [answersData, setAnswersData] = useState({});

  const [currentQ, setCurrentQ] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [isRevealedLocal, setIsRevealedLocal] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [qType, setQType] = useState('객관식');
  const [newQText, setNewQText] = useState('');
  const [newQOpts, setNewQOpts] = useState(['', '', '', '']);
  const [newQAns, setNewQAns] = useState(1);
  const [newQShortAns, setNewQShortAns] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState('all'); 
  
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [quizSets, setQuizSets] = useState({}); 
  const [newSetName, setNewSetName] = useState(''); 

  const changeSessionCode = () => {
    const newCode = prompt("새로운 방 코드(숫자 또는 영문)를 입력하세요.", sessionCode);
    if (newCode && newCode.trim().length > 0) {
      setSessionCode(newCode.trim());
      setIsQuizStarted(false);
      setIsQuizEnded(false);
      setCurrentQ(1);
    }
  };

  useEffect(() => {
    const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
    const unsubQ = onValue(qRef, (snapshot) => {
      if (snapshot.exists()) setQuestions(Object.values(snapshot.val()).sort((a, b) => a.id - b.id));
      else setQuestions([]);
    });
    return () => unsubQ();
  }, [sessionCode]);

  useEffect(() => {
    const libraryRef = ref(rtdb, 'quizLibrary');
    const unsubLibrary = onValue(libraryRef, (snapshot) => {
      if (snapshot.exists()) setQuizSets(snapshot.val());
      else setQuizSets({});
    });
    return () => unsubLibrary();
  }, []);

  useEffect(() => {
    let currentStatus = 'waiting';
    if (isQuizEnded) currentStatus = 'ended';
    else if (isQuizStarted) currentStatus = 'playing';

    const sessionStateRef = ref(rtdb, `sessions/${sessionCode}/state`);
    update(sessionStateRef, {
      currentQuestion: currentQ,
      status: currentStatus,
      showDeviceQuestion: showDeviceQuestion,
      isRevealed: isRevealedLocal,
      correctAnswer: isRevealedLocal ? questions[currentQ - 1]?.answer : null,
      useTimer: timerSec > 0,
      timerSec: timerSec,
      startedAt: questionStartTime
    });

    const participantsRef = ref(rtdb, `sessions/${sessionCode}/participants`);
    const unsubParticipants = onValue(participantsRef, (snapshot) => {
      if (snapshot.exists()) setParticipantsData(snapshot.val());
      else setParticipantsData({});
    });
    return () => unsubParticipants();
  }, [sessionCode, currentQ, showDeviceQuestion, isRevealedLocal, timerSec, questionStartTime, questions, isQuizStarted, isQuizEnded]);

  useEffect(() => {
    const answersRef = ref(rtdb, `sessions/${sessionCode}/answers/q${currentQ}`);
    const unsubAnswers = onValue(answersRef, (snapshot) => {
      if (snapshot.exists()) setAnswersData(snapshot.val());
      else setAnswersData({});
    });
    return () => unsubAnswers();
  }, [sessionCode, currentQ]);

  useEffect(() => {
    if (timerSec > 0 && !isRevealedLocal && isQuizStarted && !isQuizEnded) {
      const timerId = setTimeout(() => handleRevealAnswer(), timerSec * 1000);
      return () => clearTimeout(timerId);
    }
  }, [timerSec, isRevealedLocal, currentQ, questionStartTime, isQuizStarted, isQuizEnded]);

  const totalList = Object.entries(participantsData).map(([id, data]) => ({ id, ...data }));
  const participantsCount = totalList.length;
  const survivorsList = totalList.filter(p => p.isAlive !== false);
  const survivorsCount = survivorsList.length;
  const submittedList = totalList.filter(p => answersData[p.id]);
  const pendingList = totalList.filter(p => !answersData[p.id]);

  const openPresentation = () => window.open('/host/present', '_blank', 'width=1280,height=720');
  
  const handleNextQuestion = () => { 
    if (currentQ < questions.length) {
      setCurrentQ(prev => prev + 1);
      setIsRevealedLocal(false);
      setQuestionStartTime(Date.now());
    } 
  };
  
  const handlePrevQuestion = () => { 
    if (currentQ > 1) {
      setCurrentQ(prev => prev - 1);
      setIsRevealedLocal(false);
      setQuestionStartTime(Date.now());
    } 
  };

  const handleRevealAnswer = async () => {
    if (questions.length === 0 || isRevealedLocal) return;
    const currentQuestionData = questions[currentQ - 1];
    
    setIsRevealedLocal(true);

    if (isSurvivalMode) {
      const answersSnap = await get(ref(rtdb, `sessions/${sessionCode}/answers/q${currentQ}`));
      const partsSnap = await get(ref(rtdb, `sessions/${sessionCode}/participants`));

      if (partsSnap.exists()) {
        const answers = answersSnap.exists() ? answersSnap.val() : {};
        const updates = {};

        partsSnap.forEach((childSnap) => {
          const studentId = childSnap.key;
          const studentData = childSnap.val();
          if (studentData.isAlive === false) return; 

          const studentAnswer = answers[studentId]?.answer;
          let isCorrect = false;

          if (currentQuestionData.type === '객관식') {
            isCorrect = Number(studentAnswer) === Number(currentQuestionData.answer);
          } else if (currentQuestionData.type === '주관식') {
            const validAnswers = String(currentQuestionData.answer).split(',').map(a => a.trim().toLowerCase());
            const studentText = String(studentAnswer || '').trim().toLowerCase();
            isCorrect = validAnswers.includes(studentText);
          }
          if (!isCorrect) updates[`${studentId}/isAlive`] = false;
        });
        if (Object.keys(updates).length > 0) await update(ref(rtdb, `sessions/${sessionCode}/participants`), updates);
      }
    }
  };

  const handleSaveQuestion = async () => {
    if (!newQText.trim()) return alert("질문을 입력해주세요.");
    const targetId = editingId || (questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1);
    const newQuestion = {
      id: targetId, type: qType, text: newQText,
      options: qType === '객관식' ? newQOpts : null,
      answer: qType === '객관식' ? newQAns : newQShortAns
    };
    await set(ref(rtdb, `sessions/${sessionCode}/questions/${targetId}`), newQuestion);
    setNewQText(''); setNewQOpts(['', '', '', '']); setNewQAns(1); setNewQShortAns('');
    setEditingId(null); setShowAddForm(false);
  };

  const handleDeleteQuestion = async (id) => {
    if(window.confirm(`${id}번 문항을 정말 삭제하시겠습니까?`)) {
      await remove(ref(rtdb, `sessions/${sessionCode}/questions/${id}`));
    }
  };

  const openEditForm = (q) => {
    setEditingId(q.id); setQType(q.type || '객관식'); setNewQText(q.text);
    if (q.type === '객관식') { setNewQOpts(q.options || ['', '', '', '']); setNewQAns(q.answer); } 
    else { setNewQShortAns(q.answer || ''); }
    setShowAddForm(true);
  };

  const toggleAliveStatus = async (studentId, currentState) => {
    await update(ref(rtdb, `sessions/${sessionCode}/participants/${studentId}`), { isAlive: !currentState });
  };

  const resetSession = () => {
    if(window.confirm("문항은 그대로 두고, 학생 기록과 답안만 모두 초기화하시겠습니까?")) {
       update(ref(rtdb, `sessions/${sessionCode}`), { participants: null, answers: null });
       setCurrentQ(1);
       setIsQuizStarted(false);
       setIsQuizEnded(false);
       setIsRevealedLocal(false);
    }
  };

  const startQuiz = () => {
    if (questions.length === 0) return alert("출제된 문항이 없습니다. 문항을 먼저 추가해주세요.");
    setIsQuizStarted(true);
    setIsQuizEnded(false);
    setQuestionStartTime(Date.now());
  };

  const endQuiz = () => {
    if(window.confirm("퀴즈를 정말 종료하시겠습니까? 학생 화면에 최종 결과가 표시됩니다.")) {
      setIsQuizEnded(true);
    }
  };

  const exportToCSV = () => {
    if (totalList.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const BOM = "\uFEFF";
    const headers = ["이름", "최종 생존 여부", "접속 시간"];
    const rows = totalList.map(p => [
      p.name, p.isAlive !== false ? '생존' : '탈락', new Date(p.joinedAt).toLocaleString()
    ]);
    const csvContent = BOM + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `퀴즈결과_${sessionCode}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleSaveToLibrary = async () => {
    if (questions.length === 0) return alert("저장할 문항이 없습니다.");
    if (!newSetName.trim()) return alert("퀴즈 세트의 이름을 입력해주세요.");
    try {
      const libraryRef = ref(rtdb, 'quizLibrary');
      const newSetRef = push(libraryRef);
      await set(newSetRef, { title: newSetName.trim(), questions: questions, createdAt: Date.now() });
      alert(`[${newSetName}] 세트가 보관함에 저장되었습니다.`);
      setNewSetName('');
    } catch (e) { alert("보관함 저장 실패"); }
  };

  const handleLoadFromLibrary = async (targetQuestions, title) => {
    if (window.confirm(`[${title}] 세트를 불러오시겠습니까? 기존 문항은 덮어씌워집니다.`)) {
      const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
      const updates = {};
      targetQuestions.forEach(q => { if(q) updates[q.id] = q; });
      await set(qRef, updates);
      setCurrentQ(1); setIsQuizStarted(false); setIsQuizEnded(false); setIsRevealedLocal(false);
      setShowLibraryModal(false);
    }
  };

  const handleDeleteFromLibrary = async (setId, title) => {
    if (window.confirm(`보관함에서 [${title}] 세트를 영구 삭제하시겠습니까?`)) {
      await remove(ref(rtdb, `quizLibrary/${setId}`));
    }
  };

  // 실시간 보기 분포도 통계 계산 파트
  const currentQuestionData = questions.find(q => q.id === currentQ) || {};
  const optionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const subjectiveDistribution = {};

  submittedList.forEach(student => {
    const ans = answersData[student.id]?.answer;
    if (currentQuestionData.type === '주관식') {
      const textAns = String(ans || '').trim();
      if (textAns) subjectiveDistribution[textAns] = (subjectiveDistribution[textAns] || 0) + 1;
    } else {
      if (optionCounts[ans] !== undefined) optionCounts[ans]++;
    }
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 relative">
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-indigo-900 tracking-tight">실시간 퀴즈 대시보드</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowLibraryModal(true)} className="text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors">
            📁 퀴즈 보관함 관리
          </button>
          <button onClick={resetSession} className="text-sm font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg hover:bg-red-100 transition-colors">
            🔄 학생기록 초기화
          </button>
          <div onClick={changeSessionCode} className="bg-indigo-50 hover:bg-indigo-100 cursor-pointer px-4 py-2 rounded-lg border border-indigo-200 flex items-center gap-3 transition-colors">
            <span className="text-sm text-indigo-600 font-bold">입장 코드</span>
            <span className="text-2xl font-black text-indigo-900 tracking-widest">{sessionCode}</span>
          </div>
          <button onClick={openPresentation} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-lg shadow-md transition-colors">
            새 창으로 띄우기
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-screen-2xl mx-auto w-full">
        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1">
            <h2 className="text-lg font-bold border-b border-slate-100 pb-3 mb-4 text-slate-800">진행 옵션 및 현황</h2>
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 block">타이머 설정</span>
                <select value={timerSec} onChange={(e) => setTimerSec(Number(e.target.value))} className="p-1.5 border border-slate-300 rounded font-bold text-sm bg-white">
                  <option value={0}>수동 조작</option>
                  <option value={15}>15초</option>
                  <option value={30}>30초</option>
                  <option value={60}>1분</option>
                </select>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-bold text-slate-700 block">서바이벌 모드</span>
                  <span className="text-[10px] text-slate-400">오답자 즉시 관전 전환</span>
                </div>
                <input type="checkbox" checked={isSurvivalMode} onChange={() => setIsSurvivalMode(!isSurvivalMode)} className="w-5 h-5 accent-red-500" />
              </label>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <button onClick={() => { setModalTab('all'); setShowModal(true); }} className="w-full flex justify-between items-end p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors">
                <span className="text-xs font-bold text-slate-500">접속자 수</span>
                <span className="text-2xl font-black text-indigo-600">{participantsCount}<span className="text-sm font-medium ml-1">명</span></span>
              </button>
              {isSurvivalMode && (
                <button onClick={() => { setModalTab('survivors'); setShowModal(true); }} className="w-full flex justify-between items-end p-3 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 transition-colors">
                  <span className="text-xs font-bold text-red-500">생존자 수</span>
                  <span className="text-2xl font-black text-red-600">{survivorsCount}<span className="text-sm font-medium ml-1">명</span></span>
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setModalTab('submitted'); setShowModal(true); }} className="flex-1 p-3 bg-green-50 hover:bg-green-100 rounded-xl border border-green-100 flex flex-col items-center transition-colors">
                  <span className="text-[10px] font-bold text-green-600 mb-1">제출</span>
                  <span className="text-xl font-black text-green-700">{submittedList.length}</span>
                </button>
                <button onClick={() => { setModalTab('pending'); setShowModal(true); }} className="flex-1 p-3 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-100 flex flex-col items-center transition-colors">
                  <span className="text-[10px] font-bold text-amber-600 mb-1">미제출</span>
                  <span className="text-xl font-black text-amber-700">{pendingList.length}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-lg font-bold text-slate-800">출제된 문항 / 실시간 통계</h2>
            <button onClick={() => { setEditingId(null); setShowAddForm(!showAddForm); }} className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md hover:bg-indigo-100">
              {showAddForm && !editingId ? '닫기' : '+ 새 문항 추가'}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2">
            {showAddForm && (
              <div className="bg-indigo-50 p-4 rounded-xl mb-4 border border-indigo-200">
                <div className="flex gap-2 mb-3">
                  <select value={qType} onChange={(e) => setQType(e.target.value)} className="p-2 text-sm rounded-lg font-bold border border-slate-300">
                    <option value="객관식">객관식</option>
                    <option value="주관식">주관식(서술형)</option>
                  </select>
                  <input type="text" placeholder="질문을 입력하세요" value={newQText} onChange={(e) => setNewQText(e.target.value)} className="flex-1 p-2 text-sm rounded-lg border border-slate-300 font-bold" />
                </div>
                {qType === '객관식' ? (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {newQOpts.map((opt, i) => (
                      <input key={i} placeholder={`보기 ${i+1}`} value={opt} onChange={(e) => { const arr = [...newQOpts]; arr[i] = e.target.value; setNewQOpts(arr); }} className="p-2 rounded-lg border border-slate-300 text-sm" />
                    ))}
                  </div>
                ) : (
                  <div className="mb-4">
                    <input type="text" placeholder="정답 (쉼표로 구분)" value={newQShortAns} onChange={(e) => setNewQShortAns(e.target.value)} className="w-full p-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                )}
                <div className="flex justify-between items-center">
                  {qType === '객관식' ? (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">정답:</span>
                      <select value={newQAns} onChange={(e) => setNewQAns(Number(e.target.value))} className="p-1 rounded-lg border text-sm">
                        {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}번</option>)}
                      </select>
                    </div>
                  ) : <div></div>}
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg">취소</button>
                    <button onClick={handleSaveQuestion} className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs">{editingId ? '수정 완료' : '저장하기'}</button>
                  </div>
                </div>
              </div>
            )}

            {/* 정답 공개 시 상단에 실시간 피드백 분석 차트 표출 */}
            {isRevealedLocal && isQuizStarted && (
              <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
                <h3 className="text-sm font-black text-indigo-900 mb-3">📊 문항 응답 분석 결과</h3>
                {currentQuestionData.type === '주관식' ? (
                  <div className="space-y-2 text-xs">
                    {Object.entries(subjectiveDistribution).length > 0 ? Object.entries(subjectiveDistribution).map(([text, count]) => {
                      const pct = ((count / submittedList.length) * 100).toFixed(0);
                      return (
                        <div key={text} className="flex items-center gap-2">
                          <span className="w-24 font-bold truncate text-slate-700">{text}</span>
                          <div className="flex-1 bg-slate-200 h-5 rounded-md overflow-hidden relative">
                            <div className="bg-indigo-500 h-full transition-all" style={{ width: `${pct}%` }}></div>
                            <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-slate-700">{count}명 ({pct}%)</span>
                          </div>
                        </div>
                      );
                    }) : <p className="text-slate-400 font-bold text-center py-2">제출된 주관식 답안이 없습니다.</p>}
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {[1, 2, 3, 4].map(num => {
                      const count = optionCounts[num];
                      const total = submittedList.length || 1;
                      const pct = ((count / total) * 100).toFixed(0);
                      const isAns = num === currentQuestionData.answer;
                      return (
                        <div key={num} className="flex items-center gap-2">
                          <span className={`w-12 font-bold ${isAns ? 'text-emerald-600' : 'text-slate-500'}`}>{num}번 보기</span>
                          <div className="flex-1 bg-slate-200 h-5 rounded-md overflow-hidden relative">
                            <div className={`${isAns ? 'bg-emerald-500' : 'bg-slate-400'} h-full transition-all`} style={{ width: `${pct}%` }}></div>
                            <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-bold text-slate-800">{count}명 ({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              {questions.map((q) => {
                const isPlaying = q.id === currentQ && isQuizStarted && !isQuizEnded;
                return (
                  <div key={q.id} className={`p-4 border rounded-xl flex items-start gap-4 ${isPlaying ? 'bg-indigo-50 border-indigo-300 ring-2' : 'bg-white border-slate-200'}`}>
                    <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>{q.id}</div>
                    <div className="flex-1 pt-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${q.type === '주관식' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{q.type || '객관식'}</span>
                          <p className={`font-bold mt-1 text-sm ${isPlaying ? 'text-indigo-900' : 'text-slate-700'}`}>{q.text}</p>
                          <p className="text-xs text-slate-500 mt-1">정답: {q.answer}{q.type === '객관식' && '번'}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => openEditForm(q)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">수정</button>
                          <button onClick={() => handleDeleteQuestion(q.id)} className="text-[10px] font-bold text-slate-400 hover:text-red-600">삭제</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-slate-800 rounded-2xl p-6 flex flex-col text-white">
          <h2 className="text-lg font-bold border-b border-slate-600 pb-3 mb-6">방송 컨트롤러</h2>
          {!isQuizStarted && !isQuizEnded ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-6">🎬</div>
              <p className="text-slate-400 font-bold mb-8">학생들이 모두 접속했나요?</p>
              <button onClick={startQuiz} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-6 rounded-xl text-2xl shadow-lg transition-transform active:scale-95">
                ▶ 퀴즈 시작하기
              </button>
            </div>
          ) : isQuizEnded ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-6">🏆</div>
              <p className="text-amber-400 font-bold mb-2">모든 퀴즈가 종료되었습니다.</p>
              <h3 className="text-3xl font-black text-white">최종 생존자: {survivorsCount}명</h3>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-4">
              <div className="text-center mb-4">
                <span className="text-slate-400 font-bold text-sm uppercase">Now Playing</span>
                <div className="text-6xl font-black mt-2">Q{currentQ}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handlePrevQuestion} className="bg-slate-600 hover:bg-slate-500 font-bold py-5 rounded-xl text-lg">◀ 이전</button>
                <button onClick={handleNextQuestion} className="bg-blue-500 hover:bg-blue-400 font-bold py-5 rounded-xl text-lg">다음 ▶</button>
              </div>
              <button onClick={handleRevealAnswer} disabled={isRevealedLocal} className={`w-full font-black py-5 rounded-xl text-xl mt-2 transition-colors ${isRevealedLocal ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg'}`}>
                {isRevealedLocal ? '정답 공개 완료' : (timerSec > 0 ? '자동 공개 대기 중...' : '정답 수동 공개')}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 mt-8 pt-6 border-t border-slate-600">
            <button onClick={endQuiz} disabled={isQuizEnded} className={`font-bold py-4 rounded-xl transition-colors ${isQuizEnded ? 'bg-slate-700 text-slate-500' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
              ◼ 퀴즈 종료
            </button>
            <button onClick={exportToCSV} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-colors">
              📊 CSV 다운로드
            </button>
          </div>
        </div>
      </main>

      {/* 보관함 관리 모달 */}
      {showLibraryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-200 shrink-0 bg-indigo-900 text-white">
              <h2 className="text-xl font-black">📁 나의 퀴즈 보관함 창고</h2>
              <p className="text-xs text-indigo-200 mt-1">퀴즈 세트를 영구 보관하고 다른 방으로 자유롭게 불러옵니다.</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-2">현재 출제된 문항({questions.length}개)을 보관함에 저장</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="예) 독도의 날 골든벨, 사회 1단원" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} className="flex-1 p-3 border border-slate-300 rounded-lg font-bold text-sm focus:outline-none focus:border-indigo-500" />
                  <button onClick={handleSaveToLibrary} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 rounded-lg text-sm transition-colors">📥 보관함에 백업</button>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-500 ml-1">저장된 퀴즈 목록</h3>
                {Object.keys(quizSets).length === 0 ? (
                  <p className="text-center py-8 text-sm text-slate-400 font-bold bg-white rounded-xl border border-dashed border-slate-300">보관함이 비어있습니다.</p>
                ) : (
                  Object.entries(quizSets).map(([id, setItem]) => (
                    <div key={id} className="p-4 bg-white border border-slate-200 rounded-xl flex justify-between items-center hover:border-slate-300 transition-colors shadow-sm">
                      <div>
                        <h4 className="font-black text-slate-800 text-base">{setItem.title}</h4>
                        <p className="text-xs text-slate-400 mt-1">총 {setItem.questions?.length || 0}개 문항 · 저장일: {new Date(setItem.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoadFromLibrary(setItem.questions, setItem.title)} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs px-3 py-2 rounded-lg transition-colors">🔄 이 방으로 불러오기</button>
                        <button onClick={() => handleDeleteFromLibrary(id, setItem.title)} className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3 py-2 rounded-lg transition-colors">삭제</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="p-4 border-t shrink-0 flex justify-end bg-white">
              <button onClick={() => setShowLibraryModal(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors">보관함 닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 명단 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex border-b border-slate-200 shrink-0">
              {[
                { id: 'all', label: `전체 (${participantsCount})` },
                { id: 'submitted', label: `제출 (${submittedList.length})` },
                { id: 'pending', label: `미제출 (${pendingList.length})` },
                { id: 'survivors', label: `생존자 (${survivorsCount})` }
              ].map(tab => (
                <button key={tab.id} onClick={() => setModalTab(tab.id)} className={`flex-1 py-4 font-bold text-sm ${modalTab === tab.id ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>{tab.label}</button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              <div className="grid grid-cols-2 gap-3">
                {(modalTab === 'all' ? totalList : modalTab === 'submitted' ? submittedList : modalTab === 'pending' ? pendingList : survivorsList).map(student => {
                  const studentAns = answersData[student.id]?.answer;
                  const isAlive = student.isAlive !== false;
                  return (
                    <div key={student.id} className={`p-3 rounded-lg border bg-white flex justify-between items-center ${isAlive ? 'border-slate-200' : 'border-red-200 opacity-70'}`}>
                      <div>
                        <span className="font-bold text-slate-800 text-sm">{student.name}</span>
                        {modalTab !== 'pending' && studentAns && <span className="ml-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">답: {studentAns}</span>}
                      </div>
                      <button onClick={() => toggleAliveStatus(student.id, isAlive)} className={`text-[10px] font-bold px-2 py-1 rounded ${isAlive ? 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600' : 'bg-red-100 text-red-600 hover:bg-emerald-100 hover:text-emerald-700'}`}>{isAlive ? '생존중' : '탈락(부활)'}</button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t shrink-0 flex justify-end bg-white">
              <button onClick={() => setShowModal(false)} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}