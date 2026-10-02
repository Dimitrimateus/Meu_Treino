import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import AdminHome from './AdminHome';

const UsersPage = lazy(() => import('./UsersPage'));
const TypesPage = lazy(() => import('./TypesPage'));
const LibraryPage = lazy(() => import('./LibraryPage'));
const ExerciseEditPage = lazy(() => import('./ExerciseEditPage'));
const RoutineEditorPage = lazy(() => import('./RoutineEditorPage'));
const ExportPage = lazy(() => import('./ExportPage'));

export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<AdminHome />} />
      <Route path="usuarios" element={<UsersPage />} />
      <Route path="tipos" element={<TypesPage />} />
      <Route path="exercicios" element={<LibraryPage />} />
      <Route path="exercicios/:id" element={<ExerciseEditPage />} />
      <Route path="treino" element={<RoutineEditorPage />} />
      <Route path="treino/:userId" element={<RoutineEditorPage />} />
      <Route path="exportar" element={<ExportPage />} />
    </Routes>
  );
}
