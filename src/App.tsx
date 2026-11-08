import { useEffect, useState } from "react";

export function App() {
  const [status, setStatus] = useState("…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<{ status: string }>)
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("injoignable"));
  }, []);

  return (
    <main className="container">
      <h1>Riftbound TCG</h1>
      <p>Squelette de l'application (étape 1).</p>
      <p>
        État de l'API : <strong>{status}</strong>
      </p>
    </main>
  );
}
