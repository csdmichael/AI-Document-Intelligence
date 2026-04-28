import { Routes, Route, NavLink } from "react-router-dom";
import DocumentList from "./components/DocumentList";
import ParsedDocuments from "./components/ParsedDocuments";
import DocumentDetailView from "./components/DocumentDetail";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔍 AI Document Intelligence</h1>
        <p className="subtitle">Tax Form Processing &amp; Review Portal</p>
        <nav>
          <NavLink to="/" end>
            Blob Files
          </NavLink>
          <NavLink to="/parsed">Parsed Documents</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<DocumentList />} />
          <Route path="/parsed" element={<ParsedDocuments />} />
          <Route path="/documents/:id" element={<DocumentDetailView />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
