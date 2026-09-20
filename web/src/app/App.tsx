import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from '../features/home/HomePage.tsx';
import { RoomPage } from '../features/room/RoomPage.tsx';
import { AdminPage } from '../features/admin/AdminPage.tsx';
import { HelpPage } from '../features/help/HelpPage.tsx';
import { AdminHelpPage } from '../features/help/AdminHelpPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:roomId" element={<RoomPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/admin/help" element={<AdminHelpPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
