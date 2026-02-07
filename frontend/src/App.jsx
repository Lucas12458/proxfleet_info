import { Routes, Route } from "react-router-dom";
import UsersTable from "./pages/UserTable";
import Login from "./pages/PageAuth";

import "./App.css"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UsersTable />} />
      <Route path="/auth" element={<Login />} />
    </Routes>
  );
}
