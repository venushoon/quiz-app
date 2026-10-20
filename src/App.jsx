import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import TeacherDashboard from './components/TeacherDashboard';
import Presentation from './components/Presentation';
import StudentPlay from './components/StudentPlay';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/host/dashboard" element={<TeacherDashboard />} />
        <Route path="/host/present" element={<Presentation />} />
        <Route path="/play" element={<StudentPlay />} />
        <Route path="*" element={<Navigate to="/host/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
}