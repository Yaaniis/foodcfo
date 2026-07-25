import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/login" className="text-sm text-slate-500 underline">
          ← Retour
        </Link>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mt-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-6">{title}</h1>
          <div className="space-y-5 text-sm text-slate-700 leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
