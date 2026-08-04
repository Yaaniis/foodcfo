import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg bg-app-gradient px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/login" className="text-sm text-text-muted hover:text-accent">
          ← Retour
        </Link>
        <div className="bg-surface border border-border rounded-card-lg shadow-card p-8 mt-4">
          <h2 className="font-display text-2xl font-bold tracking-tight mb-6">{title}</h2>
          <div className="space-y-5 text-sm text-text-muted leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-text [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-accent [&_a:hover]:underline">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
