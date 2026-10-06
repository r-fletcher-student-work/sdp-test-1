import { Link, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RepoPage } from './pages/RepoPage';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight hover:text-blue-700">
            RAT — Repo Analysis Tool
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/repo/:id" element={<RepoPage />} />
        </Routes>
      </main>
    </div>
  );
}
