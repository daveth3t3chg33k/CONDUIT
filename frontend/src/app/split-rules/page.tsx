import Sidebar from "@/components/Sidebar";

export default function SplitRulesPage() {
  return (
    <div className="flex h-full">
      <Sidebar />

      <main className="flex-1 lg:ml-0 pt-16 lg:pt-0">
        <div className="px-6 lg:px-10 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Split Rules</h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure how incoming payments are divided across vendors.
              </p>
            </div>
            <button className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              New Rule
            </button>
          </div>

          {/* placeholder */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              <p>No split rules configured.</p>
              <p className="mt-1">
                Create rules to define how payments are split between your platform and vendors.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
