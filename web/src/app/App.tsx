import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RoomPage } from '../features/room/RoomPage.tsx';
import { AdminPage } from '../features/admin/AdminPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/r/:roomId" element={<RoomPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
