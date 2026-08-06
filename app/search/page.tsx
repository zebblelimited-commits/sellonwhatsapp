// app/search/page.tsx
export default function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const [results, setResults] = useState([]);

  useEffect(() => {
    async function performGlobalSearch() {
      const { collection, getDocs, query: fireQuery, where } = await import("firebase/firestore");
      
      // Note: Firestore doesn't support full-text search natively well.
      // For simple "starts with" search:
      const q = fireQuery(
        collection(db, "products"),
        where("name", ">=", query),
        where("name", "<=", query + "\uf8ff")
      );
      
      const snap = await getDocs(q);
      setResults(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    if (query) performGlobalSearch();
  }, [query]);

  return (
    <div>
      <h1>Results for "{query}"</h1>
      {/* Map through results using your product card UI */}
    </div>
  );
}