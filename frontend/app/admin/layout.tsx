'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminNavItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/self-uploads', label: 'Self-Uploads' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/users', label: 'Users' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="border-b border-border-primary bg-surface-primary">
        <div className="container-wide py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-cormorant font-light text-3xl mb-1">
                Admin Command Center
              </h1>
              <p className="text-text-secondary text-sm font-mono">
                Sanctuary Operator Dashboard
              </p>
            </div>
            <Link href="/" className="btn-secondary">
              Exit Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="container-wide py-6">
        <nav className="flex gap-4 border-b border-border-primary mb-8 overflow-x-auto">
          {adminNavItems.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`pb-4 px-4 font-mono text-sm uppercase tracking-wider transition whitespace-nowrap ${
                  isActive
                    ? 'border-b-2 border-accent-cyan text-accent-cyan'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
