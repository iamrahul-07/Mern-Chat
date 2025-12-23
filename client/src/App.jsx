import React, { useContext } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import ProfilePage from "./pages/Profile";
import { Toaster } from "react-hot-toast";
import { AuthContext } from "./context/AuthContext";

const App = () => {
  const { authUser, loading } = useContext(AuthContext);

  if (loading) return <div className="text-center p-10">Loading...</div>;

  return (
    <div
    className=" bg-[url('/bgImage.svg')] bg-contain ">
      <Toaster />
      <Routes>
        <Route
          path="/"
          element={authUser ? <HomePage /> : <Navigate to="/login" />}
        />
        <Route
          path="/login"
          element={!authUser ? <LoginPage /> : <Navigate to="/" />}
        />
        <Route
          path="/profile"
          element={authUser ? <ProfilePage /> : <Navigate to="/login" />}
        />
      </Routes>
    </div>
  );
};
export default App;