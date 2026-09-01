"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { clearToken } from "@/lib/api";

const navigation = [
  { name: "Dashboard", href: "/", current: true },
  { name: "Transactions", href: "/transactions", current: false },
  { name: "Vendors", href: "/vendors", current: false },
  { name: "Split Rules", href: "/split-rules", current: false },
  { name: "Payout Jobs", href: "/payout-jobs", current: false },
];

export default function Sidebar() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminName, setAdminName] = useState("Admin");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("conduit_admin");
      if (raw) {
        const admin = JSON.parse(raw);
        if (admin.name) setAdminName(admin.name);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleLogout() {
    clearToken();
    localStorage.removeItem("conduit_admin");
    router.push("/login");
  }

  const initial = adminName.charAt(0).toUpperCase();

  return (
    <>
      {/* mobile toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-semibold">Conduit</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:inset-auto`}
      >
        <div className="flex flex-col h-full">
          <div className="px-6 py-5 border-b border-gray-100">
            <h1 className="text-xl font-bold tracking-tight text-indigo-600">Conduit</h1>
            <p className="text-xs text-gray-500 mt-0.5">Split payment routing</p>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${item.current
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-medium">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{adminName}</p>
                <p className="text-xs text-gray-500">Admin</p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
