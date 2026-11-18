import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import './styles.css';

// Route-level code splitting keeps the first bundle small (admin code is never sent to guests).
const Search = lazy(() => import('./pages/Search'));
const Property = lazy(() => import('./pages/Property'));
const Book = lazy(() => import('./pages/Book'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Admin = lazy(() => import('./pages/Admin'));

function Protected({ role, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <p className="muted pad">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (role && user.role !== role) return <div className="pad"><div className="banner error">You do not have access to this page.</div></div>;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">Mumbai Boutique Hotels</Link>
      <nav>
        <NavLink to="/">Search</NavLink>
        {user && <NavLink to="/my-bookings">My bookings</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        {user ? <button className="link" onClick={logout}>Log out ({user.fullName.split(' ')[0]})</button> : <><NavLink to="/login">Log in</NavLink><NavLink to="/register">Sign up</NavLink></>}
      </nav>
    </header>
  );
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <Nav />
      <main>
        <Suspense fallback={<p className="muted pad">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Search />} />
            <Route path="/property/:id" element={<Property />} />
            <Route path="/book/:roomTypeId" element={<Protected><Book /></Protected>} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/my-bookings" element={<Protected><MyBookings /></Protected>} />
            <Route path="/admin" element={<Protected role="admin"><Admin /></Protected>} />
            <Route path="*" element={<div className="pad"><h2>Page not found</h2><Link to="/">Back to search</Link></div>} />
          </Routes>
        </Suspense>
      </main>
      <footer className="foot">© Mumbai Boutique Hotels (fictional demo)</footer>
    </AuthProvider>
  </BrowserRouter>
);
