"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type AgentMetric = {
  agent_name: string;
  calls_count: number;
  analyzed_calls_count: number;
  average_score: number | null;
  lowest_score: number | null;
};

export default function Page() {
  const [rows, setRows] = useState<AgentMetric[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API_BASE_URL}/dashboard/agent-metrics`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.agents || []);
    };
    load();
  }, []);

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Agent metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Agent</th><th>Calls</th><th>Analyzed calls</th><th>Average score</th><th>Lowest score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.agent_name}>
                <td>{row.agent_name}</td>
                <td>{row.calls_count}</td>
                <td>{row.analyzed_calls_count}</td>
                <td>{row.average_score ?? "-"}</td>
                <td>{row.lowest_score ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
