/** Navigation entre pages de résultats (catalogue, collection). */
export function Pagination({ page, nbPages, allerA }: { page: number; nbPages: number; allerA: (page: number) => void }) {
  return (
    <nav className="pagination" aria-label="Pages">
      <button className="secondaire petit" disabled={page <= 1} onClick={() => allerA(page - 1)} aria-label="Page précédente">
        ←
      </button>
      <select value={page} onChange={(e) => allerA(Number(e.target.value))} aria-label="Choisir la page">
        {Array.from({ length: nbPages }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Page {i + 1} / {nbPages}
          </option>
        ))}
      </select>
      <button className="secondaire petit" disabled={page >= nbPages} onClick={() => allerA(page + 1)} aria-label="Page suivante">
        →
      </button>
    </nav>
  );
}
