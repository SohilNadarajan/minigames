import { Navigate, Route, Routes } from "react-router-dom";
import { ControllerPage } from "./features/controller/ControllerPage";
import { HomePage } from "./features/home/HomePage";
import { PuzzleGalleryPage } from "./features/home/PuzzleGalleryPage";
import { HostPage } from "./features/host/HostPage";

export default function App() {
  return (
    <div className="min-h-full bg-white text-slate-900">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/puzzles" element={<PuzzleGalleryPage />} />
        <Route path="/host/:code" element={<HostPage />} />
        <Route path="/play/:code" element={<ControllerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
