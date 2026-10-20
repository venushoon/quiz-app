import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ref, onValue, update, get, set, remove, push } from 'firebase/database';
import { rtdb } from '../firebase';

export default function TeacherDashboard() {
  // --- 1. 상태 관리 ---
  const [sessionCode, setSessionCode] = useState('840219');
  const [isSurvivalMode, setIsSurvivalMode] = useState(false);
  const [showDeviceQuestion, setShowDeviceQuestion] = useState(false);
  const [isQuizStarted, setIsQuizStarted] = useState(false);
  const [isQuizEnded, setIsQuizEnded] = useState(false); 
  const [timerSec, setTimerSec] = useState(0); 

  const [participantsData, setParticipantsData] = useState({});
  const [allAnswersData, setAllAnswersData] = useState({}); 
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(1);
  const [isRevealedLocal, setIsRevealedLocal] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(0);

  // 문항 입력 에디터 상태
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [qType, setQType] = useState('객관식');
  const [newQText, setNewQText] = useState('');
  const [newQImage, setNewQImage] = useState(''); 
  const [newQOpts, setNewQOpts] = useState(['', '', '', '']);
  const [newQAns, setNewQAns] = useState(1);
  const [newQShortAns, setNewQShortAns] = useState('');

  // UI 네비게이션 및 명단 모달 상태
  const [mainTab, setMainTab] = useState('questions');
  const [showListModal, setShowListModal] = useState(false);
  const [listModalTab, setListModalTab] = useState('all'); 
  const [quizSets, setQuizSets] = useState({}); 
  const [newSetName, setNewSetName] = useState(''); 

  // 📁 자체 커스텀 모달 상태 관리
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isPrompt: false,
    promptValue: ''
  });

  // 파생 상태 계산
  const isControllerVisible = mainTab === 'questions';
  const [isControllerOpen, setIsControllerOpen] = useState(true);

  // --- 2. 최적화 및 Ref 패턴 ---
  const questionsRef = useRef(questions);
  useEffect(() => { 
    questionsRef.current = questions; 
  }, [questions]);

  const serverTimeOffsetRef = useRef(0);
  const isStateLoadedRef = useRef(false);

  useEffect(() => {
    const offsetRef = ref(rtdb, '.info/serverTimeOffset');
    const unsubOffset = onValue(offsetRef, (snap) => {
      serverTimeOffsetRef.current = snap.val() || 0;
    });
    return () => unsubOffset();
  }, []);

  const getServerTime = useCallback(() => {
    return Date.now() + serverTimeOffsetRef.current;
  }, []);

  // 커스텀 모달 열기 헬퍼 함수
  const openConfirm = (title, message, onConfirm) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isPrompt: false, promptValue: '' });
  };

  const openPrompt = (title, message, defaultValue, onConfirm) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isPrompt: true, promptValue: defaultValue });
  };

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // --- 3. Firebase 실시간 읽기 구독 ---
  // 세션 변경 또는 초기 마운트 시 기존 진행 상태를 먼저 복원하여 새로고침으로 인한 초기화 방지
  useEffect(() => {
    isStateLoadedRef.current = false;
    const stateRef = ref(rtdb, `sessions/${sessionCode}/state`);
    get(stateRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setCurrentQ(data.currentQuestion || 1);
        setIsQuizStarted(data.status === 'playing' || data.status === 'ended');
        setIsQuizEnded(data.status === 'ended');
        setShowDeviceQuestion(Boolean(data.showDeviceQuestion));
        setIsSurvivalMode(Boolean(data.isSurvivalMode));
        setIsRevealedLocal(Boolean(data.isRevealed));
        setTimerSec(data.timerSec || 0);
        if (data.startedAt) setQuestionStartTime(data.startedAt);
      }
      isStateLoadedRef.current = true;
    }).catch(() => {
      isStateLoadedRef.current = true;
    });
  }, [sessionCode]);

  useEffect(() => {
    const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
    const unsubQ = onValue(qRef, (snapshot) => {
      if (snapshot.exists()) {
        setQuestions(Object.values(snapshot.val()).sort((a, b) => a.id - b.id));
      } else {
        setQuestions([]);
      }
    });
    return () => unsubQ();
  }, [sessionCode]);

  useEffect(() => {
    const libraryRef = ref(rtdb, 'quizLibrary');
    const unsubLibrary = onValue(libraryRef, (snapshot) => {
      setQuizSets(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubLibrary();
  }, []);

  useEffect(() => {
    const participantsRef = ref(rtdb, `sessions/${sessionCode}/participants`);
    const unsubParticipants = onValue(participantsRef, (snapshot) => {
      setParticipantsData(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubParticipants();
  }, [sessionCode]);

  useEffect(() => {
    const answersRef = ref(rtdb, `sessions/${sessionCode}/answers`);
    const unsubAnswers = onValue(answersRef, (snapshot) => {
      setAllAnswersData(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubAnswers();
  }, [sessionCode]);

  // --- 4. Firebase 진행 상태 동기화 쓰기(Write) 제어 ---
  useEffect(() => {
    if (!isStateLoadedRef.current) return;

    let currentStatus = 'waiting';
    if (isQuizEnded) currentStatus = 'ended';
    else if (isQuizStarted) currentStatus = 'playing';

    const matchedQuestion = questionsRef.current.find(q => q.id === currentQ) || questionsRef.current[currentQ - 1];

    const sessionStateRef = ref(rtdb, `sessions/${sessionCode}/state`);
    update(sessionStateRef, {
      currentQuestion: currentQ,
      status: currentStatus,
      showDeviceQuestion: showDeviceQuestion,
      isSurvivalMode: isSurvivalMode,
      isRevealed: isRevealedLocal,
      correctAnswer: isRevealedLocal ? (matchedQuestion?.answer ?? null) : null,
      useTimer: timerSec > 0,
      timerSec: timerSec,
      startedAt: questionStartTime
    });
  }, [sessionCode, currentQ, showDeviceQuestion, isSurvivalMode, isRevealedLocal, timerSec, questionStartTime, isQuizStarted, isQuizEnded, questions]);

  // --- 5. 실시간 데이터 분석 및 종합 순위 연산 (useMemo 캐싱) ---
  const totalList = useMemo(() => {
    return Object.entries(participantsData).map(([id, data]) => ({ id, ...data }));
  }, [participantsData]);

  const participantsCount = totalList.length;
  const survivorsList = useMemo(() => totalList.filter(p => p.isAlive !== false), [totalList]);
  const survivorsCount = survivorsList.length;

  const currentQAnswers = useMemo(() => allAnswersData[`q${currentQ}`] || {}, [allAnswersData, currentQ]);
  const submittedList = useMemo(() => totalList.filter(p => currentQAnswers[p.id]), [totalList, currentQAnswers]);
  const pendingList = useMemo(() => totalList.filter(p => !currentQAnswers[p.id]), [totalList, currentQAnswers]);

  const checkIsCorrect = useCallback((q, studentAnswer) => {
    if (!studentAnswer) return false;
    if (q.type === '객관식') {
      return Number(studentAnswer) === Number(q.answer);
    } else {
      const validAnswers = String(q.answer).split(',').map(a => a.trim().toLowerCase());
      const textAns = String(studentAnswer).trim().toLowerCase();
      return validAnswers.includes(textAns);
    }
  }, []);

  const rankedStudentStats = useMemo(() => {
    const stats = totalList.map(student => {
      let correctCount = 0;
      const qResults = questions.map(q => {
        const ans = allAnswersData[`q${q.id}`]?.[student.id]?.answer;
        const isCorrect = checkIsCorrect(q, ans);
        if (isCorrect) correctCount++;
        return { isCorrect, ans: ans !== undefined ? ans : '-' };
      });
      return { ...student, correctCount, qResults };
    });

    stats.sort((a, b) => b.correctCount - a.correctCount);

    let currentRank = 1;
    for (let i = 0; i < stats.length; i++) {
      if (i > 0 && stats[i].correctCount < stats[i - 1].correctCount) {
        currentRank = i + 1;
      }
      stats[i].rank = currentRank;
    }
    return stats;
  }, [totalList, questions, allAnswersData, checkIsCorrect]);

  const currentQuestionData = useMemo(() => {
    return questions.find(q => q.id === currentQ) || questions[currentQ - 1] || {};
  }, [questions, currentQ]);

  const currentQStats = useMemo(() => {
    const optionCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const subjectiveDistribution = {};

    submittedList.forEach(student => {
      const ans = currentQAnswers[student.id]?.answer;
      if (currentQuestionData.type === '주관식') {
        const textAns = String(ans || '').trim();
        if (textAns) subjectiveDistribution[textAns] = (subjectiveDistribution[textAns] || 0) + 1;
      } else {
        if (optionCounts[ans] !== undefined) optionCounts[ans]++;
      }
    });
    return { optionCounts, subjectiveDistribution };
  }, [submittedList, currentQAnswers, currentQuestionData]);

  // --- 6. 제어 및 조작 핸들러 ---
  const openPresentation = () => {
    window.open(`#/host/present?code=${sessionCode}`, '_blank', 'width=1280,height=720');
  };

  const startQuiz = () => {
    if (questionsRef.current.length === 0) return alert("출제된 문항이 없습니다. 문항을 먼저 추가해주세요.");
    setMainTab('questions');
    setIsQuizStarted(true);
    setIsQuizEnded(false);
    setQuestionStartTime(getServerTime());
  };

  const endQuiz = () => {
    setIsQuizEnded(true);
    setMainTab('statistics'); 
    closeConfirm();
  };

  const handleNextQuestion = () => { 
    if (currentQ < questionsRef.current.length) {
      setCurrentQ(prev => prev + 1);
      setIsRevealedLocal(false);
      setQuestionStartTime(getServerTime());
    } 
  };
  
  const handlePrevQuestion = () => { 
    if (currentQ > 1) {
      setCurrentQ(prev => prev - 1);
      setIsRevealedLocal(false);
      setQuestionStartTime(getServerTime());
    } 
  };

  const handleRevealAnswer = useCallback(async () => {
    if (questionsRef.current.length === 0 || isRevealedLocal) return;
    const matchedQuestion = questionsRef.current.find(q => q.id === currentQ) || questionsRef.current[currentQ - 1];
    
    setIsRevealedLocal(true);

    if (isSurvivalMode) {
      try {
        const answersSnap = await get(ref(rtdb, `sessions/${sessionCode}/answers/q${currentQ}`));
        const partsSnap = await get(ref(rtdb, `sessions/${sessionCode}/participants`));

        if (partsSnap.exists() && matchedQuestion) {
          const answers = answersSnap.exists() ? answersSnap.val() : {};
          const updates = {};

          partsSnap.forEach((childSnap) => {
            const studentId = childSnap.key;
            const studentData = childSnap.val();
            if (studentData.isAlive === false) return; 

            const studentAnswer = answers[studentId]?.answer;
            let isCorrect = false;

            if (matchedQuestion.type === '객관식') {
              isCorrect = Number(studentAnswer) === Number(matchedQuestion.answer);
            } else if (matchedQuestion.type === '주관식') {
              const validAnswers = String(matchedQuestion.answer).split(',').map(a => a.trim().toLowerCase());
              const studentText = String(studentAnswer || '').trim().toLowerCase();
              isCorrect = validAnswers.includes(studentText);
            }
            if (!isCorrect) updates[`${studentId}/isAlive`] = false;
          });
          if (Object.keys(updates).length > 0) {
            await update(ref(rtdb, `sessions/${sessionCode}/participants`), updates);
          }
        }
      } catch (error) {
        console.error("서바이벌 판정 오류:", error);
      }
    }
  }, [currentQ, isSurvivalMode, sessionCode, isRevealedLocal]);

  useEffect(() => {
    if (timerSec > 0 && !isRevealedLocal && isQuizStarted && !isQuizEnded) {
      const timerId = setTimeout(() => handleRevealAnswer(), timerSec * 1000);
      return () => clearTimeout(timerId);
    }
  }, [timerSec, isRevealedLocal, currentQ, questionStartTime, isQuizStarted, isQuizEnded, handleRevealAnswer]);

  const handleSaveQuestion = async () => {
    if (!newQText.trim()) return alert("질문을 입력해주세요.");
    
    const targetId = editingId || (questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1);
    const newQuestion = {
      id: targetId, 
      type: qType, 
      text: newQText,
      image: newQImage.trim(), 
      options: qType === '객관식' ? newQOpts : null,
      answer: qType === '객관식' ? newQAns : newQShortAns
    };
    
    try {
      await set(ref(rtdb, `sessions/${sessionCode}/questions/${targetId}`), newQuestion);
      setNewQText(''); 
      setNewQImage(''); 
      setNewQOpts(['', '', '', '']); 
      setNewQAns(1); 
      setNewQShortAns('');
      setEditingId(null); 
      setShowAddForm(false);
    } catch {
      alert("문항 저장에 실패했습니다.");
    }
  };

  const executeDeleteQuestion = async (id) => {
    try {
      const remaining = questionsRef.current
        .filter(q => q.id !== id)
        .map((q, idx) => ({ ...q, id: idx + 1 }));
      const reindexedObj = {};
      remaining.forEach(q => {
        reindexedObj[q.id] = q;
      });
      await set(ref(rtdb, `sessions/${sessionCode}/questions`), Object.keys(reindexedObj).length > 0 ? reindexedObj : null);
      if (currentQ > remaining.length && remaining.length > 0) {
        setCurrentQ(remaining.length);
      }
      closeConfirm();
    } catch {
      alert("문항 삭제 실패");
    }
  };

  const openEditForm = (q) => {
    setMainTab('questions'); 
    setEditingId(q.id); 
    setQType(q.type || '객관식'); 
    setNewQText(q.text);
    setNewQImage(q.image || '');
    if (q.type === '객관식') { 
      setNewQOpts(q.options || ['', '', '', '']); 
      setNewQAns(q.answer); 
    } else { 
      setNewQShortAns(q.answer || ''); 
    }
    setShowAddForm(true);
  };

  const toggleAliveStatus = async (studentId, currentState) => {
    await update(ref(rtdb, `sessions/${sessionCode}/participants/${studentId}`), { isAlive: !currentState });
  };

  const exportToCSV = () => {
    if (totalList.length === 0) return alert("다운로드할 데이터가 없습니다.");
    const BOM = "\uFEFF";
    const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = ["종합 순위", "이름", "총 정답 수", ...questions.map(q => `Q${q.id}(${q.type})`)];
    const rows = rankedStudentStats.map(p => {
      const qAnswers = p.qResults.map(qr => escapeCsv(qr.ans));
      return [escapeCsv(`${p.rank}위`), escapeCsv(p.name), escapeCsv(p.correctCount), ...qAnswers];
    });

    const csvContent = BOM + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `퀴즈결과_${sessionCode}.csv`);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
  };

  const handleSaveToLibrary = async () => {
    if (questions.length === 0) return alert("저장할 문항이 없습니다.");
    if (!newSetName.trim()) return alert("보관할 퀴즈 이름을 입력해주세요.");
    try {
      const libraryRef = ref(rtdb, 'quizLibrary');
      await set(push(libraryRef), { title: newSetName.trim(), questions: questions, createdAt: Date.now() });
      alert(`보관함에 저장되었습니다.`);
      setNewSetName('');
    } catch { 
      alert("보관함 저장 실패"); 
    }
  };

  const handleLoadFromLibrary = async (targetQuestions) => {
    try {
      const qRef = ref(rtdb, `sessions/${sessionCode}/questions`);
      const updates = {};
      const list = Array.isArray(targetQuestions) ? targetQuestions : Object.values(targetQuestions || {});
      list.filter(Boolean).forEach((q, idx) => {
        const newId = idx + 1;
        updates[newId] = { ...q, id: newId };
      });
      await set(qRef, updates);
      
      setCurrentQ(1); 
      setIsQuizStarted(false); 
      setIsQuizEnded(false); 
      setIsRevealedLocal(false);
      setMainTab('questions'); 
      closeConfirm();
    } catch {
      alert("불러오기 실패");
    }
  };

  const handleDeleteFromLibrary = async (setId) => {
    try {
      await remove(ref(rtdb, `quizLibrary/${setId}`));
      closeConfirm();
    } catch {
      alert("보관함 삭제 실패");
    }
  };

  const executeResetSession = async () => {
    try {
      await update(ref(rtdb, `sessions/${sessionCode}`), { participants: null, answers: null });
      setCurrentQ(1); setIsQuizStarted(false); setIsQuizEnded(false); setIsRevealedLocal(false);
      closeConfirm();
    } catch { alert("기록 초기화 실패"); }
  };

  const executeCreateNewQuiz = async () => {
    try {
      await update(ref(rtdb, `sessions/${sessionCode}`), { questions: null, participants: null, answers: null });
      setCurrentQ(1); setIsQuizStarted(false); setIsQuizEnded(false); setIsRevealedLocal(false);
      setMainTab('questions'); 
      closeConfirm();
    } catch { alert("새 퀴즈 생성 실패"); }
  };

  return (
    <div className="h-[100dvh] bg-slate-100 flex flex-col font-sans text-slate-800 relative overflow-hidden select-none">
      
      {/* 💡 헤더 여백 및 폰트 크기 원상복구 */}
      <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center shrink-0 z-10 relative border-b border-slate-200">
        <h1 className="text-2xl font-black text-indigo-900 tracking-tight">
          실시간 퀴즈 대시보드
        </h1>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => openConfirm("학생 기록 초기화", "문항은 보존하고, 접속한 학생 기록과 답안을 모두 초기화하시겠습니까?", executeResetSession)} 
            className="text-sm font-bold text-red-500 bg-red-50 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors"
          >
            🔄 학생기록 초기화
          </button>
          <div 
            onClick={() => openPrompt("입장 코드 변경", "새로운 방 코드를 입력하세요.", sessionCode, (val) => {
              if (val && val.trim().length > 0) {
                setSessionCode(val.trim());
                setIsQuizStarted(false); setIsQuizEnded(false); setCurrentQ(1);
              }
              closeConfirm();
            })} 
            className="bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 cursor-pointer px-5 py-2 rounded-lg flex items-center gap-3 transition-colors"
          >
            <span className="text-sm text-indigo-600 font-bold">입장 코드</span>
            <span className="text-2xl font-black text-indigo-900 tracking-widest">{sessionCode}</span>
          </div>
          <button 
            onClick={openPresentation} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-lg shadow-md transition-colors"
          >
            새 창으로 띄우기
          </button>
        </div>
      </header>

      {/* 💡 메인 레이아웃: 여유로운 패딩(p-8)과 갭(gap-6) 원상복구 */}
      <main className="flex-1 p-4 lg:p-8 flex flex-col lg:flex-row gap-6 max-w-[1920px] mx-auto w-full lg:min-h-0 lg:overflow-hidden relative">
        
        {/* 1. 좌측 패널: 너비 280px 및 패딩 6 복구 */}
        <div className="w-full lg:w-[280px] shrink-0 flex flex-col gap-6 lg:h-full lg:overflow-y-auto pr-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col shrink-0">
            <h2 className="text-lg font-bold border-b border-slate-100 pb-3 mb-4 text-slate-800">진행 옵션 및 현황</h2>
            
            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 block">타이머 설정</span>
                <select 
                  value={timerSec} 
                  onChange={(e) => setTimerSec(Number(e.target.value))} 
                  className="p-1.5 border border-slate-300 rounded font-bold text-sm bg-white"
                >
                  <option value={0}>수동</option>
                  <option value={15}>15초</option>
                  <option value={30}>30초</option>
                  <option value={60}>1분</option>
                </select>
              </div>
              <label className="flex items-center justify-between cursor-pointer group">
                <div>
                  <span className="text-sm font-bold text-slate-700 block">서바이벌 모드</span>
                  <span className="text-[10px] text-slate-400">오답자 즉시 관전 전환</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={isSurvivalMode} 
                  onChange={() => setIsSurvivalMode(!isSurvivalMode)} 
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer" 
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <div>
                  <span className="text-sm font-bold text-slate-700 block">학생 기기에 문제 표시</span>
                  <span className="text-[10px] text-slate-400">모바일 화면에도 지문/보기 출력</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={showDeviceQuestion} 
                  onChange={() => setShowDeviceQuestion(!showDeviceQuestion)} 
                  className="w-5 h-5 accent-indigo-600 rounded cursor-pointer" 
                />
              </label>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
              <button onClick={() => { setListModalTab('all'); setShowListModal(true); }} className="w-full flex justify-between items-end p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors shadow-sm">
                <span className="text-xs font-bold text-slate-500">접속자 수</span>
                <span className="text-2xl font-black text-indigo-600">{participantsCount}<span className="text-sm font-medium ml-1 text-slate-500">명</span></span>
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setListModalTab('submitted'); setShowListModal(true); }} className="flex-1 p-3 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-100 flex flex-col items-center transition-colors shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-600 mb-1">현재 답안 제출</span>
                  <span className="text-xl font-black text-emerald-700">{submittedList.length}</span>
                </button>
                <button onClick={() => { setListModalTab('pending'); setShowListModal(true); }} className="flex-1 p-3 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-100 flex flex-col items-center transition-colors shadow-sm">
                  <span className="text-[10px] font-bold text-amber-600 mb-1">미제출</span>
                  <span className="text-xl font-black text-amber-700">{pendingList.length}</span>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col gap-2">
              <button 
                onClick={() => setMainTab('questions')} 
                className={`flex justify-start items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${mainTab === 'questions' ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                📝 문항 만들기
              </button>
              <button 
                onClick={() => setMainTab('statistics')} 
                className={`flex justify-start items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${mainTab === 'statistics' ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                📊 통계 보기
              </button>
              <button 
                onClick={() => setMainTab('library')} 
                className={`flex justify-start items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all border ${mainTab === 'library' ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                📁 퀴즈 보관함
              </button>
            </div>
          </div>
        </div>

        {/* 2. 중앙 탭 패널 프레임 */}
        <div className="flex-1 flex flex-col gap-4 lg:h-full lg:min-h-0 min-w-0">
          
          {/* TAB 1: 문항 만들기 */}
          {mainTab === 'questions' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full overflow-hidden">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 shrink-0">
                <h2 className="text-lg font-bold text-slate-900">출제된 문항 (총 {questions.length}제)</h2>
                <button 
                  onClick={() => { setEditingId(null); setShowAddForm(!showAddForm); }} 
                  className="text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-100 shadow-sm"
                >
                  {showAddForm && !editingId ? '닫기' : '+ 새 문항 추가'}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 pb-4">
                {showAddForm && (
                  <div className="bg-indigo-50/50 p-5 rounded-xl mb-6 border border-indigo-200 shadow-inner">
                    <div className="flex gap-3 mb-4">
                      <select 
                        value={qType} 
                        onChange={(e) => setQType(e.target.value)} 
                        className="p-3 text-sm rounded-lg font-bold border border-slate-300 bg-white"
                      >
                        <option value="객관식">객관식</option>
                        <option value="주관식">주관식</option>
                      </select>
                      <input 
                        type="text" 
                        placeholder="질문을 입력하세요" 
                        value={newQText} 
                        onChange={(e) => setNewQText(e.target.value)} 
                        className="flex-1 p-3 text-sm rounded-lg border border-slate-300 font-bold focus:border-indigo-500 bg-white" 
                      />
                    </div>

                    <div className="mb-4">
                      <input 
                        type="text" 
                        placeholder="이미지 주소(URL)를 복사해서 붙여넣으세요 (선택사항)" 
                        value={newQImage} 
                        onChange={(e) => setNewQImage(e.target.value)} 
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 bg-white" 
                      />
                      {newQImage && (
                        <div className="mt-3 flex items-center gap-3 bg-white p-2 rounded-lg border max-w-max">
                          <img src={newQImage} alt="미리보기" className="h-16 object-contain rounded bg-slate-50" onError={() => setNewQImage('')} />
                        </div>
                      )}
                    </div>

                    {qType === '객관식' ? (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {newQOpts.map((opt, i) => (
                          <input 
                            key={i} 
                            placeholder={`보기 ${i+1}`} 
                            value={opt} 
                            onChange={(e) => { 
                              const arr = [...newQOpts]; arr[i] = e.target.value; setNewQOpts(arr); 
                            }} 
                            className="p-3 rounded-lg border border-slate-300 text-sm bg-white" 
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mb-4">
                        <input 
                          type="text" 
                          placeholder="정답 (여러 개는 쉼표로 구분하여 입력)" 
                          value={newQShortAns} 
                          onChange={(e) => setNewQShortAns(e.target.value)} 
                          className="w-full p-3 rounded-lg border border-slate-300 text-sm bg-white" 
                        />
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center pt-3 border-t border-indigo-100">
                      {qType === '객관식' ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-500">정답:</span>
                          <select 
                            value={newQAns} 
                            onChange={(e) => setNewQAns(Number(e.target.value))} 
                            className="p-2 rounded-md border font-bold text-sm bg-white text-indigo-600"
                          >
                            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}번</option>)}
                          </select>
                        </div>
                      ) : <div />}
                      
                      <div className="flex gap-2">
                        <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-lg">취소</button>
                        <button onClick={handleSaveQuestion} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-lg text-sm shadow-sm">{editingId ? '수정 완료' : '저장하기'}</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 실시간 백분율 피드백 */}
                {isRevealedLocal && isQuizStarted && (
                  <div className="mb-6 p-5 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
                    <h3 className="text-sm font-black text-indigo-900 mb-4 flex items-center gap-2">
                      📊 현재 문항(Q{currentQ}) 실시간 응답 분석
                    </h3>
                    {currentQuestionData.type === '주관식' ? (
                      <div className="space-y-3 text-xs">
                        {Object.entries(currentQStats.subjectiveDistribution).length > 0 ? Object.entries(currentQStats.subjectiveDistribution).sort((a,b)=>b[1]-a[1]).map(([text, count]) => {
                          const total = submittedList.length || 1;
                          const pct = ((count / total) * 100).toFixed(0);
                          return (
                            <div key={text} className="flex items-center gap-3">
                              <span className="w-24 text-right font-bold text-slate-700 truncate">"{text}"</span>
                              <div className="flex-1 bg-slate-200 h-6 rounded-md overflow-hidden relative shadow-inner">
                                <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                <span className="absolute inset-0 flex items-center pl-3 font-bold text-slate-800 text-[11px]">{count}명 ({pct}%)</span>
                              </div>
                            </div>
                          );
                        }) : <p className="text-center text-slate-400 font-bold py-2">제출된 답안이 없습니다.</p>}
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        {[1, 2, 3, 4].map(num => {
                          const count = currentQStats.optionCounts[num];
                          const total = submittedList.length || 1;
                          const pct = ((count / total) * 100).toFixed(0);
                          const isAns = num === currentQuestionData.answer;
                          return (
                            <div key={num} className="flex items-center gap-3">
                              <span className={`w-16 text-right font-bold ${isAns ? 'text-emerald-600' : 'text-slate-500'}`}>{num}번 보기</span>
                              <div className="flex-1 bg-slate-200 h-6 rounded-md overflow-hidden relative shadow-inner">
                                <div className={`${isAns ? 'bg-emerald-500' : 'bg-slate-400'} h-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                                <span className="absolute inset-0 flex items-center pl-3 font-bold text-slate-900 text-[11px]">{count}명 ({pct}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 문항 뷰어 */}
                <div className="space-y-4">
                  {questions.map((q) => {
                    const isPlaying = q.id === currentQ && isQuizStarted && !isQuizEnded;
                    return (
                      <div key={q.id} className={`p-5 border rounded-xl flex items-start gap-5 transition-all ${isPlaying ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-100' : 'bg-white border-slate-200'}`}>
                        <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-sm ${isPlaying ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{q.id}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex gap-4 min-w-0 flex-1">
                              {q.image && <img src={q.image} className="w-16 h-16 rounded-lg border object-cover shrink-0 bg-slate-50" alt="썸네일" />}
                              <div className="min-w-0 flex-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${q.type === '주관식' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>{q.type || '객관식'}</span>
                                <p className={`font-bold text-sm mt-1.5 truncate ${isPlaying ? 'text-indigo-950' : 'text-slate-800'}`}>{q.text}</p>
                                <p className="text-xs font-bold text-slate-400 mt-1">정답: <span className="text-indigo-600">{q.answer}</span></p>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => openEditForm(q)} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 px-2.5 py-1.5 bg-slate-50 rounded border">수정</button>
                              <button onClick={() => openConfirm("문항 삭제", `${q.id}번 문항을 삭제하시겠습니까?`, () => executeDeleteQuestion(q.id))} className="text-[11px] font-bold text-slate-400 hover:text-red-600 px-2.5 py-1.5 bg-slate-50 rounded border">삭제</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {questions.length === 0 && <p className="text-center text-slate-400 font-bold py-12 text-sm">우측 상단의 '+ 새 문항 추가' 버튼을 눌러보세요.</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 통계 보기 */}
          {mainTab === 'statistics' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col h-full overflow-hidden animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6 shrink-0">
                <h2 className="text-2xl font-black text-slate-800">종합 분석 및 피드백</h2>
                <button onClick={exportToCSV} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-2.5 px-5 rounded-xl transition-all shadow-md">
                  📥 CSV 다운로드
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/60">
                  <h3 className="text-sm font-black text-indigo-950 mb-4">📈 문항별 정답률 통계</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {questions.map(q => {
                      let correctCount = 0;
                      totalList.forEach(student => {
                        if (checkIsCorrect(q, allAnswersData[`q${q.id}`]?.[student.id]?.answer)) correctCount++;
                      });
                      const pct = participantsCount > 0 ? ((correctCount / participantsCount) * 100).toFixed(0) : 0;
                      return (
                        <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-4 shadow-sm">
                          <span className="font-black text-slate-400 text-sm w-8">Q{q.id}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="font-bold text-slate-600 truncate pr-2">{q.text}</span>
                              <span className="font-black text-emerald-600 shrink-0">{pct}% 정답</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-emerald-500 h-full transition-all duration-700" style={{ width: `${pct}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-black text-indigo-950 mb-3 ml-1">🎖️ 학생별 종합 순위표</h3>
                  <div className="relative rounded-xl border border-slate-200 overflow-hidden shadow-inner">
                    <div className="overflow-x-auto overflow-y-auto max-h-[440px]">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 z-30 border-b">
                          <tr>
                            <th className="p-4 sticky left-0 bg-slate-50 z-40 text-center shadow-[1px_0_0_0_#e2e8f0]">순위</th>
                            <th className="p-4 sticky left-[70px] bg-slate-50 z-40 shadow-[1px_0_0_0_#e2e8f0]">이름</th>
                            <th className="p-4 sticky left-[160px] bg-slate-50 z-40 text-center shadow-[1px_0_0_0_#e2e8f0]">정답 수</th>
                            {questions.map(q => <th key={q.id} className="p-4 text-center text-xs bg-slate-50 min-w-[80px]">Q{q.id}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rankedStudentStats.map(student => (
                            <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                              <td className="p-4 text-center font-black sticky left-0 bg-white group-hover:bg-slate-50 z-20 shadow-[1px_0_0_0_#f1f5f9] text-indigo-600">{student.rank}위</td>
                              <td className="p-4 font-bold text-slate-800 sticky left-[70px] bg-white group-hover:bg-slate-50 z-20 shadow-[1px_0_0_0_#f1f5f9]">{student.name}</td>
                              <td className="p-4 text-center font-black text-emerald-600 sticky left-[160px] bg-white group-hover:bg-slate-50 z-20 shadow-[1px_0_0_0_#f1f5f9] text-base">{student.correctCount}개</td>
                              {student.qResults.map((qr, idx) => (
                                <td key={idx} className={`p-4 text-center font-bold ${qr.isCorrect ? 'text-emerald-600 bg-emerald-50/10' : 'text-red-400 bg-red-50/10'}`}>
                                  <span>{qr.isCorrect ? '⭕' : '❌'}</span>
                                  <span className="text-[10px] block font-normal text-slate-400">({qr.ans})</span>
                                </td>
                              ))}
                            </tr>
                          ))}
                          {totalList.length === 0 && <tr><td colSpan="100%" className="p-12 text-center text-slate-400 font-bold">제출된 데이터가 없습니다.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 퀴즈 보관함 */}
          {mainTab === 'library' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col h-full overflow-hidden animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6 shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">📁 퀴즈 보관함 창고</h2>
                  <p className="text-sm text-slate-500 font-medium mt-1">문제 세트를 영구 보관하고 재사용하세요.</p>
                </div>
                <button 
                  onClick={() => openConfirm("새 퀴즈 만들기", "현재 방의 모든 문제와 학생 기록을 삭제하고 백지 상태로 만드시겠습니까?", executeCreateNewQuiz)} 
                  className="bg-indigo-50 border border-indigo-200 text-indigo-600 text-sm font-bold py-2.5 px-4 rounded-xl hover:bg-indigo-100 shadow-sm"
                >
                  ✨ 싹 지우고 새 퀴즈 만들기
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-4">
                <div className="bg-indigo-50/40 p-6 rounded-2xl border border-indigo-200/50">
                  <h3 className="text-sm font-black text-indigo-950 mb-3">📤 현재 출제 문항({questions.length}개) 보관함 저장</h3>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      placeholder="예) 6학년 사회 독도 수호 골든벨" 
                      value={newSetName} 
                      onChange={(e) => setNewSetName(e.target.value)} 
                      className="flex-1 p-3.5 border border-slate-300 rounded-xl font-bold text-sm bg-white focus:border-indigo-500 focus:outline-none shadow-inner" 
                    />
                    <button onClick={handleSaveToLibrary} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 rounded-xl shadow-sm">저장하기</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-500 ml-1">📥 저장된 퀴즈 목록</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(quizSets).map(([id, setItem]) => (
                      <div key={id} className="p-5 bg-white border border-slate-200 rounded-2xl flex flex-col justify-between hover:border-indigo-400 transition-all shadow-sm">
                        <div className="mb-4">
                          <h4 className="font-black text-slate-800 text-lg">{setItem.title}</h4>
                          <p className="text-sm text-slate-500 mt-2 font-bold">문항 수: <span className="text-indigo-600">{setItem.questions?.length || 0}개</span></p>
                          <p className="text-xs text-slate-400 mt-1">저장일: {new Date(setItem.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2 mt-2 border-t pt-4 border-slate-100">
                          <button 
                            onClick={() => openConfirm("불러오기", `[${setItem.title}] 퀴즈를 불러오시겠습니까? 현재 방의 문항은 사라집니다.`, () => handleLoadFromLibrary(setItem.questions, setItem.title))} 
                            className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-sm py-2.5 rounded-xl transition-all"
                          >
                            🔄 불러오기
                          </button>
                          <button 
                            onClick={() => openConfirm("보관함 삭제", `[${setItem.title}] 퀴즈를 영구 삭제하시겠습니까?`, () => handleDeleteFromLibrary(id))} 
                            className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 text-sm font-bold rounded-xl border border-red-100 transition-all"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                    {Object.keys(quizSets).length === 0 && <p className="col-span-2 text-center py-12 text-sm font-bold text-slate-400 border-2 border-dashed rounded-xl">보관함이 비어있습니다.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. 우측 실시간 방송 컨트롤러 패널 (크기 340px 복구) */}
        <div className={`shrink-0 transition-all duration-300 ease-in-out flex flex-col h-full ${isControllerVisible && isControllerOpen ? 'lg:w-[340px] w-full opacity-100 lg:ml-2' : 'lg:w-0 w-full lg:opacity-0 overflow-hidden'}`}>
          <div className="bg-slate-800 rounded-2xl p-6 flex flex-col text-white shadow-xl h-full w-full lg:w-[340px] shrink-0">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6 shrink-0">
              <h2 className="text-base font-bold text-slate-300">방송 컨트롤러</h2>
              <button onClick={() => setIsControllerOpen(false)} className="text-slate-400 hover:text-white px-2 py-1 rounded text-xs font-bold bg-slate-700 hidden lg:block">▶ 패널 숨기기</button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center gap-4 overflow-y-auto py-2">
              {!isQuizStarted ? (
                <div className="text-center">
                  <div className="text-6xl mb-6 animate-pulse">🎬</div>
                  <p className="text-sm text-slate-400 mb-8 font-bold">학생들이 모두 접속했나요?</p>
                  <button onClick={startQuiz} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-6 rounded-xl text-2xl shadow-lg transition-transform active:scale-95">
                    ▶ 퀴즈 시작하기
                  </button>
                </div>
              ) : isQuizEnded ? (
                <div className="text-center">
                  <div className="text-6xl mb-6">🏆</div>
                  <h3 className="text-3xl font-black text-white">모든 퀴즈 종료</h3>
                  <p className="text-sm text-slate-400 mt-4">좌측 통계 보기 탭에서<br/>결과를 확인하세요.</p>
                </div>
              ) : (
                <>
                  <div className="text-center mb-2">
                    <span className="text-slate-400 font-bold text-sm uppercase">Now Playing</span>
                    <div className="text-7xl font-black mt-4 text-white">Q{currentQ}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    <button onClick={handlePrevQuestion} className="bg-slate-700 hover:bg-slate-600 font-bold py-5 rounded-xl text-lg border border-slate-600">◀ 이전</button>
                    <button onClick={handleNextQuestion} className="bg-blue-600 hover:bg-blue-500 font-bold py-5 rounded-xl text-lg">다음 ▶</button>
                  </div>
                  <button 
                    onClick={handleRevealAnswer} 
                    disabled={isRevealedLocal} 
                    className={`w-full font-black py-6 rounded-xl text-xl mt-2 transition-all shrink-0 ${isRevealedLocal ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600' : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl'}`}
                  >
                    {isRevealedLocal ? '정답 공개 완료' : (timerSec > 0 ? '자동 타이머 대기중...' : '정답 수동 공개')}
                  </button>
                </>
              )}
            </div>
            
            <div className="mt-6 pt-5 border-t border-slate-700 shrink-0">
              <button 
                onClick={() => openConfirm("퀴즈 종료", "현재 퀴즈를 끝내고 결과를 보시겠습니까?", endQuiz)} 
                disabled={isQuizEnded || !isQuizStarted} 
                className={`w-full font-bold py-4 rounded-xl text-sm transition-all ${isQuizEnded || !isQuizStarted ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'}`}
              >
                ◼ 퀴즈 종료 (결과 보기)
              </button>
            </div>
          </div>
        </div>

      </main>

      {/* 접혀있는 컨트롤러 복구 탭 바 */}
      {isControllerVisible && !isControllerOpen && (
        <button 
          onClick={() => setIsControllerOpen(true)}
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 bg-slate-800 text-white p-3 rounded-l-2xl shadow-2xl z-40 flex-col items-center gap-2 cursor-pointer hover:bg-slate-700 transition-colors"
        >
          <span className="text-lg font-black">◀</span>
          <span className="[writing-mode:vertical-rl] font-bold text-sm tracking-widest py-1 text-slate-300">컨트롤러 열기</span>
        </button>
      )}

      {/* 자체 UI 커스텀 모달 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 transform scale-100 transition-transform">
            <div className="p-5 border-b bg-slate-50 border-slate-100 flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <h3 className="text-base font-black text-slate-900">{confirmModal.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-sm font-bold text-slate-600 leading-relaxed whitespace-pre-wrap">{confirmModal.message}</p>
              
              {confirmModal.isPrompt && (
                <input 
                  type="text"
                  value={confirmModal.promptValue}
                  onChange={(e) => setConfirmModal(prev => ({ ...prev, promptValue: e.target.value }))}
                  className="w-full p-3 mt-5 border border-slate-300 rounded-xl font-black text-base text-center bg-slate-50 focus:border-indigo-500 focus:outline-none shadow-inner"
                  autoFocus
                />
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button 
                onClick={closeConfirm} 
                className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  if (confirmModal.isPrompt) {
                    confirmModal.onConfirm(confirmModal.promptValue);
                  } else {
                    confirmModal.onConfirm();
                  }
                }} 
                className="bg-slate-900 hover:bg-slate-800 text-white font-black text-sm px-6 py-2.5 rounded-xl shadow-sm transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 접속자 명단 수동 서브 모달 팝업 */}
      {showListModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in">
            <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
              {[
                { id: 'all', label: `전체 대기방 (${participantsCount})` },
                { id: 'submitted', label: `답안 제출 (${submittedList.length})` },
                { id: 'pending', label: `미제출 학생 (${pendingList.length})` },
                { id: 'survivors', label: `참여자 (${survivorsCount})` }
              ].map(tab => (
                <button 
                  key={tab.id} onClick={() => setListModalTab(tab.id)} 
                  className={`flex-1 py-4 font-black text-sm border-b-2 transition-all ${listModalTab === tab.id ? 'bg-white text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:bg-slate-100'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
              <div className="grid grid-cols-2 gap-3">
                {(
                  listModalTab === 'all' ? totalList :
                  listModalTab === 'submitted' ? submittedList :
                  listModalTab === 'pending' ? pendingList : survivorsList
                ).map(student => {
                  const studentAns = currentQAnswers[student.id]?.answer;
                  const isAlive = student.isAlive !== false;
                  return (
                    <div key={student.id} className={`p-3 rounded-xl border bg-white flex justify-between items-center shadow-sm transition-all ${isAlive ? 'border-slate-200' : 'border-red-100 opacity-60'}`}>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-slate-800 text-sm block truncate">{student.name}</span>
                        {listModalTab !== 'pending' && studentAns && (
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded mt-1 inline-block">제출: {studentAns}</span>
                        )}
                      </div>
                      <button 
                        onClick={() => toggleAliveStatus(student.id, isAlive)} 
                        className={`text-xs font-black px-3 py-1.5 rounded-lg border ${isAlive ? 'bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600' : 'bg-red-50 text-red-600 hover:bg-emerald-50 hover:text-emerald-600'}`}
                      >
                        {isAlive ? '참여중' : '탈락(부활)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t shrink-0 flex justify-end bg-white">
              <button onClick={() => setShowListModal(false)} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-sm rounded-xl shadow-sm">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}