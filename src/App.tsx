import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './lib/userContext';
import { UpcomingGroupProvider } from './lib/upcomingGroupContext';
import { LegalNotice } from './screens/LegalNotice';
import { Shop } from './screens/Shop';
import { KidsBooks } from './screens/Shop/KidsBooks';
import { ParentsBooks } from './screens/Shop/ParentsBooks';
import { BookDetails } from './screens/Shop/BookDetails';
import { CartPage } from './screens/Shop/CartPage';
import { ShippingPage } from './screens/Shop/ShippingPage';
import { ComingSoon } from './screens/Shop/ComingSoon';
import { Espace } from './screens/Espace';
import { EspaceMain } from './screens/Espace/EspaceMain';
import { GroupeDetailPage } from './screens/Espace/GroupeDetailPage';
import { MesMessagesPage } from './screens/Espace/MesMessagesPage';
import { MesGroupesPage } from './screens/Espace/MesGroupesPage';
import { SalleVocalePage } from './screens/Espace/SalleVocalePage';
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
      <Route path="/espace/groupes/:groupeId/vocal" element={<SalleVocalePage />} />
      <Route path="/espace/groupes/:groupeId" element={<GroupeDetailPage />} />
      <Route path="/espace/mes-messages" element={<MesMessagesPage />} />
      <Route path="/espace/mes-groupes" element={<MesGroupesPage />} />
      <Route path="/espace/:section" element={<EspaceMain />} />
    </Routes>
  );
};

const App = () => {
  return (
    <Router>
      <UserProvider>
        <UpcomingGroupProvider>
          <Layout />
        </UpcomingGroupProvider>
      </UserProvider>
    </Router>
  );
};

export default App;
