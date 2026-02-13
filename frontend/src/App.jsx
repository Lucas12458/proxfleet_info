import { Routes, Route } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";
import Names from "./pages/ListFilesNames";

import "./App.css"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UsersTable />} />
      <Route path="/files" element={<Names />} />
      <Route path="/auth" element={<Login />} />
    </Routes>
  );
}
