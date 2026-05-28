import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TeacherDashboard from './components/TeacherDashboard';
import Presentation from './components/Presentation';
import StudentPlay from './components/StudentPlay';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 교사 대시보드 */}
        <Route path="/host/dashboard" element={<TeacherDashboard />} />
        {/* 프레젠테이션 (전자칠판용) */}
        <Route path="/host/present" element={<Presentation />} />
        {/* 학생용 접속 및 플레이 화면 */}
        <Route path="/play" element={<StudentPlay />} />
        {/* 잘못된 주소로 접속 시 대시보드로 이동 */}
        <Route path="*" element={<Navigate to="/host/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}