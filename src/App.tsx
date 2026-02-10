import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LegalNotice } from './screens/LegalNotice';
import { Shop } from './screens/Shop';
import { KidsBooks } from './screens/Shop/KidsBooks';
import { ParentsBooks } from './screens/Shop/ParentsBooks';
import { BookDetails } from './screens/Shop/BookDetails';
import { CartPage } from './screens/Shop/CartPage';
import { ShippingPage } from './screens/Shop/ShippingPage';
import { ComingSoon } from './screens/Shop/ComingSoon';
import { Espace } from './screens/Espace';
import { EspaceDashboard } from './screens/Espace/EspaceDashboard';
import { MessageComposer } from './screens/Espace/MessageComposer';
import { MessageHistory } from './screens/Espace/MessageHistory';
import { EspaceSettings } from './screens/Espace/EspaceSettings';
import { WelcomeWithSplash } from './screens/Welcome/WelcomeWithSplash';

const Layout = () => {
  return (
    <Routes>
      {/* ========== NOUVEAU POINT D'ENTRÉE ========== */}
      <Route path="/" element={<Navigate to="/welcome" replace />} />
      <Route path="/welcome" element={<WelcomeWithSplash />} />

      {/* ========== MENTIONS LÉGALES ========== */}
      <Route path="/mentions-legales" element={<LegalNotice />} />

      {/* ========== BOUTIQUE (Stripe) ========== */}
      <Route path="/boutique" element={<Shop />} />
      <Route path="/boutique/livres-enfants" element={<KidsBooks />} />
      <Route path="/boutique/livres-parents" element={<ParentsBooks />} />
      <Route path="/boutique/livre/:id" element={<BookDetails />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/shipping" element={<ShippingPage />} />
      <Route path="/boutique/coming-soon/:section" element={<ComingSoon />} />

      {/* ========== ESPACE PATIENT ========== */}
      <Route path="/espace" element={<Espace />} />
      <Route path="/espace/dashboard" element={<EspaceDashboard />} />
      <Route path="/espace/nouveau-message" element={<MessageComposer />} />
      <Route path="/espace/messages" element={<MessageHistory />} />
      <Route path="/espace/parametres" element={<EspaceSettings />} />
      <Route path="/espace/*" element={<Espace />} />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <Layout />
    </Router>
  );
};

export default App;
